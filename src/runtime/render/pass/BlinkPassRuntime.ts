import {
    Color,
    DataTexture,
    Mesh,
    MeshMaterial,
    type RenderTexture,
    Shader,
    TextureFormat,
    type UniformValue,
} from '@codexo/exojs';

import type { BlinkSourceRef } from '../../ir/sourceRef';
import type { BlinkEffectIR, BlinkRenderTargetSpec } from '../../ir/types';
import { buildBlinkPrelude, buildDefaultUniformValues } from '../BlinkPrelude';
import { stripGlslPreamble } from '../stripGlslPreamble';
import { upgradeFragmentShaderToGl300 } from '../upgradeFragmentShaderToGl300';
import { buildWgslProgram } from '../wgsl/buildWgslProgram';
import { BlinkFullscreenMesh } from './BlinkFullscreenMesh';
import { buildPassPrelude } from './buildPassPrelude';
import { buildVertexSource } from './buildVertexSource';
import { encodedPresentation } from './encodedPresentation';
import type { CompiledPass, PassDrawContext } from './executePasses';
import { executePasses } from './executePasses';
import { computePassDiagnostics, type PassDiagnostics } from './passDiagnostics';
import { planPasses } from './planPasses';
import { type ColorFormatProbe, RenderTargetPool } from './RenderTargetPool';
import type { PassResourceStore } from './resolvePassInput';
import { resolvePassInput } from './resolvePassInput';

/** A pass program's text: fragment source alone, or paired with a vertex stage replacing the fullscreen one. */
export type ResolvedPassShader = string | { readonly fragment: string; readonly vertex?: string | null };

/** Default resource store when the runtime is built without one: every non-target source binds the dummy texture. */
const NULL_RESOURCE_STORE: PassResourceStore = {
    asset: () => {},
    hostInput: () => {},
    blinkAudio: () => {},
};

export const FULLSCREEN_VERTICES = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

