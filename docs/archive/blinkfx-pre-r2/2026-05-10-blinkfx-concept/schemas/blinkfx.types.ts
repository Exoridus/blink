export interface BlinkFxManifest {
  readonly format: 'blinkfx/1';
  readonly id: string;
  readonly title: string;

  readonly author?: string;
  readonly description?: string;
  readonly license?: string;
  readonly thumbnail?: string;
  readonly tags?: readonly string[];

  readonly controls?: readonly BlinkFxControl[];
  readonly assets?: readonly BlinkFxAsset[];
  readonly passes?: readonly BlinkFxPass[];
  readonly shaders: BlinkFxShaderSet;
  readonly presets?: readonly BlinkFxPreset[];
  readonly script?: BlinkFxScript;
}

export type BlinkFxControl =
  | BlinkFxFloatControl
  | BlinkFxIntControl
  | BlinkFxBoolControl
  | BlinkFxColorControl
  | BlinkFxEnumControl
  | BlinkFxPoint2DControl
  | BlinkFxBangControl;

export interface BlinkFxControlBase {
  readonly name: string;
  readonly label?: string;
  readonly description?: string;
  readonly group?: string;
}

export interface BlinkFxFloatControl extends BlinkFxControlBase {
  readonly type: 'float';
  readonly default: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface BlinkFxIntControl extends BlinkFxControlBase {
  readonly type: 'int';
  readonly default: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface BlinkFxBoolControl extends BlinkFxControlBase {
  readonly type: 'bool';
  readonly default: boolean;
}

export interface BlinkFxColorControl extends BlinkFxControlBase {
  readonly type: 'color';
  readonly default: readonly [number, number, number, number];
}

export interface BlinkFxEnumControl extends BlinkFxControlBase {
  readonly type: 'enum';
  readonly default: string;
  readonly options: readonly string[];
}

export interface BlinkFxPoint2DControl extends BlinkFxControlBase {
  readonly type: 'point2d';
  readonly default: readonly [number, number];
  readonly min?: readonly [number, number];
  readonly max?: readonly [number, number];
}

export interface BlinkFxBangControl extends BlinkFxControlBase {
  readonly type: 'bang';
}

export interface BlinkFxAsset {
  readonly name: string;
  readonly type: 'texture2d';
  readonly path: string;
  readonly sampling?: BlinkFxSampling;
}

export interface BlinkFxSampling {
  readonly filter?: 'nearest' | 'linear' | 'mipmap';
  readonly wrap?: 'clamp' | 'repeat' | 'mirror';
}

export interface BlinkFxPass {
  readonly name: string;
  readonly shader: string;
  readonly inputs?: readonly string[];
  readonly target: 'screen' | BlinkFxRenderTarget;
  readonly clear?: boolean;
}

export interface BlinkFxRenderTarget {
  readonly name: string;
  readonly width?: number;
  readonly height?: number;
  readonly scale?: number;
  readonly format?: 'rgba8' | 'rgba16f' | 'rgba32f';
  readonly persistent?: boolean;
  readonly sampling?: Omit<BlinkFxSampling, 'filter'> & {
    readonly filter?: 'nearest' | 'linear';
  };
}

export interface BlinkFxShaderSet {
  readonly glsl?: string | Readonly<Record<string, string>>;
  readonly wgsl?: string | Readonly<Record<string, string>>;
}

export interface BlinkFxPreset {
  readonly name: string;
  readonly path: string;
}

export interface BlinkFxScript {
  readonly entry: string;
  readonly events?: readonly BlinkFxScriptEventBinding[];
}

export interface BlinkFxScriptEventBinding {
  readonly input: string;
  readonly on: 'change' | 'offToOn' | 'onToOff' | 'whileOn' | 'whileOff';
  readonly handler: string;
}

export interface BlinkScriptModule {
  setup?(ctx: BlinkScriptContext): void | Promise<void>;
  update?(ctx: BlinkScriptContext, dt: number): void;
  dispose?(ctx: BlinkScriptContext): void;
}

export interface BlinkScriptContext {
  readonly time: {
    readonly elapsed: number;
    readonly delta: number;
    readonly frame: number;
  };
  readonly audio: BlinkAudioFrame;
  readonly controls: BlinkControlApi;
  readonly uniforms: BlinkUniformApi;
  readonly resources: BlinkResourceScope;
  readonly state: Record<string, unknown>;
  log(...args: readonly unknown[]): void;
}

export type BlinkControlValue = number | boolean | string | readonly [number, number] | readonly [number, number, number, number];
export type BlinkUniformValue = number | readonly [number, number] | readonly [number, number, number] | readonly [number, number, number, number];

export interface BlinkControlApi {
  get(name: string): BlinkControlValue;
  set(name: string, value: BlinkControlValue): void;
  setNormalized(name: string, value: BlinkControlValue): void;
  setDimension(name: string, dimension: number, value: number): void;
  randomize(name: string): void;
  reset(name: string): void;
}

export interface BlinkUniformApi {
  set(name: string, value: BlinkUniformValue): void;
}

export interface BlinkAudioFrame {
  readonly level: number;
  readonly bass: number;
  readonly mid: number;
  readonly midHigh: number;
  readonly high: number;
  readonly hit: number;
  readonly bassHit: number;
  readonly midHit: number;
  readonly midHighHit: number;
  readonly highHit: number;
  readonly presence: number;
  readonly bassPresence: number;
  readonly midPresence: number;
  readonly midHighPresence: number;
  readonly highPresence: number;
  readonly beatPulse: number;
  readonly barPulse: number;
  readonly beatPhase: number;
  readonly bpm: number;
  readonly bpmConfidence: number;
}

export interface BlinkResourceScope {
  loadTexture(path: string): Promise<BlinkTexture>;
  createDataTexture(options: BlinkDataTextureOptions): BlinkDataTexture;
  createRenderTarget(options: BlinkRenderTargetOptions): BlinkRenderTarget;
  track<T extends BlinkDisposable>(resource: T): T;
}

export interface BlinkDisposable {
  dispose(): void;
}

export interface BlinkTexture extends BlinkDisposable {}
export interface BlinkDataTexture extends BlinkDisposable {}
export interface BlinkRenderTarget extends BlinkDisposable {}
export interface BlinkDataTextureOptions {}
export interface BlinkRenderTargetOptions {}
