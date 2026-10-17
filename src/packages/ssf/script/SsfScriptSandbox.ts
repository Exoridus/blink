import type { BlinkControlSpec } from '../../../runtime/ir/types';
import type { BlinkScriptControlValue } from '../../../runtime/script/types';
import { type SsfFrameInput, ssfScriptRealmSource, type SsfUniformValue } from './SsfScriptRuntime';

export interface SandboxResult {
    readonly ok: boolean;
    readonly error: string | null;
    readonly uniforms: Record<string, SsfUniformValue>;
    readonly controls: Record<string, BlinkScriptControlValue>;
    readonly logs: readonly string[];
}

interface Request {
    resolve: (result: SandboxResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

/** A disposable worker owned by an opaque CSP realm. A stalled script cannot stall the page. */
export class SsfScriptSandbox {
    private readonly iframe = document.createElement('iframe');
    private readonly channel = new MessageChannel();
    private readonly pending = new Map<number, Request>();
    private sequence = 0;
    private stopped = false;
    private readonly ready: Promise<void>;

    public constructor(private readonly timeoutMs = 2000) {
        this.iframe.hidden = true;
        this.iframe.setAttribute('sandbox', 'allow-scripts');
        // Workers inherit CSP from the creator; opaque origin also removes access to application storage.
        this.iframe.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'"><script>
      addEventListener('message', function start(event) {
        if (!event.ports[0]) return;
        removeEventListener('message', start);
        const port = event.ports[0];
        const url = URL.createObjectURL(new Blob([event.data], {type:'text/javascript'}));
        const worker = new Worker(url); URL.revokeObjectURL(url);
        worker.onmessage = e => port.postMessage(e.data);
        worker.onerror = e => port.postMessage({fatal: e.message});
        port.onmessage = e => { if (e.data.stop) worker.terminate(); else worker.postMessage(e.data); };
        port.start(); port.postMessage({ready:true});
      });
    </script>`;
        this.ready = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.dispose();
                reject(new Error('SSF sandbox startup timed out'));
            }, timeoutMs);
            this.channel.port1.onmessage = event => {
                const data = event.data as { ready?: boolean; fatal?: string; id: number; result: SandboxResult };
                if (data.ready === true) {
                    clearTimeout(timer);
                    resolve();
                    return;
                }
                if (data.fatal !== undefined) {
                    clearTimeout(timer);
                    reject(new Error(data.fatal));
                    this.fail(data.fatal);
                    return;
                }
                const request = this.pending.get(data.id);
                if (request === undefined) return;
                clearTimeout(request.timer);
                this.pending.delete(data.id);
                request.resolve(data.result);
            };
            this.iframe.onload = () =>
                this.iframe.contentWindow?.postMessage(this.workerSource(), '*', [this.channel.port2]);
            document.body.append(this.iframe);
        });
    }

    public async init(
        source: string,
        controls: readonly BlinkControlSpec[],
        values: ReadonlyMap<string, SsfUniformValue>,
        rawControls: Readonly<Record<string, BlinkScriptControlValue>>,
        declaredUniforms: Readonly<Record<string, string>>
    ): Promise<SandboxResult> {
        return this.send({ kind: 'init', source, controls, values: [...values], rawControls, declaredUniforms });
    }

    public async step(
        frame: SsfFrameInput,
        rawControls: Readonly<Record<string, BlinkScriptControlValue>>
    ): Promise<SandboxResult> {
        return this.send({ kind: 'step', dt: frame.dt, values: [...frame.values], rawControls });
    }

    public dispose(): void {
        if (this.stopped) return;
        this.stopped = true;
        this.channel.port1.postMessage({ stop: true });
        this.channel.port1.close();
        this.iframe.remove();
        this.fail('SSF sandbox disposed');
    }

    private fail(message: string): void {
        for (const request of this.pending.values()) {
            clearTimeout(request.timer);
            request.reject(new Error(message));
        }
        this.pending.clear();
    }

    private async send(payload: object): Promise<SandboxResult> {
        await this.ready;
        if (this.stopped) throw new Error('SSF sandbox disposed');
        const id = this.sequence++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.fail('SSF script timeout; worker terminated');
                this.dispose();
            }, this.timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            this.channel.port1.postMessage({ ...payload, id });
        });
    }

    private workerSource(): string {
        return `${ssfScriptRealmSource()}
      let runtime; let controls = {}; const logs = [];
      onmessage = event => {
        const data = event.data; logs.length = 0;
        try {
          controls = data.rawControls;
          let status = {ok:true,error:null};
          if (data.kind === 'init') {
            runtime = new SsfScriptRuntime({source:data.source,nativeLifecycle:true,controls:data.controls,declaredUniforms:data.declaredUniforms,
              surface:{get:name=>controls[name],set:(name,value)=>{controls[name]=value;}},log:message=>logs.push(message)});
            runtime.init(new Map(data.values));
          } else status = runtime.step({dt:data.dt,values:new Map(data.values)});
          postMessage({id:data.id,result:{...status,error:status.error ? String(status.error) : null,uniforms:runtime.uniforms(),controls,logs}});
        } catch(error) { postMessage({id:data.id,result:{ok:false,error:String(error),uniforms:{},controls,logs}}); }
      };`;
    }
}
