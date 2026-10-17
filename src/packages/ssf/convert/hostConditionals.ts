import { detokenize, tokenize } from './glslText';

/** Kodelife fallback branches are inactive in the SSF host and must not shadow host helpers. */
export function stripKodelifeBranches(source: string): string {
    if (/^\s*#\s*define\s+KODELIFE\b/m.test(source)) return source;
    const stack: Array<{ parent: boolean; known: boolean; branch: boolean }> = [];
    let active = true;
    return detokenize(
        tokenize(source).map(token => {
            if (token.kind === 'directive') {
                const opening = /^#\s*(ifdef|ifndef|if)\b(.*)/.exec(token.text);
                if (opening !== null) {
                    const known = /^\s*KODELIFE\s*$/.test(opening[2]) && opening[1] !== 'if';
                    const branch = !known || opening[1] === 'ifndef';
                    stack.push({ parent: active, known, branch });
                    active = active && branch;
                    if (known || !active) return { ...token, text: '' };
                } else if (/^#\s*else\b/.test(token.text)) {
                    const frame = stack.at(-1);
                    if (frame !== undefined) {
                        frame.branch = frame.known ? !frame.branch : true;
                        active = frame.parent && frame.branch;
                        if (frame.known || !frame.parent) return { ...token, text: '' };
                    }
                } else if (/^#\s*endif\b/.test(token.text)) {
                    const frame = stack.pop();
                    if (frame !== undefined) {
                        active = frame.parent;
                        if (frame.known || !active) return { ...token, text: '' };
                    }
                }
            }
            return active ? token : { ...token, text: token.text.replaceAll(/[^\n]/g, '') };
        })
    );
}
