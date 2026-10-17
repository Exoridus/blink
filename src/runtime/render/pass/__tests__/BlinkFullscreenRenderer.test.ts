import { DataTexture, MeshMaterial, RenderTexture, Texture, TextureFormat } from '@codexo/exojs';
import {
    RenderBackendType,
    type WebGl2Backend,
    type WebGl2Shader,
    type WebGl2ShaderProgram,
    type WebGl2VertexArrayObject,
} from '@codexo/exojs/renderer-sdk';
import { describe, expect, it, vi } from 'vitest';

import { BlinkFullscreenMesh } from '../BlinkFullscreenMesh';
import { BlinkFullscreenRenderer, registerBlinkFullscreenRenderer } from '../BlinkFullscreenRenderer';

const programs = vi.hoisted(() => ({ created: [] as { source: string; vertex: string; destroyed: boolean }[] }));
vi.mock('@codexo/exojs/renderer-sdk', async importOriginal => {
    const sdk = await importOriginal<typeof import('@codexo/exojs/renderer-sdk')>();
    return {
        ...sdk,
        createWebGl2ShaderProgram: (): WebGl2ShaderProgram => {
            let pending: InstanceType<typeof sdk.WebGl2Shader> | null = null;
            let record: (typeof programs.created)[number];
            const reflect = (): void => {
                const shader = pending;
                if (shader === null) {
                    return;
                }
                pending = null;
                for (const match of shader.fragmentSource.matchAll(/uniform (sampler2D|float) (\w+);/g)) {
                    shader.uniforms.set(
                        match[2],
                        new sdk.WebGl2ShaderUniform(
                            shader.uniforms.size,
                            match[1] === 'float' ? 5126 : 35678,
                            1,
                            match[2],
                            new Float32Array(1)
                        )
                    );
                }
                const attribute = new sdk.WebGl2ShaderAttribute(0, 'a_position', 35664);
                attribute.location = 0;
                shader.attributes.set('a_position', attribute);
            };
            return {
                initialize: (shader: InstanceType<typeof sdk.WebGl2Shader>): void => {
                    record = { source: shader.fragmentSource, vertex: shader.vertexSource, destroyed: false };
                    programs.created.push(record);
                    pending = shader;
                },
                bind: reflect,
                unbind: vi.fn(),
                sync: reflect,
                destroy: (): void => {
                    record.destroyed = true;
                },
            };
        },
    };
});

const vertexSource =
    '#version 300 es\nlayout(location=0) in vec2 a_position;void main(){gl_Position=vec4(a_position,0,1);}';
function fixture(count = 11, limit = 16): ReturnType<typeof createFixture> {
    return createFixture(count, limit);
}

function createFixture(count: number, limit: number) {
    const textures = Array.from(
        { length: count },
        () => new DataTexture({ width: 1, height: 1, format: TextureFormat.Rgba32F })
    );
    const fragmentSource = `${textures.map((_, i) => `uniform sampler2D t${i};`).join('\n')}\nuniform float amount;`;
    const material = MeshMaterial.from(vertexSource, fragmentSource, {
        uniforms: { amount: 0.25, ...Object.fromEntries(textures.map((texture, i) => [`t${i}`, texture])) },
    });
    const mesh = new BlinkFullscreenMesh({
        vertices: new Float32Array([-1, -1, 1, -1, 1, 1]),
        material,
        vertexSource,
        fragmentSource,
    });
    let blendEnabled = true;
    const blendAtDraw: boolean[] = [];
    const operations: string[] = [];
    let maxMipLevel = 0;
    const gl = {
        BLEND: 3042,
        TEXTURE_2D: 3553,
        TEXTURE_MAX_LEVEL: 33085,
        isEnabled: vi.fn((capability: number) => capability === 3042 && blendEnabled),
        disable: vi.fn((capability: number) => {
            if (capability === 3042) blendEnabled = false;
        }),
        enable: vi.fn((capability: number) => {
            if (capability === 3042) blendEnabled = true;
        }),
        generateMipmap: vi.fn(() => {
            operations.push('mipmap');
        }),
        texParameteri: vi.fn((_target: number, parameter: number, value: number) => {
            if (parameter === 33085) maxMipLevel = value;
        }),
        getTexParameter: vi.fn((target: number, parameter: number) =>
            target === 3553 && parameter === 33085 ? maxMipLevel : 0
        ),
        MAX_TEXTURE_IMAGE_UNITS: 34930,
        MAX_COMBINED_TEXTURE_IMAGE_UNITS: 35661,
        ARRAY_BUFFER: 34962,
        ELEMENT_ARRAY_BUFFER: 34963,
        STATIC_DRAW: 35044,
        FLOAT: 5126,
        UNSIGNED_BYTE: 5121,
        UNSIGNED_SHORT: 5123,
        UNSIGNED_INT: 5125,
        TRIANGLES: 4,
        getParameter: vi.fn(() => limit),
        createBuffer: vi.fn(() => ({})),
        createVertexArray: vi.fn(() => ({})),
        bindBuffer: vi.fn(),
        bufferData: vi.fn(),
        bindVertexArray: vi.fn(),
        enableVertexAttribArray: vi.fn(),
        vertexAttribPointer: vi.fn(),
        deleteBuffer: vi.fn(),
        deleteVertexArray: vi.fn(),
        drawArrays: vi.fn(() => {
            blendAtDraw.push(blendEnabled);
            operations.push('draw');
        }),
        drawElements: vi.fn(),
    };
    const backend = {
        backendType: RenderBackendType.WebGl2,
        context: gl,
        stats: { batches: 0, drawCalls: 0 },
        bindTexture: vi.fn(),
        bindShader: vi.fn((shader: WebGl2Shader | null): void => {
            shader?.bind();
        }),
        bindVertexArrayObject: vi.fn((vao: WebGl2VertexArrayObject | null): void => {
            vao?.bind();
        }),
        setBlendMode: vi.fn(),
        setAttachmentBlendModes: vi.fn(),
        setDepthWrite: vi.fn(),
        stageViewportUniform: vi.fn(),
    };
    const renderer = new BlinkFullscreenRenderer();
    renderer.connect(backend as unknown as WebGl2Backend);
    return { renderer, backend, gl, material, mesh, textures, fragmentSource, blendAtDraw, operations };
}

