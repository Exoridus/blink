/**
 * Render-target size expressions: a closed arithmetic language with no access to anything outside
 * its own variables. The parser is hand-written on purpose; the expression text comes from a
 * package and must never reach `eval` or `Function`.
 *
 * Grammar:
 *   expr    = term (('+' | '-') term)*
 *   term    = unary (('*' | '/' | '%') unary)*
 *   unary   = '-' unary | primary
 *   primary = number | '$' name | func '(' expr (',' expr)* ')' | '(' expr ')'
 */
export type SizeExpr =
    | { readonly kind: 'number'; readonly value: number }
    | { readonly kind: 'variable'; readonly name: string }
    | { readonly kind: 'negate'; readonly operand: SizeExpr }
    | {
          readonly kind: 'binary';
          readonly op: '+' | '-' | '*' | '/' | '%';
          readonly left: SizeExpr;
          readonly right: SizeExpr;
      }
    | { readonly kind: 'call'; readonly fn: SizeFunction; readonly args: readonly SizeExpr[] };

export type SizeFunction = 'min' | 'max' | 'floor' | 'ceil' | 'round' | 'abs' | 'clamp';

export interface SizeExpressionEnv {
    readonly width: number;
    readonly height: number;
    readonly controls: Readonly<Record<string, number | boolean>>;
}

export class SizeExpressionError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'SizeExpressionError';
    }
}

/** Arity range per function; `max` of Infinity means variadic. */
const FUNCTIONS: Readonly<Record<SizeFunction, readonly [min: number, max: number]>> = {
    min: [1, Infinity],
    max: [1, Infinity],
    floor: [1, 1],
    ceil: [1, 1],
    round: [1, 1],
    abs: [1, 1],
    clamp: [3, 3],
};

type Token =
    | { readonly kind: 'number'; readonly value: number }
    | { readonly kind: 'variable'; readonly name: string }
    | { readonly kind: 'ident'; readonly name: string }
    | { readonly kind: 'punct'; readonly value: '+' | '-' | '*' | '/' | '%' | '(' | ')' | ',' }
    | { readonly kind: 'end' };

const IS_DIGIT = /\d/;

/** Length of the numeric literal at the start of `text`, or 0 when there is none. */
function scanNumber(text: string): number {
    let i = 0;
    const digits = (): void => {
        while (IS_DIGIT.test(text.charAt(i))) {
            i++;
        }
    };
    digits();
    const integerDigits = i;
    if (text.charAt(i) === '.') {
        i++;
        const before = i;
        digits();
        if (integerDigits === 0 && i === before) {
            return 0;
        }
    } else if (integerDigits === 0) {
        return 0;
    }
    if (text.charAt(i) === 'e' || text.charAt(i) === 'E') {
        let j = i + 1;
        if (text.charAt(j) === '+' || text.charAt(j) === '-') {
            j++;
        }
        if (IS_DIGIT.test(text.charAt(j))) {
            i = j;
            digits();
        }
    }
    return i;
}
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < source.length) {
        const ch = source[i];
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
            i++;
            continue;
        }
        const rest = source.slice(i);
        if (ch === '$') {
            const match = IDENT.exec(rest.slice(1));
            if (match === null) {
                throw new SizeExpressionError(`"$" must be followed by a name at offset ${i}`);
            }
            tokens.push({ kind: 'variable', name: match[0] });
            i += 1 + match[0].length;
        } else if ((ch >= '0' && ch <= '9') || ch === '.') {
            const length = scanNumber(rest);
            if (length === 0 || /[A-Za-z0-9_.]/.test(rest.charAt(length))) {
                throw new SizeExpressionError(`malformed number at offset ${i}`);
            }
            const value = Number(rest.slice(0, length));
            if (!Number.isFinite(value)) {
                throw new SizeExpressionError(`number at offset ${i} is too large`);
            }
            tokens.push({ kind: 'number', value });
            i += length;
        } else if (/[A-Za-z_]/.test(ch)) {
            const name = (IDENT.exec(rest) ?? [''])[0];
            tokens.push({ kind: 'ident', name });
            i += name.length;
        } else if ('+-*/%(),'.includes(ch)) {
            tokens.push({ kind: 'punct', value: ch as '+' });
            i++;
        } else {
            throw new SizeExpressionError(`unexpected character "${ch}" at offset ${i}`);
        }
    }
    tokens.push({ kind: 'end' });
    return tokens;
}

