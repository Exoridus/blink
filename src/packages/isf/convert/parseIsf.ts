/**
 * An ISF file is GLSL with a JSON header in its first block comment. This splits the two without
 * disturbing line numbers: the header's lines stay in the body as blank lines, so a compile error
 * still points at the line the author wrote.
 */

export interface IsfParts {
    /** The parsed header, or null when there is none or it is not valid JSON. */
    readonly header: Record<string, unknown> | null;
    readonly headerError: string | null;
    readonly body: string;
}

/** JSON as ISF authors write it: line comments and trailing commas are common in the wild. */
function relaxedParse(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        const cleaned = text.replaceAll(/^\s*\/\/.*$/gm, '').replaceAll(/,(\s*[\]}])/g, '$1');
        return JSON.parse(cleaned);
    }
}

export function splitIsf(text: string): IsfParts {
    const start = text.search(/\S/);
    if (start === -1 || !text.startsWith('/*', start)) {
        return { header: null, headerError: null, body: text };
    }
    const end = text.indexOf('*/', start + 2);
    if (end === -1) {
        return { header: null, headerError: 'the header comment is not closed', body: text };
    }

    const raw = text.slice(start + 2, end);
    const blankedHeader = raw.replaceAll(/[^\n]/g, '');
    const body = `${text.slice(0, start)}${blankedHeader}  ${text.slice(end + 2)}`;
    try {
        const parsed = relaxedParse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return { header: null, headerError: 'the header is not a JSON object', body };
        }
        return { header: parsed as Record<string, unknown>, headerError: null, body };
    } catch (error) {
        return {
            header: null,
            headerError: `the header is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
            body,
        };
    }
}
