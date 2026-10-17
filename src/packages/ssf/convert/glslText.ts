/**
 * A small GLSL tokenizer and the text operations the SSF converter needs on top of it.
 *
 * Not a parser: the converter adapts desktop-flavored source for GLSL ES 3.00 with a handful of
 * local rewrites, and a token stream that keeps every byte of the original (whitespace and
 * comments included) is enough to do that without disturbing anything it does not touch.
 */

export type TokenKind = 'trivia' | 'directive' | 'ident' | 'number' | 'punct';

export interface Token {
    kind: TokenKind;
    text: string;
}

const PUNCTUATION = [
    '<<=',
    '>>=',
    '==',
    '!=',
    '<=',
    '>=',
    '&&',
    '||',
    '^^',
    '++',
    '--',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '<<',
    '>>',
    '&=',
    '|=',
    '^=',
];

function isIdentStart(char: string): boolean {
    return /[A-Za-z_]/.test(char);
}

function isDigit(char: string | undefined): boolean {
    return char !== undefined && char >= '0' && char <= '9';
}

/** Splits source into tokens such that joining every token's text reproduces the input exactly. */
export function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    const length = source.length;
    let lineStart = true;

    while (i < length) {
        const char = source[i];
        const next = source[i + 1];

        if (char === '\n') {
            tokens.push({ kind: 'trivia', text: '\n' });
            i++;
            lineStart = true;
            continue;
        }
        if (char === ' ' || char === '\t' || char === '\r') {
            let j = i;
            while (j < length && (source[j] === ' ' || source[j] === '\t' || source[j] === '\r')) j++;
            tokens.push({ kind: 'trivia', text: source.slice(i, j) });
            i = j;
            continue;
        }
        if (char === '/' && next === '/') {
            let j = i;
            while (j < length && source[j] !== '\n') j++;
            tokens.push({ kind: 'trivia', text: source.slice(i, j) });
            i = j;
            continue;
        }
        if (char === '/' && next === '*') {
            const end = source.indexOf('*/', i + 2);
            const j = end === -1 ? length : end + 2;
            tokens.push({ kind: 'trivia', text: source.slice(i, j) });
            i = j;
            continue;
        }
        if (char === '#' && lineStart) {
            // A directive runs to the end of the line, honoring backslash continuations.
            let j = i;
            while (j < length) {
                if (source[j] === '\n' && source[j - 1] !== '\\') break;
                j++;
            }
            tokens.push({ kind: 'directive', text: source.slice(i, j) });
            i = j;
            continue;
        }
        lineStart = false;

        if (isIdentStart(char)) {
            let j = i + 1;
            while (j < length && /\w/.test(source[j])) j++;
            tokens.push({ kind: 'ident', text: source.slice(i, j) });
            i = j;
            continue;
        }
        if (isDigit(char) || (char === '.' && isDigit(next))) {
            let j = i;
            if (char === '0' && (next === 'x' || next === 'X')) {
                j += 2;
                while (j < length && /[0-9a-fA-F]/.test(source[j])) j++;
            } else {
                while (j < length && isDigit(source[j])) j++;
                if (source[j] === '.') {
                    j++;
                    while (j < length && isDigit(source[j])) j++;
                }
                if (
                    (source[j] === 'e' || source[j] === 'E') &&
                    (isDigit(source[j + 1]) ||
                        ((source[j + 1] === '+' || source[j + 1] === '-') && isDigit(source[j + 2])))
                ) {
                    j += 2;
                    while (j < length && isDigit(source[j])) j++;
                }
            }
            while (j < length && /[uUfF]/.test(source[j])) j++;
            tokens.push({ kind: 'number', text: source.slice(i, j) });
            i = j;
            continue;
        }

        const punct = PUNCTUATION.find(candidate => source.startsWith(candidate, i));
        tokens.push({ kind: 'punct', text: punct ?? char });
        i += (punct ?? char).length;
    }
    return tokens;
}

export function detokenize(tokens: readonly Token[]): string {
    return tokens.map(token => token.text).join('');
}

/** Whether the number token is an integer literal in the GLSL sense (no point, exponent or float suffix). */
export function isIntegerLiteral(text: string): boolean {
    if (/^0[xX]/.test(text)) return true;
    return /^\d+[uU]?$/.test(text);
}

/** Indexes of tokens that carry code, skipping whitespace and comments. */
function significant(tokens: readonly Token[]): number[] {
    const indexes: number[] = [];
    tokens.forEach((token, index) => {
        if (token.kind !== 'trivia') indexes.push(index);
    });
    return indexes;
}

/** Identifiers referenced by shader code and preprocessor directives. */
export function identifiersUsed(tokens: readonly Token[]): Set<string> {
    const used = new Set<string>();
    for (const token of tokens) {
        if (token.kind === 'ident') used.add(token.text);
        if (token.kind === 'directive') {
            for (const match of token.text.matchAll(/\b[A-Za-z_]\w*/g)) used.add(match[0]);
        }
    }
    return used;
}

