import {
    expandGenericNumericMacros,
    promoteDesktopNumericExpressions,
    rewriteOpaqueSamplerSelections,
} from './glslNumeric';
import type { Token } from './glslText';
import {
    detokenize,
    findFunctions,
    identifiersUsed,
    isIntegerLiteral,
    isIntegralType,
    isTypeKeyword,
    matchingClose,
    replaceIdentifier,
    significant,
    tokenize,
} from './glslText';

/**
 * GLSL ES 3.00 has no implicit int-to-float conversion and a few more reserved words than the
 * desktop dialect SSF scenes are written in. Token rewrites and lightweight expression type
 * inference preserve integral calculations and insert explicit conversions at floating uses.
 */

const RESERVED_WORDS = new Set([
    'common',
    'partition',
    'active',
    'asm',
    'class',
    'union',
    'enum',
    'typedef',
    'template',
    'this',
    'resource',
    'goto',
    'inline',
    'noinline',
    'public',
    'static',
    'extern',
    'external',
    'interface',
    'long',
    'short',
    'half',
    'fixed',
    'unsigned',
    'superp',
    'input',
    'output',
    'hvec2',
    'hvec3',
    'hvec4',
    'fvec2',
    'fvec3',
    'fvec4',
    'dvec2',
    'dvec3',
    'dvec4',
    'filter',
    'sizeof',
    'cast',
    'namespace',
    'using',
    'volatile',
    'sample',
    'buffer',
    'shared',
    'subroutine',
    'patch',
    'coherent',
]);

