import type { BlinkScriptContext, BlinkControlValue } from '../../schemas/blinkfx.types';

export function setup(ctx: BlinkScriptContext): void {
  ctx.state.seed = 0;
}

export function onPaletteChange(
  ctx: BlinkScriptContext,
  value: BlinkControlValue,
  previousValue: BlinkControlValue,
): void {
  ctx.log('palette changed', value, previousValue);
}
