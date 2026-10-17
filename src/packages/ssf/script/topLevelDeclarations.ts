/** Names a script declares at its top level, found without a parser: strings, comments and nested blocks are skipped. */
export function topLevelDeclarations(source: string): Set<string> {
    const names = new Set<string>();
    let depth = 0;
    let i = 0;
    while (i < source.length) {
        const char = source[i];
        const next = source[i + 1];
        if (char === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') i++;
        } else if (char === '/' && next === '*') {
            const end = source.indexOf('*/', i + 2);
            i = end === -1 ? source.length : end + 2;
        } else if (char === '"' || char === "'" || char === '`') {
            i++;
            while (i < source.length && source[i] !== char) i += source[i] === String.fromCodePoint(92) ? 2 : 1;
            i++;
        } else if (char === '{' || char === '(' || char === '[') {
            depth++;
            i++;
        } else if (char === '}' || char === ')' || char === ']') {
            depth--;
            i++;
        } else if (depth === 0 && /[a-z]/.test(char) && (i === 0 || !/[\w$.]/.test(source[i - 1]))) {
            const match = /^(?:var|let|const|function)\s+([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))*/.exec(
                source.slice(i, i + 200)
            );
            if (match === null) {
                i++;
            } else {
                names.add(match[1]);
                i += match[0].length;
            }
        } else {
            i++;
        }
    }
    return names;
}