/** What may precede a sign that is a unary operator rather than a binary one. */
const UNARY_CONTEXT = /^(\(|,|=|==|!=|<|>|<=|>=|\+=|-=|\*=|\/=|\*|\/|\+|-|\?|:|return)$/;

/** Functions whose every argument is integral. */
const INTEGRAL_ARGUMENT_FUNCTIONS = new Set([
    'int',
    'uint',
    'ivec2',
    'ivec3',
    'ivec4',
    'uvec2',
    'uvec3',
    'uvec4',
    'texelFetch',
    'textureSize',
    'bitfieldExtract',
    'bitfieldInsert',
    'bitCount',
    'findLSB',
    'findMSB',
]);

export function renameReservedWords(tokens: Token[]): string[] {
    const renamed: string[] = [];
    for (const word of RESERVED_WORDS) {
        if (replaceIdentifier(tokens, word, `${word}_`) > 0) renamed.push(word);
    }
    const sig = significant(tokens);
    let depth = 0;
    let parentheses = 0;
    let statementStart = 0;
    for (let s = 0; s < sig.length; s++) {
        const text = tokens[sig[s]].text;
        if (text === '(') parentheses++;
        else if (text === ')') parentheses--;
        if (text === '{') depth++;
        else if (text === '}') depth--;
        if (text === ';' || text === '}' || tokens[sig[s]].kind === 'directive') statementStart = s + 1;
        if (depth === 0 && parentheses === 0 && text === 'vec4' && tokens[sig[s + 1]]?.text === 'fragColor') {
            if (sig.slice(statementStart, s).some(index => tokens[index].text === 'out')) continue;
            let name = 'ssf_fragColor';
            while (tokens.some(token => token.kind === 'ident' && token.text === name)) name += '_';
            replaceIdentifier(tokens, 'fragColor', name);
            renamed.push('fragColor');
            break;
        }
    }
    return renamed;
}

/** Removes `#version` and `precision` lines: the host prelude owns both. */
export function stripPreambleTokens(tokens: Token[]): Token[] {
    const kept: Token[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.kind === 'directive' && /^#\s*(version|extension)\b/.test(token.text)) continue;
        if (token.kind === 'ident' && token.text === 'precision') {
            // Skip through the terminating semicolon.
            let j = i;
            while (j < tokens.length && tokens[j].text !== ';') j++;
            i = j;
            continue;
        }
        if (token.kind === 'directive') {
            const macro = /^#\s*define\s+(PI|TAU|TWO_PI)\b/.exec(token.text);
            if (macro) token.text = `#undef ${macro[1]}\n${token.text}`;
        }
        kept.push(token);
    }
    return kept;
}

/**
 * `sampler1D` surfaces (`syn_Spectrum`, `syn_LevelTrail`) are 1024x1 and 400x1 textures here, so
 * a float coordinate becomes `vec2(x, 0.5)` and an integer texel index becomes `ivec2(i, 0)`.
 */
export function rewriteOneDimensionalSamplers(tokens: Token[], samplers: ReadonlySet<string>): number {
    let rewrites = 0;
    let again = true;
    while (again) {
        again = false;
        const sig = significant(tokens);
        for (let s = 0; s < sig.length - 3; s++) {
            const callee = tokens[sig[s]];
            if (callee.kind !== 'ident') continue;
            if (callee.text !== 'texture' && callee.text !== 'textureLod' && callee.text !== 'texelFetch') continue;
            if (tokens[sig[s + 1]].text !== '(') continue;
            const sampler = tokens[sig[s + 2]];
            if (!samplers.has(sampler.text) || tokens[sig[s + 3]].text !== ',') continue;
            if (callee.text === 'texture' && sig[s + 3] < 0) continue;

            const close = matchingClose(tokens, sig, s + 1);
            if (close === -1) continue;

            // The second argument runs to the next top-level comma or the closing paren.
            let depth = 0;
            let argEnd = close;
            for (let q = s + 4; q < close; q++) {
                const text = tokens[sig[q]].text;
                if (text === '(' || text === '[') depth++;
                else if (text === ')' || text === ']') depth--;
                else if (text === ',' && depth === 0) {
                    argEnd = q;
                    break;
                }
            }
            const argStart = s + 4;
            const first = tokens[sig[argStart]];
            const marker = callee.text === 'texelFetch' ? 'ivec2(' : 'vec2(';
            // Already a two-component coordinate: someone ported the scene to a 2D lookup.
            if (first !== undefined && (first.text === 'vec2' || first.text === 'ivec2')) continue;
            if (first !== undefined && first.text === marker.slice(0, -1)) continue;

            const argTokens = tokens.slice(sig[argStart], sig[argEnd - 1] + 1);
            const wrapped: Token[] = [
                { kind: 'ident', text: marker.slice(0, -1) },
                { kind: 'punct', text: '(' },
                ...argTokens,
                { kind: 'punct', text: ',' },
                { kind: 'number', text: callee.text === 'texelFetch' ? '0' : '0.5' },
                { kind: 'punct', text: ')' },
            ];
            tokens.splice(sig[argStart], sig[argEnd - 1] + 1 - sig[argStart], ...wrapped);
            rewrites++;
            again = true;
            break;
        }
        if (again) {
            // Restart after a splice: indexes into the old significant list are stale. A guard against
            // runaway rewriting of its own output: the wrapper above is skipped on its second pass.
            if (rewrites > 10_000) break;
        }
    }
    return rewrites;
}

/**
 * Turns integer literals into float literals except where the surrounding code needs an
 * integer. Returns how many literals it changed.
 */
export function floatifyIntegerLiterals(tokens: Token[], extraIntegralNames: Iterable<string> = []): number {
    expandGenericNumericMacros(tokens);
    rewriteOpaqueSamplerSelections(tokens);
    // The desktop expression divides integers before promoting its result to float.
    const integralExpressions = new Set<Token>();
    promoteDesktopNumericExpressions(tokens, extraIntegralNames, integralExpressions);
    const sig = significant(tokens);
    const functions = findFunctions(tokens);
    const functionByName = new Map<string, string[][]>();
    for (const fn of functions) {
        const list = functionByName.get(fn.name) ?? [];
        list.push(fn.parameterTypes);
        functionByName.set(fn.name, list);
    }

    // Names declared with an integral type anywhere in the file, as locals, globals or parameters.
    const integralNames = new Set<string>(['PASSINDEX', 'bl_pass', 'bl_frame', ...extraIntegralNames]);
    for (let s = 0; s < sig.length - 1; s++) {
        const token = tokens[sig[s]];
        if (token.kind !== 'ident' || !isIntegralType(token.text)) continue;
        const previous = s > 0 ? tokens[sig[s - 1]] : undefined;
        if (previous !== undefined && previous.text === '.') continue;
        let q = s + 1;
        // `int a, b = 1, c;` declares several names after one type.
        while (q < sig.length) {
            const name = tokens[sig[q]];
            if (name.kind !== 'ident') break;
            integralNames.add(name.text);
            q++;
            let depth = 0;
            while (q < sig.length) {
                const text = tokens[sig[q]].text;
                if (text === '(' || text === '[') depth++;
                else if (text === ')' || text === ']') depth--;
                else if (depth === 0 && (text === ',' || text === ';' || text === ')' || text === '{')) break;
                q++;
            }
            if (q < sig.length && tokens[sig[q]].text === ',') {
                q++;
                continue;
            }
            break;
        }
    }

    // Which statements are integral: a declaration of an integral type, or an assignment to one.
    const literalIntegral = new Array<boolean>(sig.length).fill(false);
    const markStatement = (from: number, to: number): void => {
        for (let q = from; q <= to; q++) literalIntegral[q] = true;
    };
    let statementStart = 0;
    let parenDepth = 0;
    for (let s = 0; s < sig.length; s++) {
        const text = tokens[sig[s]].text;
        if (text === '(' || text === '[') parenDepth++;
        else if (text === ')' || text === ']') parenDepth--;
        const isBoundary = text === ';' || text === '{' || text === '}';
        if (isBoundary && parenDepth <= 0) {
            statementStart = s + 1;
            parenDepth = 0;
            continue;
        }
        if (s === statementStart) {
            let first = s;
            while (
                first < sig.length &&
                ['const', 'highp', 'mediump', 'lowp', 'uniform'].includes(tokens[sig[first]].text)
            )
                first++;
            const lead = tokens[sig[first]];
            if (lead !== undefined && lead.kind === 'ident' && isIntegralType(lead.text)) {
                // For headers (`for (int i = 0; ...)`) the statement extends to the closing paren's body.
                let end = first;
                let depth = 0;
                while (end < sig.length) {
                    const t = tokens[sig[end]].text;
                    if (t === '(' || t === '[') depth++;
                    else if (t === ')' || t === ']') {
                        if (depth === 0) break;
                        depth--;
                    } else if (depth === 0 && (t === ';' || t === '{')) break;
                    end++;
                }
                markStatement(first, end);
            } else if (lead !== undefined && lead.kind === 'ident' && integralNames.has(lead.text)) {
                const op = tokens[sig[first + 1]];
                if (op !== undefined && /^(=|\+=|-=|\*=|\/=|%=)$/.test(op.text)) {
                    let end = first;
                    let depth = 0;
                    while (end < sig.length) {
                        const t = tokens[sig[end]].text;
                        if (t === '(' || t === '[') depth++;
                        else if (t === ')' || t === ']') depth--;
                        else if (depth === 0 && t === ';') break;
                        end++;
                    }
                    markStatement(first, end);
                }
            }
        }
        if (text === 'for' || text === 'switch' || text === 'case') {
            // Loop headers that declare an integral counter were marked above through their first
            // statement; `case N:` labels are always integral.
            if (text === 'case') {
                let end = s + 1;
                while (end < sig.length && tokens[sig[end]].text !== ':') end++;
                markStatement(s, end);
            }
        }
    }

    // Enclosing function return type per significant index, for `return 1;` in an int function.
    const returnsIntegral = new Array<boolean>(sig.length).fill(false);
    const bodies = functions.filter(fn => fn.bodyStart !== -1 && isIntegralType(fn.returnType));
    for (const fn of bodies) {
        for (let s = 0; s < sig.length; s++) {
            if (sig[s] > fn.bodyStart && sig[s] < fn.bodyEnd) returnsIntegral[s] = true;
        }
    }

    const declarations = new Map<string, Array<{ position: number; integral: boolean }>>();
    for (let s = 0; s + 1 < sig.length; s++) {
        const type = tokens[sig[s]];
        const name = tokens[sig[s + 1]];
        if (
            type.kind !== 'ident' ||
            !isTypeKeyword(type.text) ||
            name.kind !== 'ident' ||
            tokens[sig[s + 2]]?.text === '('
        )
            continue;
        const list = declarations.get(name.text) ?? [];
        list.push({ position: s + 1, integral: isIntegralType(type.text) });
        declarations.set(name.text, list);
    }

    const declaredIntegralAt = (name: string, position: number): boolean | undefined => {
        const entries = declarations.get(name);
        if (entries === undefined) return undefined;
        for (let index = entries.length - 1; index >= 0; index--) {
            if (entries[index].position <= position) return entries[index].integral;
        }
        return undefined;
    };

    // Call argument positions: index into the user function's parameter list when known.
    const argumentCall: Array<{ callee: string; index: number } | null> = new Array(sig.length).fill(null);
    const stack: Array<{ opener: string; callee: string | null; index: number }> = [];
    const integralCallDepth: boolean[] = [];
    const returnsIntegralType = (name: string): boolean =>
        name !== 'texelFetch' && INTEGRAL_ARGUMENT_FUNCTIONS.has(name);
    const integralArgument = (from: number, callee: string | null): boolean => {
        if (callee === null || !INTEGRAL_ARGUMENT_FUNCTIONS.has(callee)) return false;
        if (!/^(?:int|uint|[iu]vec[234])$/.test(callee)) return true;
        let depth = 0;
        for (let q = from; q < sig.length; q++) {
            const token = tokens[sig[q]];
            if (depth === 0 && (token.text === ',' || token.text === ')')) break;
            if (token.text === '(') depth++;
            else if (token.text === ')') depth--;
            if (token.kind === 'number' && !isIntegerLiteral(token.text)) return false;
            if (token.kind !== 'ident' || tokens[sig[q - 1]]?.text === '.') continue;
            if (tokens[sig[q + 1]]?.text === '(') {
                const defined = functions.filter(fn => fn.name === token.text);
                if (!returnsIntegralType(token.text) && !defined.some(fn => isIntegralType(fn.returnType)))
                    return false;
                const close = matchingClose(tokens, sig, q + 1);
                if (close === -1) return false;
                q = close;
            } else {
                if (!(declaredIntegralAt(token.text, q) ?? integralNames.has(token.text))) return false;
            }
        }
        return true;
    };
    for (let s = 0; s < sig.length; s++) {
        const text = tokens[sig[s]].text;
        if (text === '(' || text === '[') {
            const callee = s > 0 && tokens[sig[s - 1]].kind === 'ident' ? tokens[sig[s - 1]].text : null;
            stack.push({ opener: text, callee: text === '(' ? callee : null, index: 0 });
            integralCallDepth.push(
                text === '[' || (callee === null ? integralCallDepth.at(-1) === true : integralArgument(s + 1, callee))
            );
        } else if (text === ')' || text === ']') {
            stack.pop();
            integralCallDepth.pop();
        } else if (text === ',' && stack.length > 0) {
            stack[stack.length - 1].index++;
            integralCallDepth[integralCallDepth.length - 1] = integralArgument(s + 1, stack[stack.length - 1].callee);
        }
        const top = stack[stack.length - 1];
        if (top !== undefined && top.callee !== null) {
            argumentCall[s] = { callee: top.callee, index: top.index };
        }
        if (integralCallDepth.at(-1) === true) literalIntegral[s] = true;
    }

    const operandIsIntegral = (s: number): boolean => {
        const token = tokens[sig[s]];
        if (token === undefined) return false;
        if (token.kind === 'ident') {
            return declaredIntegralAt(token.text, s) ?? integralNames.has(token.text);
        }
        if (token.kind === 'number')
            return (
                isIntegerLiteral(token.text) &&
                (/[uU]$|^0x/.test(token.text) || ['%', '&', '|', '^'].includes(tokens[sig[s - 1]]?.text ?? ''))
            );
        if (token.text === ')') {
            let depth = 1;
            for (let q = s - 1; q >= 0; q--) {
                const text = tokens[sig[q]].text;
                if (text === ')') depth++;
                if (text === '(' && --depth === 0) return returnsIntegralType(tokens[sig[q - 1]]?.text ?? '');
            }
        }
        return false;
    };

    let changed = 0;
    for (let s = 0; s < sig.length; s++) {
        const token = tokens[sig[s]];
        if (token.kind === 'number' && /^\d+\.0*$/.test(token.text)) {
            const leftOperator = tokens[sig[s - 1]]?.text;
            const rightOperator = tokens[sig[s + 1]]?.text;
            const compares = (value: string | undefined): boolean => /^(==|!=|<|>|<=|>=)$/.test(value ?? '');
            if (
                (compares(leftOperator) && operandIsIntegral(s - 2)) ||
                (compares(rightOperator) && operandIsIntegral(s + 2))
            ) {
                token.text = token.text.split('.')[0];
                changed++;
            }
        }
        if (
            token.kind !== 'number' ||
            !isIntegerLiteral(token.text) ||
            /^0[xX]/.test(token.text) ||
            /[uU]$/.test(token.text)
        )
            continue;
        if (literalIntegral[s] || integralExpressions.has(token)) continue;
        if (returnsIntegral[s] && tokens[sig[Math.max(0, s - 1)]].text === 'return') continue;

        const left = s > 0 ? tokens[sig[s - 1]] : undefined;
        const right = tokens[sig[s + 1]];

        // Operators that exist only for integers.
        if (left !== undefined && ['%', '<<', '>>', '&', '|', '^', '~'].includes(left.text)) continue;
        if (right !== undefined && ['%', '<<', '>>', '&', '|', '^'].includes(right.text)) continue;

        // A comparison, arithmetic or assignment partner that is an integral variable. A sign in
        // front of the literal (`i = -4`) is part of the literal, not an operator between operands.
        const signed = s >= 2 && /^[+-]$/.test(left?.text ?? '') && UNARY_CONTEXT.test(tokens[sig[s - 2]].text);
        const operator = signed ? tokens[sig[s - 2]] : left;
        if (
            operator !== undefined &&
            /^(==|!=|<|>|<=|>=|\+|-|\*|\/|=|\+=|-=|\*=|\/=)$/.test(operator.text) &&
            operandIsIntegral(signed ? s - 3 : s - 2)
        )
            continue;
        if (right !== undefined && /^(==|!=|<|>|<=|>=|\+|-|\*|\/)$/.test(right.text) && operandIsIntegral(s + 2)) {
            // `x * 2 * y` with an integral `y` is rare; `0 < i` and `1 + i` are the cases this is for.
            continue;
        }
        // A user function parameter that is integral at this argument position.
        const call = argumentCall[s];
        if (call !== null && call !== undefined) {
            const signatures = functionByName.get(call.callee);
            if (
                signatures !== undefined &&
                signatures.some(types => types[call.index] !== undefined && isIntegralType(types[call.index]))
            ) {
                continue;
            }
        }

        token.text = `${token.text}.0`;
        changed++;
    }
    return changed + promoteDesktopNumericExpressions(tokens, extraIntegralNames);
}

/** Removes unused uniform declarations whose desktop-only defaults have no observable effect. */
export function adaptSsfDesktopGlsl(tokens: Token[]): number {
    const sig = significant(tokens);
    const drop = new Set<number>();
    let changed = 0;
    for (let s = 0; s < sig.length; s++) {
        if (tokens[sig[s]].text !== 'uniform') continue;
        let end = s + 1;
        while (end < sig.length && tokens[sig[end]].text !== ';') end++;
        let cursor = s + 1;
        while (['highp', 'mediump', 'lowp'].includes(tokens[sig[cursor]]?.text)) cursor++;
        const name = tokens[sig[cursor + 1]]?.text;
        if (!name || !tokens.slice(sig[s], sig[end]).some(token => token.text === '=')) continue;
        let depth = 0;
        let multiple = false;
        for (let q = cursor + 2; q < end; q++) {
            const text = tokens[sig[q]].text;
            if (text === '(' || text === '[') depth++;
            else if (text === ')' || text === ']') depth--;
            else if (depth === 0 && text === ',') multiple = true;
        }
        if (multiple || identifiersUsed(tokens.filter((_, index) => index < sig[s] || index > sig[end])).has(name))
            continue;
        for (let q = sig[s]; q <= sig[end]; q++) drop.add(q);
        changed++;
    }
    if (drop.size) tokens.splice(0, tokens.length, ...tokens.filter((_, index) => !drop.has(index)));
    return changed;
}

/**
 * Replaces uses of a declared name with an expression, for controls whose shader type differs
 * from the native control type (an SSF color is a `vec3`, a Blink color a `vec4`).
 */
export function swizzleControl(tokens: Token[], name: string, swizzle: string): number {
    return replaceIdentifier(tokens, name, `${name}${swizzle}`);
}

/** Removes top-level `uniform <type> name;` declarations for any of the given names. */
export function removeUniformDeclarations(tokens: Token[], names: ReadonlySet<string>): string[] {
    const removed: string[] = [];
    const sig = significant(tokens);
    const drop = new Set<number>();
    for (let s = 0; s < sig.length; s++) {
        if (tokens[sig[s]].text !== 'uniform') continue;
        let end = s;
        while (end < sig.length && tokens[sig[end]].text !== ';') end++;
        const declared = tokens.slice(sig[s], sig[end] + 1).filter(t => t.kind === 'ident' && names.has(t.text));
        if (declared.length === 0) continue;
        const typeAndNames = tokens
            .slice(sig[s], sig[end] + 1)
            .filter(t => t.kind === 'ident')
            .map(t => t.text);
        // Only drop a statement that declares nothing but the names being taken over.
        const others = typeAndNames.filter(text => text !== 'uniform' && !isTypeKeyword(text) && !names.has(text));
        if (others.length > 0) continue;
        for (let q = sig[s]; q <= sig[end]; q++) drop.add(q);
        removed.push(...declared.map(t => t.text));
    }
    if (drop.size > 0) {
        const kept = tokens.filter((_, index) => !drop.has(index));
        tokens.splice(0, tokens.length, ...kept);
    }
    return removed;
}

export function adaptGlslText(source: string, transform: (tokens: Token[]) => void): string {
    const tokens = tokenize(source);
    transform(tokens);
    return detokenize(tokens);
}

const SKIPPED_QUALIFIERS = new Set(['const', 'uniform', 'in', 'out', 'inout', 'attribute', 'varying']);
const NEUTRAL_QUALIFIERS = new Set(['highp', 'mediump', 'lowp', 'precise', 'flat', 'smooth', 'centroid']);

/**
 * GLSL ES 3.00 only accepts constant initializers at global scope; desktop GLSL accepts any
 * expression. This strips every initializer from non-`const` global variables and returns the
 * equivalent assignments, which the generated `main()` runs before the scene's entry point.
 * Declaration order is preserved, so an initializer that reads an earlier global still sees it.
 */
export function hoistGlobalInitializers(tokens: Token[]): string[] {
    const assignments: string[] = [];
    const sig = significant(tokens);
    const drop = new Set<number>();
    let s = 0;

    while (s < sig.length) {
        if (tokens[sig[s]].kind === 'directive') {
            s++;
            continue;
        }
        let end = s;
        let paren = 0;
        while (end < sig.length) {
            const text = tokens[sig[end]].text;
            if (text === '(' || text === '[') paren++;
            else if (text === ')' || text === ']') paren--;
            else if (paren === 0 && (text === ';' || text === '{')) break;
            end++;
        }
        if (end >= sig.length) break;

        if (tokens[sig[end]].text === '{') {
            const close = matchingClose(tokens, sig, end);
            s = close === -1 ? sig.length : close + 1;
            if (tokens[sig[s - 1]].text === '}' && tokens[sig[s]]?.text === ';') s++;
            continue;
        }

        collectDeclaration(tokens, sig, s, end, assignments, drop);
        s = end + 1;
    }

    if (drop.size > 0) {
        const kept = tokens.filter((_, index) => !drop.has(index));
        tokens.splice(0, tokens.length, ...kept);
    }
    return assignments;
}

function collectDeclaration(
    tokens: readonly Token[],
    sig: readonly number[],
    start: number,
    end: number,
    assignments: string[],
    drop: Set<number>
): void {
    let cursor = start;
    while (cursor < end && NEUTRAL_QUALIFIERS.has(tokens[sig[cursor]].text)) cursor++;
    const first = tokens[sig[cursor]];
    if (
        first === undefined ||
        first.kind !== 'ident' ||
        SKIPPED_QUALIFIERS.has(first.text) ||
        first.text === 'layout' ||
        first.text === 'struct'
    )
        return;
    if (!isTypeKeyword(first.text) && tokens[sig[cursor + 1]]?.kind !== 'ident') return;
    cursor++;

    // Declarators: `name [ [n] ] [= init]` separated by top-level commas.
    while (cursor < end) {
        const name = tokens[sig[cursor]];
        if (name.kind !== 'ident') return;
        cursor++;
        if (tokens[sig[cursor]]?.text === '(') return; // a function prototype

        let unsizedArray = false;
        while (cursor < end && tokens[sig[cursor]].text === '[') {
            const close = matchingClose(tokens, sig, cursor);
            if (close === -1) return;
            if (close === cursor + 1) unsizedArray = true;
            cursor = close + 1;
        }

        if (tokens[sig[cursor]]?.text === '=') {
            const equals = cursor;
            let depth = 0;
            let initEnd = cursor + 1;
            while (initEnd < end) {
                const text = tokens[sig[initEnd]].text;
                if (text === '(' || text === '[' || text === '{') depth++;
                else if (text === ')' || text === ']' || text === '}') depth--;
                else if (text === ',' && depth === 0) break;
                initEnd++;
            }
            if (!unsizedArray) {
                const initializer = tokens
                    .slice(sig[equals + 1], sig[initEnd - 1] + 1)
                    .map(t => t.text)
                    .join('')
                    .trim();
                assignments.push(`${name.text} = ${initializer};`);
                for (let q = sig[equals]; q <= sig[initEnd - 1]; q++) drop.add(q);
            }
            cursor = initEnd;
        }
        if (tokens[sig[cursor]]?.text === ',') cursor++;
        else break;
    }
}

/** Removes `out`/`layout(...) out` fragment output declarations: the host prelude declares `fragColor`. */
export function removeFragmentOutputs(tokens: Token[]): number {
    const sig = significant(tokens);
    const drop = new Set<number>();
    let removed = 0;
    for (let s = 0; s < sig.length; s++) {
        if (tokens[sig[s]].text !== 'out') continue;
        let begin = s;
        // Include a preceding `layout(...)` qualifier.
        if (begin >= 4 && tokens[sig[begin - 1]].text === ')') {
            let q = begin - 1;
            while (q >= 0 && tokens[sig[q]].text !== 'layout') q--;
            if (q >= 0) begin = q;
        }
        let end = s;
        while (end < sig.length && tokens[sig[end]].text !== ';') end++;
        const names = tokens
            .slice(sig[s], sig[end] + 1)
            .filter(t => t.kind === 'ident')
            .map(t => t.text);
        if (!names.includes('fragColor')) continue;
        if (
            begin > 0 &&
            !['}', ';'].includes(tokens[sig[begin - 1]].text) &&
            tokens[sig[begin - 1]].kind !== 'directive'
        )
            continue;
        for (let q = sig[begin]; q <= sig[end]; q++) drop.add(q);
        removed++;
    }
    if (drop.size > 0) {
        const kept = tokens.filter((_, index) => !drop.has(index));
        tokens.splice(0, tokens.length, ...kept);
    }
    return removed;
}

/** Top-level `uniform <type> <name>[, <name>];` declarations that are not samplers, name to type. */
export function collectUniformDeclarations(tokens: readonly Token[]): Map<string, string> {
    const declared = new Map<string, string>();
    const sig = significant(tokens);
    let depth = 0;
    for (let s = 0; s < sig.length; s++) {
        const text = tokens[sig[s]].text;
        if (text === '{') depth++;
        else if (text === '}') depth--;
        if (depth !== 0 || text !== 'uniform') continue;

        let cursor = s + 1;
        while (['highp', 'mediump', 'lowp'].includes(tokens[sig[cursor]]?.text)) cursor++;
        const type = tokens[sig[cursor]]?.text;
        if (type === undefined || type.startsWith('sampler') || !isTypeKeyword(type)) continue;
        for (cursor++; cursor < sig.length && tokens[sig[cursor]].text !== ';'; cursor++) {
            const token = tokens[sig[cursor]];
            if (token.kind === 'ident') declared.set(token.text, type);
        }
    }
    return declared;
}

/** Inserts statements at the top of a function body. Returns false when the function has no body. */
export function insertAtFunctionStart(tokens: Token[], name: string, statements: readonly string[]): boolean {
    if (statements.length === 0) return true;
    const fn = findFunctions(tokens).find(candidate => candidate.name === name && candidate.bodyStart !== -1);
    if (fn === undefined) return false;
    const text = `\n${statements.map(statement => `  ${statement}`).join('\n')}`;
    tokens.splice(fn.bodyStart + 1, 0, { kind: 'trivia', text });
    return true;
}
