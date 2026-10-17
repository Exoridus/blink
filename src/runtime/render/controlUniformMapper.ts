import type { BlinkControlSpec } from '../ir/types';

export type UniformValue = number | Float32Array | Int32Array;

export interface ControlUniformEntry {
    readonly name: string;
    readonly glslDeclaration: string;
    readonly defaultValue: UniformValue;
}

const GLSL_TYPE_MAP: Record<string, string> = {
    float: 'float',
    int: 'int',
    bool: 'bool',
    color: 'vec4',
    enum: 'int',
    point2d: 'vec2',
};

function buildDefault(control: BlinkControlSpec): UniformValue {
    switch (control.type) {
        case 'float':
            return control.default;
        case 'int':
            return control.default;
        case 'bool':
            return control.default ? 1 : 0;
        case 'color':
            return new Float32Array(control.default);
        case 'enum':
            return control.options.indexOf(control.default);
        case 'point2d':
            return new Float32Array(control.default);
        case 'bang':
            return 0;
    }
}

export function mapControlSpec(control: BlinkControlSpec): ControlUniformEntry | null {
    const glslType = GLSL_TYPE_MAP[control.type];
    if (glslType === undefined) {
        return null;
    }

    return {
        name: control.name,
        glslDeclaration: `uniform ${glslType} ${control.name};`,
        defaultValue: buildDefault(control),
    };
}

export function mapControlSpecs(controls: readonly BlinkControlSpec[]): ControlUniformEntry[] {
    const entries: ControlUniformEntry[] = [];
    for (const c of controls) {
        if (c.type === 'bang') {
            continue;
        }
        const entry = mapControlSpec(c);
        if (entry !== null) {
            entries.push(entry);
        }
    }
    return entries;
}
