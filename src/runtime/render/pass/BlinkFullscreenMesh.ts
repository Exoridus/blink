import { Mesh, type MeshMaterial } from '@codexo/exojs';

export type BlinkFullscreenMeshOptions = ConstructorParameters<typeof Mesh>[0] & {
    readonly material: MeshMaterial;
    readonly vertexSource: string;
    readonly fragmentSource: string;
};

/** Carries complete GLSL sources for the fullscreen renderer's public shader API. */
export class BlinkFullscreenMesh extends Mesh {
    public readonly passMaterial: MeshMaterial;
    public readonly vertexSource: string;
    public readonly fragmentSource: string;

    public constructor(options: BlinkFullscreenMeshOptions) {
        super(options);
        this.passMaterial = options.material;
        this.vertexSource = options.vertexSource;
        this.fragmentSource = options.fragmentSource;
    }
}
