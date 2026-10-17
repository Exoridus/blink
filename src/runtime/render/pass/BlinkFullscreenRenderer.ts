import { DataTexture, type MeshMaterial, RenderTexture, Texture, type UniformValue } from '@codexo/exojs';
import {
    AbstractWebGl2Renderer,
    createWebGl2ShaderProgram,
    type WebGl2Backend,
    WebGl2Shader,
    WebGl2VertexArrayObject,
} from '@codexo/exojs/renderer-sdk';

import { BlinkFullscreenMesh } from './BlinkFullscreenMesh';

interface FullscreenResources {
    readonly shader: WebGl2Shader;
    readonly vao: WebGl2VertexArrayObject;
    readonly buffers: readonly WebGLBuffer[];
}

function requireResource<T>(value: T | null, kind: string): T {
    if (value === null) {
        throw new Error(`Could not allocate Blink fullscreen ${kind}`);
    }
    return value;
}

/** Uses the device's sampler capacity while retaining ExoJS pass and texture ownership. */
export class BlinkFullscreenRenderer extends AbstractWebGl2Renderer<BlinkFullscreenMesh> {
    private readonly resources = new Map<BlinkFullscreenMesh, FullscreenResources>();
    private readonly observedMaterials = new WeakSet<MeshMaterial>();
    private maxTextures = 0;
    private generatedInputMips = new WeakMap<Texture, number>();

