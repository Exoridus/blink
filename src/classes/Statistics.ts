import { Color, Text } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';

import type { RenderService } from '../services/RenderService';

export class Statistics {
    private readonly renderService: RenderService;
    private readonly debugOverlay: DebugOverlay;

    private readonly analyserText: Text;

    public constructor(renderService: RenderService) {
        this.renderService = renderService;

        this.analyserText = new Text(this.getStatusText(), {
            fillColor: new Color(231, 243, 255),
            outlineColor: new Color(0, 0, 0, 0.88),
            outlineWidth: 0.12,
            fontSize: 15,
            fontFamily: '"JetBrains Mono", "Cascadia Code", "Consolas", monospace',
            fontWeight: '600',
            lineHeight: 1.35,
        });
        this.analyserText.anchor.y = 1;
        this.analyserText.x = 8;
        this.analyserText.y = this.renderService.screenHeight - 8;

        this.renderService.addChild(this.analyserText);

        this.debugOverlay = new DebugOverlay(this.renderService.application);
        this.debugOverlay.layers.performance.visible = true;

        this.renderService.onUpdate.add(this.handleUpdate);
    }

    private readonly handleUpdate = (): void => {
        this.update();
    };

    /**
     * Detaches everything this instance attached: the per-frame subscription on the render
     * service, the debug overlay's own application-event subscriptions and keybindings, and the
     * text node in the render service's overlay. Must run before the render service is
     * destroyed - the debug overlay holds the ExoJS application it was built against.
     */
    public destroy(): void {
        this.renderService.onUpdate.remove(this.handleUpdate);
        this.debugOverlay.destroy();
        this.analyserText.destroy();
    }

    public update(): void {
        this.analyserText.y = this.renderService.screenHeight - 8;
        this.analyserText.text = this.getStatusText();
    }

    private getStatusText(): string {
        const { TIME, TIMEDELTA, FRAMECOUNT, PASSINDEX, BPM, MOUSE, SURFACEPOSITION, RESOLUTION, DATE } =
            this.renderService.uniformValues;

        return [
            `Time: ${TIME.toFixed(2)} | TimeDelta: ${TIMEDELTA.toFixed(4)}`,
            `FrameIndex: ${FRAMECOUNT} | PassIndex: ${PASSINDEX}`,
            `BPM: ${BPM}`,
            `MousePos: ${MOUSE.slice(0, 2).join(',')} | ClickPos: ${MOUSE.slice(2).join(',')}`,
            `SurfacePosition: ${SURFACEPOSITION.join(',')}`,
            `Resolution: ${RESOLUTION.join('x')}`,
            `Date: ${DATE.join('-')}`,
        ].join('\n');
    }
}
