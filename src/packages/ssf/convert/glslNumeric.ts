import type { Token } from './glslText';
import {
    findFunctions,
    isIntegerLiteral,
    isIntegralType,
    isTypeKeyword,
    matchingClose,
    significant,
    tokenize,
} from './glslText';

interface Expression {
    start: number;
    end: number;
    type: string;
    integralLiterals?: Token[];
}

const PRECEDENCE = new Map<string, number>([
    ['=', 1],
    ['+=', 1],
    ['-=', 1],
    ['*=', 1],
    ['/=', 1],
    ['%=', 1],
    ['||', 3],
    ['^^', 4],
    ['&&', 5],
    ['|', 6],
    ['^', 7],
    ['&', 8],
    ['==', 9],
    ['!=', 9],
    ['<', 10],
    ['>', 10],
    ['<=', 10],
    ['>=', 10],
    ['<<', 11],
    ['>>', 11],
    ['+', 12],
    ['-', 12],
    ['*', 13],
    ['/', 13],
    ['%', 13],
]);
const FLOAT_FUNCTIONS = new Set([
    'radians',
    'degrees',
    'sin',
    'cos',
    'tan',
    'asin',
    'acos',
    'atan',
    'sinh',
    'cosh',
    'tanh',
    'pow',
    'exp',
    'log',
    'exp2',
    'log2',
    'sqrt',
    'inversesqrt',
    'floor',
    'trunc',
    'round',
    'roundEven',
    'ceil',
    'fract',
    'mod',
    'mix',
    'step',
    'smoothstep',
    'length',
    'distance',
    'dot',
    'cross',
    'normalize',
    'faceforward',
    'reflect',
    'refract',
    'dFdx',
    'dFdy',
    'fwidth',
]);
const GENERIC_FUNCTIONS = new Set(['min', 'max', 'clamp', 'abs', 'sign']);
const FLOAT_TYPE = /^(?:float|vec[234]|mat\w*)$/;

function statementEnd(tokens: readonly Token[], sig: readonly number[], start: number): number {
    const text = tokens[sig[start]]?.text;
    if (text === '{') return matchingClose(tokens, sig, start);
    if (['for', 'if', 'while', 'switch'].includes(text) && tokens[sig[start + 1]]?.text === '(') {
        const close = matchingClose(tokens, sig, start + 1);
        if (close === -1) return sig.length;
        const end = statementEnd(tokens, sig, close + 1);
        return tokens[sig[end + 1]]?.text === 'else' ? statementEnd(tokens, sig, end + 2) : end;
    }
    for (let s = start; s < sig.length; s++) {
        if (tokens[sig[s]].text === '(' || tokens[sig[s]].text === '[') s = matchingClose(tokens, sig, s);
        if (s < 0 || tokens[sig[s]].text === ';') return s < 0 ? sig.length : s;
    }
    return sig.length;
}

/**
 * Adds explicit numeric conversions while keeping integral subexpressions integral.
 * Supplying `preservedLiterals` records integral arithmetic literals without changing source.
 */