export const FULLSCREEN_VERTEX_SOURCE = `#version 300 es
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec4 a_color;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export interface BlinkPassBuildOptions {
    readonly fullscreenRenderer?: boolean;
    readonly screenColor?: 'linear' | 'encoded';
    readonly opaqueOutput?: boolean;
    readonly screen: { width: number; height: number };
    readonly clearColor?: Color;
    readonly supportsFormat?: ColorFormatProbe;
    readonly store?: PassResourceStore;
    readonly allowFloatDowngrade?: boolean;
    readonly maxTextureSize?: number;
    /** Host-owned scalar uniforms with neutral values; their names become each material's schema. */
    readonly frameUniforms?: Readonly<Record<string, UniformValue>>;
    /** GLSL a compatibility profile declares ahead of the pass samplers, such as its scalar uniforms. */
    readonly profilePrelude?: string;
    /**
     * The language the resolved shaders are written in, which is the shading language of the active
     * backend: GLSL for WebGL2, WGSL for WebGPU. Defaults to GLSL.
     */
    readonly language?: 'glsl' | 'wgsl';
}

/**
 * Compiles a BlinkEffectIR pass graph into fullscreen-quad meshes and drives
 * the per-frame multipass render loop, ping-ponging persistent targets.
 */
export class BlinkPassRuntime {
    private passes: CompiledPass[] = [];
    private pool: RenderTargetPool | null = null;
    private parity = 0;
    private clearColor = new Color(0, 0, 0, 1);
    private dummyTexture: DataTexture<TextureFormat.Rgba8> | null = null;
    private store: PassResourceStore = NULL_RESOURCE_STORE;
    private screenSize: readonly [number, number] = [0, 0];
    private renderTargets: readonly BlinkRenderTargetSpec[] = [];
    private declaredUniforms = new WeakMap<MeshMaterial, ReadonlySet<string>>();

    public build(
        effect: BlinkEffectIR,
        resolvedShaders: ReadonlyMap<string, ResolvedPassShader>,
        options: BlinkPassBuildOptions
    ): void {
        const {
            screen,
            clearColor,
            supportsFormat,
            store = NULL_RESOURCE_STORE,
            allowFloatDowngrade = false,
            maxTextureSize,
            frameUniforms = {},
            profilePrelude = '',
            language = 'glsl',
            screenColor = 'linear',
            opaqueOutput = true,
        } = options;
        if (language === 'wgsl' && screenColor === 'encoded') throw new Error('Encoded output adapter requires GLSL');
        this.dispose();
        if (clearColor !== undefined) {
            this.clearColor = clearColor;
        }
        this.store = store;
        this.screenSize = [screen.width, screen.height];

        const plan = planPasses(effect);
        this.pool = new RenderTargetPool(plan.renderTargets, screen, undefined, supportsFormat, allowFloatDowngrade, {
            maxTextureSize,
            controls: buildDefaultUniformValues(effect.controls),
        });
        this.renderTargets = plan.renderTargets;

        const preludeSource = buildBlinkPrelude(effect.controls).source;
        // Passes share one shader source, so every pass's material must declare
        // ALL sampler uniforms bound by ANY pass (the union), not just the ones
        // this pass binds, otherwise the shared shader fails to compile for a
        // pass that references a sampler only in another PASSINDEX/bl_pass
        // branch. This is the single sampler-declaration site for both native
        // and SSF effects; for both, the uniform name equals the render-target
        // name, so this union equals the render-target union.
        const allSamplerNames = [...new Set(plan.passes.flatMap(pass => pass.inputs.map(input => input.uniform)))];
        const passPrelude = buildPassPrelude(allSamplerNames);

        this.dummyTexture = new DataTexture({
            width: 1,
            height: 1,
            format: TextureFormat.Rgba8,
            data: new Uint8Array([0, 0, 0, 0]),
        });
        this.dummyTexture.commit();

        // A material's uniform schema is fixed when it is constructed and `setUniform` rejects any
        // name outside it, so every value the host will ever upload to a pass has to be declared here,
        // with a value of the right kind.
        const declaredScalars: Record<string, UniformValue> = {
            ...frameUniforms,
            ...buildDefaultUniformValues(effect.controls),
        };
        const dummyTexture = this.dummyTexture;

        this.passes = plan.passes.map(pass => {
            const resolved = resolvedShaders.get(pass.shaderKey);
            if (resolved === undefined) {
                throw new Error(`BlinkPassRuntime: no resolved shader for key "${pass.shaderKey}"`);
            }
            const { fragment, vertex } = typeof resolved === 'string' ? { fragment: resolved, vertex: null } : resolved;
            // A mesh material binds at most seven textures, and every texture in its schema counts
            // whether the shader reads it or not. The schema therefore holds only what this pass
            // binds; the GLSL sampler declarations stay shared across passes.
            const declared: Record<string, UniformValue> = { ...declaredScalars };
            for (const input of pass.inputs) {
                declared[input.uniform] = dummyTexture;
            }
            const upgraded = stripGlslPreamble(upgradeFragmentShaderToGl300(fragment));
            const presented =
                screenColor === 'encoded' && pass.target.kind === 'screen'
                    ? encodedPresentation(upgraded, opaqueOutput)
                    : upgraded;
            const material =
                language === 'wgsl'
                    ? MeshMaterial.from(
                          new Shader({
                              // A WGSL program declares exactly the textures of its own pass: the module is
                              // compiled per pass, and a binding the material does not carry would not link.
                              wgsl: buildWgslProgram({
                                  uniformNames: Object.keys(declaredScalars),
                                  textures: [
                                      ...new Map(
                                          pass.inputs.map(input => [input.uniform, input.source.kind === 'target'])
                                      ).entries(),
                                  ].map(([name, renderTarget]) => ({ name, renderTarget })),
                                  controls: effect.controls,
                                  source: fragment,
                              }),
                          }),
                          { uniforms: declared }
                      )
                    : MeshMaterial.from(
                          vertex === null || vertex === undefined
                              ? FULLSCREEN_VERTEX_SOURCE
                              : buildVertexSource(vertex, effect.controls),
                          `${preludeSource}\n${profilePrelude}\n${passPrelude}\n${presented}`,
                          { uniforms: declared }
                      );
            this.declaredUniforms.set(material, new Set(Object.keys(declared)));
            const needsFullscreenRenderer =
                (language === 'glsl' && options.fullscreenRenderer === true) || pass.inputs.length > 7;
            if (needsFullscreenRenderer && (language !== 'glsl' || options.fullscreenRenderer !== true)) {
                throw new Error(
                    `Pass "${pass.name}" requires the WebGL2 fullscreen renderer for ${pass.inputs.length} textures`
                );
            }
            const mesh = needsFullscreenRenderer
                ? new BlinkFullscreenMesh({
                      vertices: FULLSCREEN_VERTICES,
                      material,
                      vertexSource:
                          vertex === null || vertex === undefined
                              ? FULLSCREEN_VERTEX_SOURCE
                              : buildVertexSource(vertex, effect.controls),
                      fragmentSource: `${preludeSource}\n${profilePrelude}\n${passPrelude}\n${presented}`,
                  })
                : new Mesh({ vertices: FULLSCREEN_VERTICES, material });
            return {
                name: pass.name,
                mesh,
                material,
                target: pass.target,
                inputs: pass.inputs,
                clear: pass.clear,
                passIndex: pass.passIndex,
            };
        });
    }

    public execute(
        context: PassDrawContext,
        uploadFrameUniforms: (material: MeshMaterial, passIndex: number, resolution: readonly [number, number]) => void,
        controlValues?: Readonly<Record<string, unknown>>
    ): void {
        const { pool, dummyTexture } = this;
        if (pool === null || dummyTexture === null || this.passes.length === 0) {
            return;
        }
        // Size expressions follow live control values; a reallocated target starts with empty
        // history, so this runs before any pass reads or writes this frame.
        if (controlValues !== undefined) {
            pool.updateControls(controlValues);
        }
        const resolveInput = (source: BlinkSourceRef, parity: number): UniformValue =>
            resolvePassInput(source, pool, parity, this.store, dummyTexture);
        executePasses(
            context,
            this.passes,
            pool,
            this.parity,
            this.clearColor,
            uploadFrameUniforms,
            resolveInput,
            this.screenSize
        );
        this.parity ^= 1;
    }

    /** Whether this pass material was built with a slot for the uniform, and so accepts an upload. */
    public isDeclared(material: MeshMaterial, name: string): boolean {
        return this.declaredUniforms.get(material)?.has(name) ?? false;
    }

    public resize(width: number, height: number): void {
        this.screenSize = [width, height];
        this.pool?.resize(width, height);
    }

    /** Per-pass output resolution and color format, for a debug panel. Empty before the first build(). */
    public describePasses(): readonly PassDiagnostics[] {
        if (this.pool === null) {
            return [];
        }
        return computePassDiagnostics(this.passes, this.pool, this.screenSize, this.renderTargets);
    }

    /** Latest completed offscreen attachments; callers request readback only while inspecting. */
    public inspectTargets(): ReadonlyArray<{ name: string; texture: RenderTexture; format: string }> {
        const pool = this.pool;
        if (pool === null) return [];
        return this.renderTargets.map(target => ({
            name: target.name,
            texture: pool.write(target.name, this.parity ^ 1),
            format: target.format,
        }));
    }

    public dispose(): void {
        for (const pass of this.passes) {
            pass.material.destroy();
        }
        this.passes = [];
        this.pool?.dispose();
        this.pool = null;
        this.parity = 0;
        this.dummyTexture?.destroy();
        this.dummyTexture = null;
        this.renderTargets = [];
        this.declaredUniforms = new WeakMap();
    }
}