describe('Blink fullscreen sampler renderer', () => {
    it('binds eleven distinct textures and changed scalar values without the mesh slot limit', () => {
        const { renderer, backend, gl, material, mesh, textures, fragmentSource } = fixture();
        const before = programs.created.length;
        renderer.render(mesh);
        expect(backend.bindTexture.mock.calls).toEqual(textures.map((texture, i) => [texture, i]));
        expect(gl.drawArrays).toHaveBeenCalledWith(4, 0, 3);
        expect(gl.enableVertexAttribArray).toHaveBeenCalledWith(0);
        expect(programs.created.at(-1)?.source).toBe(fragmentSource);
        expect(programs.created.at(-1)?.vertex).toBe(vertexSource);
        material.setUniform('amount', 0.75);
        renderer.render(mesh);
        expect(programs.created.length).toBe(before + 1);
        expect(backend.bindShader.mock.calls.at(-1)?.[0]?.getUniform('amount').value[0]).toBe(0.75);
        expect(backend.stats.drawCalls).toBe(2);
        renderer.disconnect();
    });

    it('rejects a hardware binding overflow before issuing a draw or binding textures', () => {
        const { renderer, backend, gl, mesh } = fixture(11, 8);
        expect(() => renderer.render(mesh)).toThrow(/11.*8/);
        expect(backend.bindTexture).not.toHaveBeenCalled();
        expect(gl.drawArrays).not.toHaveBeenCalled();
        renderer.disconnect();
    });

    it('releases programs and geometry on material disposal and rebuilds after reconnect', () => {
        const { renderer, backend, gl, mesh, material } = fixture();
        renderer.render(mesh);
        material.destroy();
        expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
        expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
        renderer.render(mesh);
        renderer.disconnect();
        expect(gl.deleteVertexArray).toHaveBeenCalledTimes(2);
        renderer.connect(backend as unknown as WebGl2Backend);
        renderer.render(mesh);
        expect(gl.drawArrays).toHaveBeenCalledTimes(3);
        renderer.disconnect();
    });

    it('preserves 32-bit index geometry and releases both buffers', () => {
        const { renderer, gl, material, mesh } = fixture();
        const indexed = new BlinkFullscreenMesh({
            vertices: mesh.vertices,
            indices: new Uint32Array([2, 1, 0]),
            material,
            vertexSource,
            fragmentSource: mesh.fragmentSource,
        });
        renderer.render(indexed);
        expect(gl.drawElements).toHaveBeenCalledWith(4, 3, 5125, 0);
        expect(gl.drawArrays).not.toHaveBeenCalled();
        renderer.disconnect();
        expect(gl.deleteBuffer).toHaveBeenCalledTimes(2);
    });

    it('ignores inactive sampler declarations when checking the hardware limit', () => {
        const { renderer, backend, mesh, material, textures } = fixture(11, 8);
        const reduced = new BlinkFullscreenMesh({
            vertices: mesh.vertices,
            material,
            vertexSource,
            fragmentSource: 'uniform sampler2D t10;',
        });
        renderer.render(reduced);
        expect(backend.bindTexture.mock.calls).toEqual([[textures[10], 0]]);
        renderer.disconnect();
    });

    it('registers one renderer per backend without replacing the generic mesh renderer', () => {
        const registerRenderer = vi.fn();
        const backend = { rendererRegistry: { registerRenderer } } as unknown as WebGl2Backend;
        registerBlinkFullscreenRenderer(backend);
        registerBlinkFullscreenRenderer(backend);
        expect(registerRenderer).toHaveBeenCalledTimes(1);
        expect(registerRenderer.mock.calls[0][0]).toBe(BlinkFullscreenMesh);
    });

    it('destroys a program when first binding fails and retries with a fresh program', () => {
        const { renderer, backend, mesh, gl } = fixture();
        backend.bindShader.mockImplementationOnce(() => {
            throw new Error('Shader linking failed');
        });
        expect(() => renderer.render(mesh)).toThrow('Shader linking failed');
        expect(programs.created.at(-1)?.destroyed).toBe(true);
        expect(gl.drawArrays).not.toHaveBeenCalled();
        renderer.render(mesh);
        expect(gl.drawArrays).toHaveBeenCalledTimes(1);
        renderer.disconnect();
    });
});

