import { DEFAULT_OUTPUT, OUTPUT_PRESETS, type OutputSettings, validateOutput } from '../runtime/render/outputSettings';

/** Builds the same output controls for the shell and the comparison lab. */
export function outputSettingsControls(
    initial: OutputSettings,
    apply: (settings: OutputSettings) => void
): HTMLElement {
    const root = document.createElement('div');
    root.className = 'output-settings';
    root.innerHTML = `<label>Target <select data-output-preset>${OUTPUT_PRESETS.map(([w, h]) => `<option value="${w},${h}">${w} × ${h}</option>`).join('')}<option value="custom">Custom</option></select></label>
    <label>Width <input data-output-width type="number" min="1" max="8192"></label>
    <label>Height <input data-output-height type="number" min="1" max="8192"></label>
    <label><input data-output-lock type="checkbox" checked>Aspect lock</label>
    <label>Preview <select data-output-fit><option value="contain">Fit Within Window</option><option value="cover">Fill / Crop</option><option value="fill">Stretch</option></select></label>
    <label>FPS cap <input data-output-fps type="number" min="1" max="240"></label>
    <label>UI Scaling <select data-output-scale>${[50, 75, 100, 125, 150].map(value => `<option value="${value / 100}">${value}%</option>`).join('')}</select></label>
    <button data-output-apply>Apply output</button><output data-output-status>V-Sync: browser/display controlled</output>`;
    const get = <T extends HTMLElement>(selector: string): T => {
        const element = root.querySelector<T>(selector);
        if (element === null) throw new Error(`Output control missing: ${selector}`);
        return element;
    };
    const width = get<HTMLInputElement>('[data-output-width]');
    const height = get<HTMLInputElement>('[data-output-height]');
    const preset = get<HTMLSelectElement>('[data-output-preset]');
    let ratio = initial.width / initial.height;
    width.value = String(initial.width);
    height.value = String(initial.height);
    preset.value = OUTPUT_PRESETS.some(([w, h]) => w === initial.width && h === initial.height)
        ? `${initial.width},${initial.height}`
        : 'custom';
    get<HTMLSelectElement>('[data-output-fit]').value = initial.fitting;
    get<HTMLInputElement>('[data-output-fps]').value = String(initial.fpsCap);
    get<HTMLSelectElement>('[data-output-scale]').value = String(initial.uiScale);
    preset.addEventListener('change', () => {
        if (preset.value === 'custom') return;
        const [w, h] = preset.value.split(',').map(Number);
        width.value = String(w);
        height.value = String(h);
        ratio = w / h;
    });
    for (const field of [width, height])
        field.addEventListener('change', () => {
            preset.value = 'custom';
            if (get<HTMLInputElement>('[data-output-lock]').checked) {
                if (field === width) height.value = String(Math.round(Number(width.value) / ratio));
                else width.value = String(Math.round(Number(height.value) * ratio));
            } else ratio = Number(width.value) / Number(height.value);
        });
    get<HTMLButtonElement>('[data-output-apply]').addEventListener('click', () => {
        const status = get<HTMLOutputElement>('[data-output-status]');
        try {
            const next = validateOutput({
                ...DEFAULT_OUTPUT,
                width: Number(width.value),
                height: Number(height.value),
                fitting: get<HTMLSelectElement>('[data-output-fit]').value as OutputSettings['fitting'],
                fpsCap: Number(get<HTMLInputElement>('[data-output-fps]').value),
                uiScale: Number(get<HTMLSelectElement>('[data-output-scale]').value),
            });
            apply(next);
            status.textContent = `${next.width} × ${next.height} · cap ${next.fpsCap} FPS · V-Sync browser/display controlled`;
        } catch (error) {
            status.textContent = String(error);
        }
    });
    return root;
}