const TYPE_KEYWORDS = new Set([
    'void',
    'bool',
    'int',
    'uint',
    'float',
    'vec2',
    'vec3',
    'vec4',
    'ivec2',
    'ivec3',
    'ivec4',
    'uvec2',
    'uvec3',
    'uvec4',
    'bvec2',
    'bvec3',
    'bvec4',
    'mat2',
    'mat3',
    'mat4',
    'mat2x2',
    'mat2x3',
    'mat2x4',
    'mat3x2',
    'mat3x3',
    'mat3x4',
    'mat4x2',
    'mat4x3',
    'mat4x4',
    'sampler2D',
    'sampler3D',
    'samplerCube',
]);
const QUALIFIERS = new Set([
    'const',
    'in',
    'out',
    'inout',
    'uniform',
    'highp',
    'mediump',
    'lowp',
    'flat',
    'smooth',
    'layout',
    'precise',
]);

export function isTypeKeyword(text: string): boolean {
    return TYPE_KEYWORDS.has(text);
}

export function isIntegralType(text: string): boolean {
    return text === 'int' || text === 'uint' || /^[iu]vec[234]$/.test(text);
}

export interface FunctionDefinition {
    name: string;
    returnType: string;
    /** Parameter types in order; `inout`/`const` style qualifiers are dropped. */
    parameterTypes: string[];
    /** Index of the opening brace token of the body, or -1 for a prototype. */
    bodyStart: number;
    bodyEnd: number;
}

/** Top-level function definitions and prototypes, with their body extents. */
export function findFunctions(tokens: readonly Token[]): FunctionDefinition[] {
    const sig = significant(tokens);
    const found: FunctionDefinition[] = [];
    let depth = 0;

    for (let s = 0; s < sig.length; s++) {
        const token = tokens[sig[s]];
        if (token.kind === 'punct') {
            if (token.text === '{') depth++;
            else if (token.text === '}') depth--;
            continue;
        }
        if (depth !== 0 || token.kind !== 'ident') continue;

        // Match `[qualifiers] type name (`.
        let cursor = s;
        while (cursor < sig.length && QUALIFIERS.has(tokens[sig[cursor]].text)) cursor++;
        const typeToken = tokens[sig[cursor]];
        const nameToken = tokens[sig[cursor + 1]];
        const openToken = tokens[sig[cursor + 2]];
        if (typeToken === undefined || nameToken === undefined || openToken === undefined) continue;
        if (typeToken.kind !== 'ident' || nameToken.kind !== 'ident' || openToken.text !== '(') continue;
        if (!TYPE_KEYWORDS.has(typeToken.text) && !/^[A-Z]\w*$/.test(typeToken.text)) continue;
        if (
            cursor !== s &&
            s > 0 &&
            tokens[sig[s - 1]].text !== ';' &&
            tokens[sig[s - 1]].text !== '}' &&
            tokens[sig[s - 1]].kind !== 'directive'
        )
            continue;

        // Parameter list.
        let paren = 0;
        let p = cursor + 2;
        const parameterTypes: string[] = [];
        let currentType: string | null = null;
        for (; p < sig.length; p++) {
            const t = tokens[sig[p]];
            if (t.text === '(') {
                paren++;
                continue;
            }
            if (t.text === ')') {
                paren--;
                if (paren === 0) break;
                continue;
            }
            if (t.text === ',' && paren === 1) {
                if (currentType !== null) parameterTypes.push(currentType);
                currentType = null;
                continue;
            }
            if (t.kind === 'ident' && currentType === null && !QUALIFIERS.has(t.text)) {
                currentType = t.text;
            }
        }
        if (currentType !== null) parameterTypes.push(currentType);
        if (parameterTypes.length === 1 && parameterTypes[0] === 'void') parameterTypes.length = 0;

        const after = tokens[sig[p + 1]];
        let bodyStart = -1;
        let bodyEnd = -1;
        if (after !== undefined && after.text === '{') {
            bodyStart = sig[p + 1];
            let braces = 0;
            for (let q = p + 1; q < sig.length; q++) {
                const t = tokens[sig[q]];
                if (t.text === '{') braces++;
                else if (t.text === '}') {
                    braces--;
                    if (braces === 0) {
                        bodyEnd = sig[q];
                        break;
                    }
                }
            }
        }
        found.push({ name: nameToken.text, returnType: typeToken.text, parameterTypes, bodyStart, bodyEnd });
        s = Math.max(s, p);
    }
    return found;
}

/**
 * Replaces every use of an identifier in code, except as a member access (`value.name`) and
 * except where the identifier is declared as a local of its own.
 */
export function replaceIdentifier(tokens: Token[], name: string, replacement: string): number {
    let count = 0;
    const sig = significant(tokens);
    for (let s = 0; s < sig.length; s++) {
        const token = tokens[sig[s]];
        if (token.kind !== 'ident' || token.text !== name) continue;
        const previous = s > 0 ? tokens[sig[s - 1]] : undefined;
        if (previous !== undefined && previous.text === '.') continue;
        token.text = replacement;
        count++;
    }
    return count;
}

/** Finds the matching close for the opener at significant position `s`, or -1. */
export function matchingClose(tokens: readonly Token[], sig: readonly number[], s: number): number {
    const open = tokens[sig[s]].text;
    const close = open === '(' ? ')' : open === '[' ? ']' : '}';
    let depth = 0;
    for (let q = s; q < sig.length; q++) {
        const text = tokens[sig[q]].text;
        if (text === open) depth++;
        else if (text === close) {
            depth--;
            if (depth === 0) return q;
        }
    }
    return -1;
}

export { significant };
