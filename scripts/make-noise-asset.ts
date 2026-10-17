// Deterministic 256x256 RGBA value-noise PNG for the full.blinkfx fixture.
// Run: node scripts/make-noise-asset.ts public/effects/full.blinkfx/assets/noise.png
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 256;
let state = 0x2545f491;
const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) & 0xff;
};

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0, o = 0; y < SIZE; y++) {
    raw[o++] = 0; // PNG filter type 0 (None) per scanline
    for (let x = 0; x < SIZE; x++) {
        const v = next();
        raw[o++] = v;
        raw[o++] = v;
        raw[o++] = v;
        raw[o++] = 255;
    }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, tail]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type RGBA
writeFileSync(
    process.argv[2],
    Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
    ])
);
