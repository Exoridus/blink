/** CPU sampling oracle for the one-row RGBA32F adapter; GPU interpolation is qualified separately. */
export function sampleSsf1D(packed: Float32Array, coordinate: number): readonly [number, number, number, number] {
    const width = packed.length / 4;
    if (!Number.isInteger(width) || width < 1) throw new RangeError('Invalid SSF packed texture');
    const position = (coordinate - Math.floor(coordinate)) * width - 0.5;
    const index = Math.floor(position);
    const fraction = position - index;
    const left = ((index % width) + width) % width;
    const right = (left + 1) % width;
    const channel = (c: number): number => packed[left * 4 + c] * (1 - fraction) + packed[right * 4 + c] * fraction;
    return [channel(0), channel(1), channel(2), channel(3)];
}