    protected onConnect(backend: WebGl2Backend): void {
        const gl = backend.context;
        this.maxTextures = Math.min(
            Number(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)),
            Number(gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS))
        );
    }

    protected onDisconnect(): void {
        for (const mesh of this.resources.keys()) {
            this.release(mesh);
        }
        this.maxTextures = 0;
        this.generatedInputMips = new WeakMap<Texture, number>();
    }

    public render(mesh: BlinkFullscreenMesh): void {
        const backend = this.getBackend();
        const material = mesh.passMaterial;
        const resource = this.resources.get(mesh) ?? this.create(mesh, material);
        const { shader, vao } = resource;
        const values = { ...material.uniforms, ...material.textures };
        const textures = Object.entries(values).filter(
            ([name, value]) => shader.uniforms.has(name) && (value instanceof Texture || value instanceof RenderTexture)
        );
        if (textures.length > this.maxTextures) {
            throw new RangeError(
                `Blink fullscreen pass needs ${textures.length} texture bindings; hardware supports ${this.maxTextures}`
            );
        }
        backend.setDepthWrite(material.writesDepth);
        backend.bindShader(shader);
        backend.stageViewportUniform(shader);
        let slot = 0;
        for (const [name, value] of Object.entries(values)) {
            const uniform = shader.uniforms.get(name);
            if (uniform === undefined) {
                continue;
            }
            if (value instanceof Texture || value instanceof RenderTexture) {
                backend.bindTexture(value, slot);
                if (
                    value instanceof Texture &&
                    value.generateMipMap &&
                    (value instanceof DataTexture || value.pixels?.levels.length === 1)
                ) {
                    const gl = backend.context;
                    const lastLevel = Math.floor(Math.log2(Math.max(1, value.width, value.height)));
                    // GPU eviction can replace storage without changing the producer version.
                    if (
                        this.generatedInputMips.get(value) !== value.version ||
                        gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL) !== lastLevel
                    ) {
                        // Numeric/pixel uploads clamp to level zero and omit automatic mip generation.
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, lastLevel);
                        gl.generateMipmap(gl.TEXTURE_2D);
                        this.generatedInputMips.set(value, value.version);
                    }
                }
                uniform.setValue(new Int32Array([slot++]));
            } else {
                uniform.setValue(this.scalar(value));
            }
        }
        shader.sync();
        backend.bindVertexArrayObject(vao);
        const gl = backend.context;
        const blendEnabled = gl.isEnabled(gl.BLEND);
        // A pass defines complete attachment values, including alpha/data, in its shader.
        gl.disable(gl.BLEND);
        try {
            vao.draw(mesh.indexCount, 0);
            backend.stats.batches++;
            backend.stats.drawCalls++;
            const target = backend.renderTarget;
            if (target instanceof RenderTexture && target.generateMipMap) {
                // Allocation-time mipmaps become stale as soon as the base level is drawn.
                backend.bindTexture(target, 0);
                gl.generateMipmap(gl.TEXTURE_2D);
                backend.bindTexture(null, 0);
            }
        } finally {
            backend.setDepthWrite(false);
            if (blendEnabled) gl.enable(gl.BLEND);
            else gl.disable(gl.BLEND);
        }
    }

    public flush(): void {
        // Draws are immediate so no submission can outlive the coordinator's active pass.
    }

    private scalar(value: UniformValue): Float32Array | Int32Array {
        if (value instanceof Float32Array || value instanceof Int32Array) {
            return value;
        }
        return new Float32Array(typeof value === 'number' ? [value] : (value as readonly number[]));
    }

    private create(mesh: BlinkFullscreenMesh, material: MeshMaterial): FullscreenResources {
        const backend = this.getBackend();
        const gl = backend.context;
        const shader = new WebGl2Shader(mesh.vertexSource, mesh.fragmentSource);
        const buffers: WebGLBuffer[] = [];
        let handle: WebGLVertexArrayObject | null = null;
        try {
            shader.connect(createWebGl2ShaderProgram(gl));
            // The program defers reflection until binding; constructing the VAO earlier leaves it empty.
            backend.bindShader(shader);
            handle = requireResource(gl.createVertexArray(), 'vertex array');
            backend.bindVertexArrayObject(null);
            gl.bindVertexArray(handle);
            const data = new ArrayBuffer(mesh.vertexCount * 20);
            const floats = new Float32Array(data);
            const words = new Uint32Array(data);
            for (let i = 0; i < mesh.vertexCount; i++) {
                floats[i * 5] = mesh.vertices[i * 2];
                floats[i * 5 + 1] = mesh.vertices[i * 2 + 1];
                floats[i * 5 + 2] = mesh.uvs?.[i * 2] ?? 0;
                floats[i * 5 + 3] = mesh.uvs?.[i * 2 + 1] ?? 0;
                words[i * 5 + 4] = mesh.colors?.[i] ?? 0xffffffff;
            }
            this.buffer(gl.ARRAY_BUFFER, floats, buffers);
            for (const [name, size, type, normalized, offset] of [
                ['a_position', 2, gl.FLOAT, false, 0],
                ['a_texcoord', 2, gl.FLOAT, false, 8],
                ['a_color', 4, gl.UNSIGNED_BYTE, true, 16],
            ] as const) {
                const attribute = shader.attributes.get(name);
                if (attribute !== undefined && attribute.location >= 0) {
                    gl.enableVertexAttribArray(attribute.location);
                    gl.vertexAttribPointer(attribute.location, size, type, normalized, 20, offset);
                }
            }
            if (mesh.indices !== null) {
                this.buffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, buffers);
            }
            gl.bindVertexArray(null);
            const vao = new WebGl2VertexArrayObject().connect({
                bind: () => gl.bindVertexArray(handle),
                unbind: () => gl.bindVertexArray(null),
                draw: (_vao, size, start, type) => {
                    if (mesh.indices === null) {
                        gl.drawArrays(type, start, size);
                    } else {
                        gl.drawElements(
                            type,
                            size,
                            mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
                            start * mesh.indices.BYTES_PER_ELEMENT
                        );
                    }
                },
                destroy: () => gl.deleteVertexArray(handle),
            });
            const resource = { shader, vao, buffers };
            this.resources.set(mesh, resource);
            if (!this.observedMaterials.has(material)) {
                this.observedMaterials.add(material);
                material.onDispose(() => {
                    for (const current of this.resources.keys()) {
                        if (current.material === material) {
                            this.release(current);
                        }
                    }
                });
            }
            return resource;
        } catch (error) {
            backend.bindShader(null);
            backend.bindVertexArrayObject(null);
            gl.bindVertexArray(null);
            gl.deleteVertexArray(handle);
            for (const buffer of buffers) {
                gl.deleteBuffer(buffer);
            }
            shader.destroy();
            throw error;
        }
    }

    private buffer(target: number, data: Float32Array | Uint16Array | Uint32Array, buffers: WebGLBuffer[]): void {
        const gl = this.getBackend().context;
        const buffer = requireResource(gl.createBuffer(), 'vertex buffer');
        buffers.push(buffer);
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, data, gl.STATIC_DRAW);
    }

    private release(mesh: BlinkFullscreenMesh): void {
        const resource = this.resources.get(mesh);
        if (resource === undefined) {
            return;
        }
        const backend = this.getBackend();
        backend.bindShader(null);
        backend.bindVertexArrayObject(null);
        resource.vao.destroy();
        resource.shader.destroy();
        for (const buffer of resource.buffers) {
            backend.context.deleteBuffer(buffer);
        }
        this.resources.delete(mesh);
    }
}

const registered = new WeakSet<WebGl2Backend>();

/** Register once per backend before a BlinkFullscreenMesh is rendered. */
export function registerBlinkFullscreenRenderer(backend: WebGl2Backend): void {
    if (!registered.has(backend)) {
        backend.rendererRegistry.registerRenderer(BlinkFullscreenMesh, new BlinkFullscreenRenderer());
        registered.add(backend);
    }
}
