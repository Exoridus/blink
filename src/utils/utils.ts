const cryptoBuffer = new Uint8Array(36);

export const uuid = (): string => {
    crypto.getRandomValues(cryptoBuffer);

    return '10000000-1000-4000-8000-100000000000'.replaceAll(/[018]/g, (c, i) => {
        const n = Number(c);

        return (n ^ (cryptoBuffer[i] & (15 >> (n / 4)))).toString(16);
    });
};

export const lerp = (a: number, b: number, f: number): number => a + f * (b - a);