class Parser {
    private position = 0;

    public constructor(private readonly tokens: readonly Token[]) {}

    public parse(): SizeExpr {
        const expr = this.expression();
        if (this.peek().kind !== 'end') {
            throw new SizeExpressionError('unexpected trailing input');
        }
        return expr;
    }

    private peek(): Token {
        return this.tokens[this.position];
    }

    private isPunct(value: string): boolean {
        const token = this.peek();
        return token.kind === 'punct' && token.value === value;
    }

    private expect(value: ')' | ','): void {
        if (!this.isPunct(value)) {
            throw new SizeExpressionError(`expected "${value}"`);
        }
        this.position++;
    }

    private expression(): SizeExpr {
        let left = this.term();
        while (this.isPunct('+') || this.isPunct('-')) {
            const op = (this.tokens[this.position++] as { value: '+' | '-' }).value;
            left = { kind: 'binary', op, left, right: this.term() };
        }
        return left;
    }

    private term(): SizeExpr {
        let left = this.unary();
        while (this.isPunct('*') || this.isPunct('/') || this.isPunct('%')) {
            const op = (this.tokens[this.position++] as { value: '*' | '/' | '%' }).value;
            left = { kind: 'binary', op, left, right: this.unary() };
        }
        return left;
    }

    private unary(): SizeExpr {
        if (this.isPunct('-')) {
            this.position++;
            return { kind: 'negate', operand: this.unary() };
        }
        return this.primary();
    }

    private primary(): SizeExpr {
        const token = this.tokens[this.position++];
        switch (token.kind) {
            case 'number':
                return { kind: 'number', value: token.value };
            case 'variable':
                return { kind: 'variable', name: token.name };
            case 'ident':
                return this.call(token.name);
            case 'punct':
                if (token.value === '(') {
                    const inner = this.expression();
                    this.expect(')');
                    return inner;
                }
                throw new SizeExpressionError(`unexpected "${token.value}"`);
            case 'end':
                throw new SizeExpressionError('unexpected end of expression');
        }
    }

    private call(name: string): SizeExpr {
        if (!Object.hasOwn(FUNCTIONS, name)) {
            throw new SizeExpressionError(`unknown function or bare name "${name}"`);
        }
        if (!this.isPunct('(')) {
            throw new SizeExpressionError(`function "${name}" must be called`);
        }
        this.position++;
        const args: SizeExpr[] = [this.expression()];
        while (this.isPunct(',')) {
            this.position++;
            args.push(this.expression());
        }
        this.expect(')');
        const [min, max] = FUNCTIONS[name as SizeFunction];
        if (args.length < min || args.length > max) {
            throw new SizeExpressionError(
                `function "${name}" takes ${min === max ? min : `at least ${min}`} argument(s)`
            );
        }
        return { kind: 'call', fn: name as SizeFunction, args };
    }
}

export function parseSizeExpression(source: string): SizeExpr {
    return new Parser(tokenize(source)).parse();
}

function precedence(op: '+' | '-' | '*' | '/' | '%'): number {
    return op === '+' || op === '-' ? 1 : 2;
}

function formatOperand(expr: SizeExpr, parentPrecedence: number, isRightOperand: boolean): string {
    const text = formatSizeExpression(expr);
    if (expr.kind !== 'binary') {
        return text;
    }
    const own = precedence(expr.op);
    // Operators are left-associative, so an equal-precedence right operand needs its parentheses.
    return own < parentPrecedence || (isRightOperand && own === parentPrecedence) ? `(${text})` : text;
}