describe('fullscreen attachment writes', () => {
    it('writes shader alpha without source-over and restores ambient blending', () => {
        const { renderer, mesh, gl, blendAtDraw } = fixture(1);
        renderer.render(mesh);
        expect(blendAtDraw).toEqual([false]);
        expect(gl.isEnabled(gl.BLEND)).toBe(true);
        renderer.disconnect();
    });

    it('preserves an initially disabled blend state', () => {
        const { renderer, mesh, gl, blendAtDraw } = fixture(1);
        gl.disable(gl.BLEND);
        renderer.render(mesh);
        expect(blendAtDraw).toEqual([false]);
        expect(gl.isEnabled(gl.BLEND)).toBe(false);
        renderer.disconnect();
    });

    it('restores blending when the draw fails', () => {
        const { renderer, mesh, gl } = fixture(1);
        gl.drawArrays.mockImplementationOnce(() => {
            throw new Error('draw failed');
        });
        expect(() => renderer.render(mesh)).toThrow('draw failed');
        expect(gl.isEnabled(gl.BLEND)).toBe(true);
        renderer.disconnect();
    });

    it('refreshes requested render-target mip levels after drawing', () => {
        const { renderer, mesh, backend, gl, operations } = fixture(1);
        const output = new RenderTexture(2, 2, { generateMipMap: true });
        Object.defineProperty(backend, 'renderTarget', { value: output });
        renderer.render(mesh);
        expect(operations).toEqual(['draw', 'mipmap']);
        expect(gl.generateMipmap).toHaveBeenCalledWith(gl.TEXTURE_2D);
        renderer.disconnect();
        output.destroy();
    });
});

describe('unblended float and data surfaces', () => {
    it('writes renderable targets without requesting fixed-function blend support', () => {
        const { renderer, mesh, backend, blendAtDraw } = fixture(1);
        backend.setBlendMode.mockImplementation(() => {
            throw new Error('float blending unsupported');
        });
        backend.setAttachmentBlendModes.mockImplementation(() => {
            throw new Error('float blending unsupported');
        });
        expect(() => renderer.render(mesh)).not.toThrow();
        expect(blendAtDraw).toEqual([false]);
        renderer.disconnect();
    });

    it('refreshes requested numeric input mips before drawing and after producer commits', () => {
        const { renderer, mesh, textures, operations } = fixture(1);
        const texture = textures[0];
        texture.generateMipMap = true;
        renderer.render(mesh);
        expect(operations).toEqual(['mipmap', 'draw']);
        renderer.render(mesh);
        expect(operations).toEqual(['mipmap', 'draw', 'draw']);
        texture.buffer[0] = 0.75;
        texture.commit();
        renderer.render(mesh);
        expect(operations).toEqual(['mipmap', 'draw', 'draw', 'mipmap', 'draw']);
        renderer.disconnect();
    });
});

describe('input mip level bounds', () => {
    it('expands the upload clamp before numeric mip generation', () => {
        const { renderer, mesh, material, gl } = fixture(1);
        const texture = new DataTexture({
            width: 4,
            height: 1,
            format: TextureFormat.Rgba8,
            textureOptions: { generateMipMap: true },
        });
        material.setUniform('t0', texture);
        renderer.render(mesh);
        expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 2);
        texture.commit();
        renderer.render(mesh);
        expect(gl.texParameteri).toHaveBeenCalledTimes(2);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
        renderer.render(mesh);
        expect(gl.generateMipmap).toHaveBeenCalledTimes(3);
        expect(gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL)).toBe(2);
        renderer.disconnect();
        texture.destroy();
    });

    it('retains authored pixel mip chains', () => {
        const { renderer, mesh, material, gl } = fixture(1);
        const texture = Texture.fromPixels(
            {
                colorSpace: 'none',
                alphaMode: 'straight',
                levels: [
                    { width: 2, height: 1, data: new Uint8Array(8) },
                    { width: 1, height: 1, data: new Uint8Array(4) },
                ],
            },
            { generateMipMap: true }
        );
        material.setUniform('t0', texture);
        renderer.render(mesh);
        expect(gl.generateMipmap).not.toHaveBeenCalled();
        expect(gl.texParameteri).not.toHaveBeenCalled();
        renderer.disconnect();
        texture.destroy();
    });
});