export function promoteDesktopNumericExpressions(
    tokens: Token[],
    integralNames: Iterable<string> = [],
    preservedLiterals?: Set<Token>
): number {
    const sig = significant(tokens);
    const text = (position: number): string => tokens[sig[position]]?.text ?? '';
    const functions = findFunctions(tokens);
    const types = new Map<string, Array<{ position: number; end: number; type: string }>>();
    const add = (name: string, position: number, end: number, type: string): void => {
        const entries = types.get(name) ?? [];
        entries.push({ position, end, type });
        types.set(name, entries);
    };
    for (const name of ['PASSINDEX', 'bl_pass', 'bl_frame', ...integralNames]) add(name, -1, sig.length, 'int');
    const parameters: Array<{ start: number; end: number; scopeEnd: number }> = [];
    for (let s = 0; s < sig.length - 2; s++) {
        if (!isTypeKeyword(text(s)) || tokens[sig[s + 1]].kind !== 'ident' || text(s + 2) !== '(') continue;
        const end = matchingClose(tokens, sig, s + 2);
        if (end === -1 || text(end + 1) !== '{') continue;
        parameters.push({ start: s + 2, end, scopeEnd: matchingClose(tokens, sig, end + 1) });
    }
    const scopeEnds: number[] = [];
    const loops: Array<{ start: number; headerEnd: number; end: number }> = [];
    for (let s = 0; s < sig.length - 1; s++) {
        if (text(s) !== 'for' || text(s + 1) !== '(') continue;
        const headerEnd = matchingClose(tokens, sig, s + 1);
        if (headerEnd === -1) continue;
        const end = statementEnd(tokens, sig, headerEnd + 1);
        loops.push({ start: s + 1, headerEnd, end });
    }
    for (let s = 0; s < sig.length; s++) {
        if (text(s) === '{') scopeEnds.push(matchingClose(tokens, sig, s));
        if (text(s) === '}') scopeEnds.pop();
        if (tokens[sig[s]].kind === 'directive') {
            const match = /^#\s*define\s+(\w+)\s+(.+)$/.exec(text(s).trim());
            if (match) {
                const value = tokenize(match[2]).filter(token => token.kind !== 'trivia');
                if (
                    /^(?:int|uint|[iu]vec[234])\s*\(/.test(match[2]) ||
                    (value.some(token => token.kind === 'number') &&
                        value.every(
                            token => token.kind === 'punct' || (token.kind === 'number' && isIntegerLiteral(token.text))
                        ))
                )
                    add(match[1], s, sig.length, 'int');
            }
        }
        if (!isTypeKeyword(text(s)) || tokens[sig[s + 1]]?.kind !== 'ident' || text(s + 2) === '(') continue;
        let end = scopeEnds.at(-1) ?? sig.length;
        const parameterFunction = parameters.find(span => span.start < s && s < span.end);
        if (parameterFunction) end = parameterFunction.scopeEnd;
        const loop = loops.find(span => span.start < s && s < span.headerEnd);
        if (loop) end = loop.end;
        add(text(s + 1), s + 1, end, text(s));
        let depth = 0;
        for (let q = s + 2; q < sig.length; q++) {
            if (text(q) === '(' || text(q) === '[') depth++;
            else if (text(q) === ')' || text(q) === ']') {
                if (depth === 0) break;
                depth--;
            } else if (depth === 0 && [';', '{', '}'].includes(text(q))) break;
            else if (depth === 0 && text(q) === ',' && tokens[sig[q + 1]]?.kind === 'ident')
                add(text(q + 1), q + 1, end, text(s));
        }
    }
    const typeAt = (name: string, position: number): string => {
        const entries = types.get(name);
        const entry = entries
            ?.slice()
            .reverse()
            .find(candidate => candidate.position <= position && position < candidate.end);
        if (entry) return entry.type;
        if (name === 'true' || name === 'false') return 'bool';
        if (name === 'syn_Media' || name === 'syn_UserImage') return 'sampler2D';
        return 'float';
    };
    const before = new Map<number, string>();
    const after = new Map<number, string>();
    let changed = 0;
    const promote = (expression: Expression, target?: string): void => {
        if (!isIntegralType(expression.type)) return;
        const cast = target ?? (/^[iu]vec/.test(expression.type) ? expression.type.replace(/^[iu]/, '') : 'float');
        if (!FLOAT_TYPE.test(cast)) return;
        const start = sig[expression.start];
        const end = sig[expression.end - 1];
        if (preservedLiterals) {
            expression.type = cast;
            expression.integralLiterals = undefined;
            return;
        }
        if (
            expression.end === expression.start + 1 &&
            tokens[start].kind === 'number' &&
            /^\d+$/.test(tokens[start].text) &&
            cast === 'float'
        ) {
            tokens[start].text += '.0';
        } else if (
            text(expression.start) === '(' &&
            matchingClose(tokens, sig, expression.start) === expression.end - 1
        ) {
            tokens[start].text = `${cast}(`;
        } else {
            before.set(start, `${cast}(${before.get(start) ?? ''}`);
            after.set(end, `${after.get(end) ?? ''})`);
        }
        expression.type = cast;
        expression.integralLiterals = undefined;
        changed++;
    };
    const unify = (left: Expression, right: Expression): void => {
        if (FLOAT_TYPE.test(left.type)) promote(right);
        if (FLOAT_TYPE.test(right.type)) promote(left);
    };
    let cursor = 0;
    const parse = (minimum = 1): Expression | undefined => {
        const start = cursor;
        const token = tokens.at(sig[cursor] ?? tokens.length);
        if (!token || token.kind === 'directive') return undefined;
        let node: Expression;
        if (['+', '-', '!', '~', '++', '--'].includes(token.text)) {
            cursor++;
            const operand = parse(14);
            if (!operand) return undefined;
            node = {
                start,
                end: cursor,
                type: token.text === '!' ? 'bool' : operand.type,
                integralLiterals: operand.integralLiterals,
            };
        } else if (token.text === '(') {
            cursor++;
            const inside = parse();
            if (!inside || text(cursor) !== ')') return undefined;
            cursor++;
            node = { start, end: cursor, type: inside.type, integralLiterals: inside.integralLiterals };
        } else if (token.kind === 'number' || token.kind === 'ident') {
            cursor++;
            let type = typeAt(token.text, start);
            if (token.kind === 'number') type = isIntegerLiteral(token.text) ? 'int' : 'float';
            node = {
                start,
                end: cursor,
                type,
                integralLiterals: token.kind === 'number' && isIntegerLiteral(token.text) ? [token] : undefined,
            };
            if (text(cursor) === '(' && token.kind === 'ident') {
                cursor++;
                const args: Expression[] = [];
                while (text(cursor) !== ')' && cursor < sig.length) {
                    const arg = parse();
                    if (!arg) return undefined;
                    args.push(arg);
                    if (text(cursor) !== ',') break;
                    cursor++;
                }
                if (text(cursor) !== ')') return undefined;
                cursor++;
                const signatures = functions.filter(
                    fn => fn.name === token.text && fn.parameterTypes.length === args.length
                );
                const signature =
                    signatures.find(fn =>
                        fn.parameterTypes.every((parameterType, index) => parameterType === args[index].type)
                    ) ?? signatures.at(0);
                if (signature)
                    for (const [index, arg] of args.entries()) {
                        if (FLOAT_TYPE.test(signature.parameterTypes[index]))
                            promote(arg, signature.parameterTypes[index]);
                    }
                else if (FLOAT_FUNCTIONS.has(token.text) || token.text.startsWith('_'))
                    for (const arg of args) promote(arg);
                else if (GENERIC_FUNCTIONS.has(token.text) && args.some(arg => FLOAT_TYPE.test(arg.type)))
                    for (const arg of args) promote(arg);
                let callType = signature?.returnType ?? 'float';
                if (isTypeKeyword(token.text)) callType = token.text;
                else if (token.text === 'textureSize') callType = 'ivec2';
                else if (token.text === 'texelFetch' || token.text.startsWith('texture')) callType = 'vec4';
                else if (!signature && GENERIC_FUNCTIONS.has(token.text)) callType = args.at(0)?.type ?? 'float';
                const integralLiterals =
                    GENERIC_FUNCTIONS.has(token.text) && args.every(arg => isIntegralType(arg.type))
                        ? args.flatMap(arg => arg.integralLiterals ?? [])
                        : undefined;
                if (integralLiterals) for (const literal of integralLiterals) preservedLiterals?.add(literal);
                node = { start, end: cursor, type: callType, integralLiterals };
            }
        } else return undefined;
        while (cursor < sig.length) {
            const operator = text(cursor);
            if (operator === '.') {
                const member = text(cursor + 1);
                if (/^[xyzwrgba]{1,4}$/.test(member)) {
                    if (member.length === 1) node.type = isIntegralType(node.type) ? 'int' : 'float';
                    else node.type = `${isIntegralType(node.type) ? 'ivec' : 'vec'}${member.length}`;
                } else node.type = 'float';
                cursor += 2;
                node.end = cursor;
                continue;
            }
            if (operator === '[') {
                cursor++;
                parse();
                if (text(cursor) !== ']') break;
                cursor++;
                if (/vec[234]$/.test(node.type)) node.type = isIntegralType(node.type) ? 'int' : 'float';
                else if (!types.has(text(node.start))) node.type = 'unknown';
                node.end = cursor;
                continue;
            }
            if (operator === '++' || operator === '--') {
                cursor++;
                node.end = cursor;
                continue;
            }
            if (operator === '?' && minimum <= 2) {
                cursor++;
                const yes = parse();
                if (!yes || text(cursor) !== ':') break;
                cursor++;
                const no = parse(2);
                if (!no) break;
                unify(yes, no);
                node = { start, end: cursor, type: yes.type };
                continue;
            }
            const precedence = PRECEDENCE.get(operator);
            if (precedence === undefined || precedence < minimum) break;
            cursor++;
            const right = parse(precedence + (precedence === 1 ? 0 : 1));
            if (!right) break;
            if (precedence === 1) {
                if (FLOAT_TYPE.test(node.type)) promote(right, /^[iu]vec/.test(right.type) ? node.type : undefined);
            } else if (!['%', '<<', '>>', '&', '|', '^', '&&', '||', '^^'].includes(operator)) unify(node, right);
            let type = node.type;
            if ((precedence >= 9 && precedence <= 10) || ['&&', '||', '^^'].includes(operator)) type = 'bool';
            else if (precedence !== 1 && !FLOAT_TYPE.test(type)) type = right.type;
            const integralLiterals = isIntegralType(type)
                ? [...(node.integralLiterals ?? []), ...(right.integralLiterals ?? [])]
                : undefined;
            if (precedence > 1 && integralLiterals)
                for (const literal of integralLiterals) preservedLiterals?.add(literal);
            node = { start, end: cursor, type, integralLiterals };
        }
        return node;
    };
    const keywords = new Set([
        'if',
        'for',
        'while',
        'switch',
        'do',
        'else',
        'break',
        'continue',
        'discard',
        'const',
        'uniform',
        'highp',
        'mediump',
        'lowp',
        'in',
        'out',
        'inout',
        'struct',
    ]);
    for (let s = 0; s < sig.length;) {
        if (isTypeKeyword(text(s)) && tokens[sig[s + 1]]?.kind === 'ident' && text(s + 2) === '(') {
            const close = matchingClose(tokens, sig, s + 2);
            s = close === -1 ? s + 1 : close + 1;
            continue;
        }
        if ((isTypeKeyword(text(s)) && tokens[sig[s + 1]]?.kind === 'ident') || keywords.has(text(s))) {
            s++;
            continue;
        }
        if (text(s) === 'return') {
            cursor = s + 1;
            const node = parse();
            const fn = functions.find(candidate => candidate.bodyStart < sig[s] && candidate.bodyEnd > sig[s]);
            if (node && fn && FLOAT_TYPE.test(fn.returnType)) promote(node, fn.returnType);
            s = Math.max(s + 1, cursor);
            continue;
        }
        cursor = s;
        parse();
        s = Math.max(s + 1, cursor);
    }
    if (!preservedLiterals)
        for (let index = 0; index < tokens.length; index++)
            tokens[index].text = `${before.get(index) ?? ''}${tokens[index].text}${after.get(index) ?? ''}`;
    return changed;
}

/** Exposes generic numeric macro arguments to type adaptation without changing their substitution. */
export function expandGenericNumericMacros(tokens: Token[]): number {
    let changed = 0;
    for (;;) {
        const macros = new Map<string, { parameters: string[]; body: Token[] }>();
        const sig = significant(tokens);
        let rewritten = false;
        for (let s = 0; s < sig.length; s++) {
            const token = tokens[sig[s]];
            if (token.kind === 'directive') {
                const undef = /^#\s*undef\s+(\w+)/.exec(token.text);
                if (undef) macros.delete(undef[1]);
                const definition = /^#\s*define\s+(\w+)\(([^)]*)\)\s+(.+)$/.exec(token.text.trim());
                if (!definition) continue;
                const body = tokenize(definition[3]);
                const code = significant(body);
                const parameters = definition[2].split(',').map(parameter => parameter.trim());
                if (
                    parameters.some(parameter => !/^[A-Za-z_]\w*$/.test(parameter)) ||
                    !GENERIC_FUNCTIONS.has(body[code[0]]?.text)
                )
                    continue;
                if (body[code[1]]?.text !== '(' || matchingClose(body, code, 1) !== code.length - 1) continue;
                macros.set(definition[1], { parameters, body });
                continue;
            }
            const macro = macros.get(token.text);
            if (!macro || tokens[sig[s + 1]]?.text !== '(') continue;
            const close = matchingClose(tokens, sig, s + 1);
            if (close === -1) continue;
            const args: Token[][] = [];
            let from = sig[s + 1] + 1;
            let depth = 0;
            for (let q = s + 2; q <= close; q++) {
                const value = tokens[sig[q]].text;
                if (q === close || (value === ',' && depth === 0)) {
                    args.push(tokens.slice(from, sig[q]));
                    from = sig[q] + 1;
                } else if (value === '(' || value === '[') depth++;
                else if (value === ')' || value === ']') depth--;
            }
            if (args.length !== macro.parameters.length) continue;
            const expanded: Token[] = [{ kind: 'punct', text: '(' }];
            for (const part of macro.body) {
                const index = part.kind === 'ident' ? macro.parameters.indexOf(part.text) : -1;
                if (index !== -1) expanded.push(...args[index].map(argument => ({ ...argument })));
                else expanded.push({ ...part });
            }
            expanded.push({ kind: 'punct', text: ')' });
            tokens.splice(sig[s], sig[close] - sig[s] + 1, ...expanded);
            changed++;
            rewritten = true;
            break;
        }
        if (!rewritten || changed > 10_000) return changed;
    }
}

/** Moves an opaque sampler choice outside its consuming function call. */
export function rewriteOpaqueSamplerSelections(tokens: Token[]): number {
    const samplerNames = new Set(['syn_Media', 'syn_UserImage']);
    const initial = significant(tokens);
    for (let s = 0; s < initial.length - 1; s++) {
        if (tokens[initial[s]].text.startsWith('sampler')) samplerNames.add(tokens[initial[s + 1]].text);
    }
    let changed = 0;
    for (;;) {
        const sig = significant(tokens);
        let rewritten = false;
        for (let s = 0; s < sig.length - 2; s++) {
            if (tokens[sig[s]].kind !== 'ident' || tokens[sig[s + 1]].text !== '(') continue;
            const close = matchingClose(tokens, sig, s + 1);
            if (close === -1) continue;
            let depth = 0;
            let question = -1;
            let colon = -1;
            let end = close;
            for (let q = s + 2; q < close; q++) {
                const value = tokens[sig[q]].text;
                if (value === '(' || value === '[') depth++;
                else if (value === ')' || value === ']') depth--;
                else if (depth === 0 && value === '?') question = q;
                else if (depth === 0 && value === ':') colon = q;
                else if (depth === 0 && value === ',') {
                    end = q;
                    break;
                }
            }
            if (
                question === -1 ||
                colon === -1 ||
                !tokens.slice(sig[question + 1], sig[end]).some(token => samplerNames.has(token.text))
            )
                continue;
            const read = (from: number, to: number): string =>
                tokens
                    .slice(sig[from], sig[to - 1] + 1)
                    .map(token => token.text)
                    .join('');
            const condition = read(s + 2, question);
            const yes = read(question + 1, colon);
            const no = read(colon + 1, end);
            const rest = end === close ? '' : read(end, close);
            const callee = tokens[sig[s]].text;
            tokens.splice(
                sig[s],
                sig[close] - sig[s] + 1,
                ...tokenize(`(${condition}?${callee}(${yes}${rest}):${callee}(${no}${rest}))`)
            );
            changed++;
            rewritten = true;
            break;
        }
        if (!rewritten) return changed;
    }
}