/** Source text that `parseSizeExpression` parses back into an equal tree. */
export function formatSizeExpression(expr: SizeExpr): string {
    switch (expr.kind) {
        case 'number':
            return String(expr.value);
        case 'variable':
            return `$${expr.name}`;
        case 'negate':
            return expr.operand.kind === 'binary'
                ? `-(${formatSizeExpression(expr.operand)})`
                : `-${formatSizeExpression(expr.operand)}`;
        case 'binary': {
            const own = precedence(expr.op);
            return `${formatOperand(expr.left, own, false)} ${expr.op} ${formatOperand(expr.right, own, true)}`;
        }
        case 'call':
            return `${expr.fn}(${expr.args.map(formatSizeExpression).join(', ')})`;
    }
}

/** User control names an expression reads, excluding `$WIDTH` and `$HEIGHT`. */
export function collectControlRefs(expr: SizeExpr, into = new Set<string>()): Set<string> {
    switch (expr.kind) {
        case 'variable':
            if (expr.name !== 'WIDTH' && expr.name !== 'HEIGHT') {
                into.add(expr.name);
            }
            break;
        case 'negate':
            collectControlRefs(expr.operand, into);
            break;
        case 'binary':
            collectControlRefs(expr.left, into);
            collectControlRefs(expr.right, into);
            break;
        case 'call':
            for (const arg of expr.args) {
                collectControlRefs(arg, into);
            }
            break;
        case 'number':
            break;
    }
    return into;
}

export function evaluateSizeExpression(expr: SizeExpr, env: SizeExpressionEnv): number {
    const value = evaluate(expr, env);
    if (!Number.isFinite(value)) {
        throw new SizeExpressionError('expression did not evaluate to a finite number');
    }
    return value;
}

function evaluate(expr: SizeExpr, env: SizeExpressionEnv): number {
    switch (expr.kind) {
        case 'number':
            return expr.value;
        case 'variable':
            return readVariable(expr.name, env);
        case 'negate':
            return -evaluate(expr.operand, env);
        case 'binary':
            return applyBinary(expr.op, evaluate(expr.left, env), evaluate(expr.right, env));
        case 'call':
            return applyCall(
                expr.fn,
                expr.args.map(arg => evaluate(arg, env))
            );
    }
}

function readVariable(name: string, env: SizeExpressionEnv): number {
    if (name === 'WIDTH') {
        return env.width;
    }
    if (name === 'HEIGHT') {
        return env.height;
    }
    const control = Object.hasOwn(env.controls, name) ? env.controls[name] : undefined;
    if (control === undefined) {
        throw new SizeExpressionError(`unknown control "$${name}"`);
    }
    if (typeof control === 'boolean') {
        return control ? 1 : 0;
    }
    return control;
}

function applyBinary(op: '+' | '-' | '*' | '/' | '%', left: number, right: number): number {
    switch (op) {
        case '+':
            return left + right;
        case '-':
            return left - right;
        case '*':
            return left * right;
        case '/':
            return left / right;
        case '%':
            return left % right;
    }
}

function applyCall(fn: SizeFunction, args: readonly number[]): number {
    switch (fn) {
        case 'min':
            return Math.min(...args);
        case 'max':
            return Math.max(...args);
        case 'floor':
            return Math.floor(args[0]);
        case 'ceil':
            return Math.ceil(args[0]);
        case 'round':
            return Math.round(args[0]);
        case 'abs':
            return Math.abs(args[0]);
        case 'clamp':
            return Math.min(Math.max(args[0], args[1]), args[2]);
    }
}

/** Integer dimension of at least 1 and at most the backend's texture limit. */
export function clampDimension(value: number, maxTextureSize: number): number {
    return Math.min(Math.max(1, Math.floor(value)), maxTextureSize);
}
