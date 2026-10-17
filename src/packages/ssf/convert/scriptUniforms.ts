/** Finds script outputs whose names and component counts can be inferred without executing the script. */

export type ScriptUniformType = 'float' | 'vec2' | 'vec3' | 'vec4';

export interface ScriptUniformScan {
    /** Statically named uniforms with the type their writes imply. */
    readonly named: ReadonlyMap<string, ScriptUniformType>;
    /** Prefixes of names built at run time, such as `'spectrum_' + i`. */
    readonly prefixes: ReadonlySet<string>;
    /** Named outputs with a write whose component count cannot be proven. */
    readonly unresolved: ReadonlySet<string>;
}

const TYPES: readonly ScriptUniformType[] = ['float', 'vec2', 'vec3', 'vec4'];

function typeForCount(count: number): ScriptUniformType {
    return TYPES[Math.min(Math.max(count, 1), 4) - 1];
}

function wider(a: ScriptUniformType | undefined, b: ScriptUniformType): ScriptUniformType {
    return a === undefined || TYPES.indexOf(b) > TYPES.indexOf(a) ? b : a;
}

function structure(source: string, preserveStrings = false): string {
    return source.replaceAll(/(['"`])(?:\\[\s\S]|(?!\1)[^\\])*?\1|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, text =>
        preserveStrings && !text.startsWith('/') ? text : text.replaceAll(/[^\r\n]/g, ' ')
    );
}

function closing(structural: string, start: number): number {
    let depth = 1;
    for (let i = start + 1; i < structural.length; i++) {
        if ('([{'.includes(structural[i])) depth++;
        else if (')]}'.includes(structural[i]) && --depth === 0) return i;
    }
    return structural.length;
}

function splitValues(source: string): string[] {
    const structural = structure(source);
    const values: string[] = [];
    let start = 0;
    for (let i = 0; i < structural.length; i++) {
        if ('([{'.includes(structural[i])) i = closing(structural, i);
        else if (structural[i] === ',') {
            values.push(source.slice(start, i).trim());
            start = i + 1;
        }
    }
    const last = source.slice(start).trim();
    if (last !== '') values.push(last);
    return values;
}

function assignedValue(source: string, structural: string, start: number): string {
    while (start < structural.length && /\s/.test(structural[start])) start++;
    let end = start;
    for (; end < structural.length; end++) {
        if ('([{'.includes(structural[end])) end = closing(structural, end);
        else if (';,\r\n)]}'.includes(structural[end])) break;
    }
    return source.slice(start, end).trim();
}

function componentType(components: ReadonlySet<string>): ScriptUniformType | undefined {
    let count = 0;
    for (const [coordinate, color] of [
        ['x', 'r'],
        ['y', 'g'],
        ['z', 'b'],
        ['w', 'a'],
    ]) {
        if (!components.has(coordinate) && !components.has(color)) break;
        count++;
    }
    return count === 0 ? undefined : typeForCount(count);
}

function objectType(expression: string): ScriptUniformType | undefined {
    const components = new Set<string>();
    for (const property of splitValues(expression.slice(1, -1))) {
        const key = /^(?:([A-Za-z_$][\w$]*)|['"](\w+)['"])\s*:/.exec(property);
        if (key === null) return undefined;
        components.add(key[1] || key[2]);
    }
    return componentType(components);
}

function valueType(
    value: string,
    bindings: ReadonlyMap<string, ScriptUniformType | undefined>,
    constructors: ReadonlyMap<string, ScriptUniformType>
): ScriptUniformType | undefined {
    let expression = structure(value, true).trim();
    while (expression.startsWith('(') && closing(structure(expression), 0) === expression.length - 1)
        expression = expression.slice(1, -1).trim();
    if (expression.startsWith('[') && closing(structure(expression), 0) === expression.length - 1) {
        const values = splitValues(expression.slice(1, -1));
        return values.some(part => part.startsWith('...')) ? undefined : typeForCount(values.length);
    }
    if (expression.startsWith('{') && closing(structure(expression), 0) === expression.length - 1) {
        return objectType(expression);
    }
    const instance = /^new\s+([A-Za-z_$][\w$]*)/.exec(expression);
    if (instance !== null) {
        const argumentsText = expression.slice(instance[0].length).trim();
        if (
            argumentsText === '' ||
            (argumentsText.startsWith('(') && closing(structure(argumentsText), 0) === argumentsText.length - 1)
        )
            return constructors.get(instance[1]);
        return undefined;
    }
    if (/^[A-Za-z_$][\w$]*$/.test(expression)) return bindings.get(expression);
    if ((expression !== '' && Number.isFinite(Number(expression))) || ['true', 'false'].includes(expression))
        return 'float';
    if (expression.includes('?')) return undefined;
    if (
        /\.(?:x|y|z|w|r|g|b|a|length)\s*$/.test(expression) ||
        /^(?:Math\.\w+|Number|parseFloat|parseInt)\s*\(/.test(expression)
    )
        return 'float';
    if (/[+*/%<>]|(?:^|\s)-(?:\s|\d)/.test(structure(expression))) return 'float';
    return undefined;
}

export function scanScriptUniforms(script: string): ScriptUniformScan {
    const named = new Map<string, ScriptUniformType>();
    const prefixes = new Set<string>();
    const unresolved = new Set<string>();
    const note = (name: string, type: ScriptUniformType | undefined): void => {
        if (type === undefined) unresolved.add(name);
        named.set(name, wider(named.get(name), type ?? 'float'));
    };
    const structural = structure(script);
    const constructors = new Map<string, ScriptUniformType>();
    for (const fn of structural.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) {
        const start = fn.index + fn[0].length - 1;
        const body = structural.slice(start + 1, closing(structural, start));
        if (/\b(?:if|for|while|switch|try|function)\b|\?/.test(body)) continue;
        const components = new Set([...body.matchAll(/\bthis\.(x|y|z|w|r|g|b|a)\s*=(?!=)/g)].map(part => part[1]));
        const type = componentType(components);
        if (type !== undefined) constructors.set(fn[1], type);
    }
    const bindings = new Map<string, ScriptUniformType | undefined>();
    for (const match of structural.matchAll(/\b([A-Za-z_$][\w$]*)\s*=(?!=)/g)) {
        if (structural[match.index - 1] === '.') continue;
        const start = match.index + match[0].length;
        const type = valueType(assignedValue(script, structural, start), bindings, constructors);
        bindings.set(match[1], type);
    }
    for (const match of structural.matchAll(/\buniforms\s*\.\s*([A-Za-z_$][\w$]*)\s*=(?!=)/g)) {
        const start = match.index + match[0].length;
        note(match[1], valueType(assignedValue(script, structural, start), bindings, constructors));
    }
    scanBracketUniforms(script, structural, prefixes, value => valueType(value, bindings, constructors), note);
    const callType = (values: string[]): ScriptUniformType | undefined => {
        if (values.some(value => structure(value, true).trim().startsWith('...'))) return undefined;
        const first = valueType(values.length === 0 ? '' : values[0], bindings, constructors);
        return values.length > 1 ? wider(first, typeForCount(values.length)) : first;
    };
    for (const match of structural.matchAll(/\bsetUniform\s*\(/g)) {
        const open = match.index + match[0].length - 1;
        const [name, ...values] = splitValues(script.slice(open + 1, closing(structural, open)));
        const literal = /^(['"])([^'"]+)\1$/.exec(name);
        if (literal !== null) note(literal[2], callType(values));
        else {
            const indexed = /^(\w+)\s*\[[\s\S]+\]$/.exec(name);
            if (indexed === null) continue;
            const declaration = new RegExp(`\\b${indexed[1]}\\s*=\\s*\\[([^\\]]*)\\]`).exec(script);
            if (declaration === null) continue;
            for (const item of declaration[1].matchAll(/['"]([^'"]+)['"]/g)) note(item[1], callType(values));
        }
    }
    scanForwardedUniforms(script, structural, callType, note);
    return { named, prefixes, unresolved };
}

function scanBracketUniforms(
    script: string,
    structural: string,
    prefixes: Set<string>,
    infer: (value: string) => ScriptUniformType | undefined,
    note: (name: string, type: ScriptUniformType | undefined) => void
): void {
    for (const match of structural.matchAll(/\buniforms\s*\[/g)) {
        const open = match.index + match[0].length - 1;
        const end = closing(structural, open);
        const key = script.slice(open + 1, end).trim();
        const literal = /^(['"])([^'"]+)\1$/.exec(key);
        const assignment = /^\s*=(?!=)\s*/.exec(structural.slice(end + 1));
        if (literal !== null && assignment !== null) {
            const start = end + 1 + assignment[0].length;
            note(literal[2], infer(assignedValue(script, structural, start)));
        } else {
            const prefix = /^(['"])([^'"]+)\1\s*\+/.exec(key);
            if (prefix !== null) prefixes.add(prefix[2]);
        }
    }
}

function scanForwardedUniforms(
    script: string,
    structural: string,
    callType: (values: string[]) => ScriptUniformType | undefined,
    note: (name: string, type: ScriptUniformType | undefined) => void
): void {
    for (const fn of structural.matchAll(/\bfunction\s+(\w+)\s*\(([^)]*)\)\s*\{/g)) {
        const parameter = /^\s*(\w+)/.exec(fn[2]);
        if (parameter === null) continue;
        const start = fn.index + fn[0].length - 1;
        const body = structural.slice(start + 1, closing(structural, start));
        const setter = new RegExp(`\\bsetUniform\\s*\\(\\s*${parameter[1]}\\s*,`).exec(body);
        if (setter === null) continue;
        const open = start + 1 + setter.index + setter[0].indexOf('(');
        const type = callType(splitValues(script.slice(open + 1, closing(structural, open))).slice(1));
        const calls = new RegExp(`\\b${fn[1]}\\s*\\(`, 'g');
        for (const call of structural.matchAll(calls)) {
            const callOpen = call.index + call[0].length - 1;
            const [name] = splitValues(script.slice(callOpen + 1, closing(structural, callOpen)));
            const literal = /^(['"])([^'"]+)\1$/.exec(name);
            if (literal !== null) note(literal[2], type);
        }
    }
}
