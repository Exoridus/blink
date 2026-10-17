import { collectControlRefs, parseSizeExpression, SizeExpressionError } from '../../../runtime/ir/sizeExpression';

export interface TranslatedSize {
    /** A pixel count or an expression string the render-target pool understands; null for "screen size". */
    readonly value: string | number | null;
    /** Whether the size follows the screen or a control, which the package then has to declare. */
    readonly dynamic: boolean;
    readonly error?: string;
}

/**
 * ISF writes pass sizes as numbers or as equations over `$WIDTH`, `$HEIGHT` and `$<input>`.
 * Blink accepts the same shape through a closed grammar, so an equation is checked against it
 * here and carried over verbatim; one that needs more (a function Blink does not have, a
 * variable that is no control) is reported rather than approximated.
 */
export function translateSizeExpression(raw: unknown, controlNames: ReadonlySet<string>): TranslatedSize {
    if (raw === undefined || raw === null || raw === '') return { value: null, dynamic: false };
    if (typeof raw === 'number') {
        return Number.isFinite(raw) && raw > 0
            ? { value: Math.round(raw), dynamic: false }
            : { value: null, dynamic: false, error: `size ${raw} is not a positive number` };
    }
    if (typeof raw !== 'string')
        return { value: null, dynamic: false, error: 'size is neither a number nor an equation' };

    const text = raw.trim();
    if (/^\d+(\.\d+)?$/.test(text)) return { value: Math.round(Number(text)), dynamic: false };

    try {
        const expression = parseSizeExpression(text);
        const unknown = [...collectControlRefs(expression)].filter(name => !controlNames.has(name));
        if (unknown.length > 0) {
            return {
                value: null,
                dynamic: true,
                error: `"${text}" refers to ${unknown.map(name => `$${name}`).join(', ')}, which is not a numeric input`,
            };
        }
        return { value: text, dynamic: true };
    } catch (error) {
        if (error instanceof SizeExpressionError)
            return { value: null, dynamic: true, error: `"${text}": ${error.message}` };
        throw error;
    }
}
