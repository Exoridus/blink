import { f } from './math';

/** Native pixel mapping; dimensions below six can intentionally yield an out-of-target index. */
export function ssfReadbackCoordinate(coordinate: number, dimension: number): number {
    const size = dimension | 0;
    const product = f(f(size) * f(coordinate));
    const rounded =
        Math.abs(product) >= 8388608 ? product : f(Math.sign(product) * Math.floor(Math.abs(product) + 0.5));
    const integer = Number.isFinite(rounded) && rounded >= -2147483648 && rounded < 2147483648 ? rounded : -2147483648;
    return Math.max(3, Math.min(integer, (size - 3) | 0));
}

/** Converts RGB bytes with the original binary32 reciprocal multiply rather than division. */
export function ssfReadbackRgb(bytes: Uint8Array): readonly [number, number, number] {
    if (bytes.length < 3) throw new RangeError('SSF readback requires three RGB bytes');
    const inverse = f(1 / 255);
    return [f(bytes[0] * inverse), f(bytes[1] * inverse), f(bytes[2] * inverse)];
}
