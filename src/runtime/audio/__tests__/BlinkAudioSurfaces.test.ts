import { describe, expect, it } from 'vitest';

import {
    createBlinkAudioSurfaces,
    createBlinkAudioTextureBuffers,
    HISTOGRAM_WIDTH,
    SPECTRUM_BINS,
} from '../BlinkAudioSurfaces';

describe('createBlinkAudioTextureBuffers', () => {
    it('creates all required buffer fields', () => {
        const bufs = createBlinkAudioTextureBuffers();
        expect(bufs.rawSpectrum).toBeInstanceOf(Float32Array);
        expect(bufs.juicedSpectrum).toBeInstanceOf(Float32Array);
        expect(bufs.smoothSpectrum).toBeInstanceOf(Float32Array);
        expect(bufs.waveform).toBeInstanceOf(Float32Array);
        expect(bufs.packedSpectrum).toBeInstanceOf(Float32Array);
        expect(bufs.packedHistogram).toBeInstanceOf(Float32Array);
        expect(bufs.logSpectrum).toBeInstanceOf(Float32Array);
    });

    it('spectrum buffers default to SPECTRUM_BINS length', () => {
        const bufs = createBlinkAudioTextureBuffers();
        expect(bufs.rawSpectrum.length).toBe(SPECTRUM_BINS);
        expect(bufs.juicedSpectrum.length).toBe(SPECTRUM_BINS);
        expect(bufs.smoothSpectrum.length).toBe(SPECTRUM_BINS);
        expect(bufs.waveform.length).toBe(SPECTRUM_BINS);
    });

    it('spectrum buffers use custom bin count', () => {
        const bufs = createBlinkAudioTextureBuffers(256);
        expect(bufs.rawSpectrum.length).toBe(256);
        expect(bufs.waveform.length).toBe(256);
    });

    it('packed spectrum has 4× bins length', () => {
        const bufs = createBlinkAudioTextureBuffers(512);
        expect(bufs.packedSpectrum.length).toBe(512 * 4);
    });

    it('packed histogram has HISTOGRAM_WIDTH × 4 length', () => {
        const bufs = createBlinkAudioTextureBuffers();
        expect(bufs.packedHistogram.length).toBe(HISTOGRAM_WIDTH * 4);
    });

    it('all spectrum arrays start filled with zeroes', () => {
        const bufs = createBlinkAudioTextureBuffers();
        for (let i = 0; i < bufs.rawSpectrum.length; i++) {
            expect(bufs.rawSpectrum[i]).toBe(0);
            expect(bufs.juicedSpectrum[i]).toBe(0);
            expect(bufs.smoothSpectrum[i]).toBe(0);
            expect(bufs.waveform[i]).toBe(0);
        }
    });
});

describe('createBlinkAudioSurfaces', () => {
    it('creates texture buffers and ring buffers', () => {
        const surfaces = createBlinkAudioSurfaces();
        expect(surfaces.textureBuffers).toBeDefined();
        expect(surfaces.levelHistory).toBeDefined();
        expect(surfaces.bassHistory).toBeDefined();
        expect(surfaces.midHistory).toBeDefined();
        expect(surfaces.highHistory).toBeDefined();
    });

    it('ring buffers have HISTOGRAM_WIDTH capacity', () => {
        const surfaces = createBlinkAudioSurfaces();
        expect(surfaces.levelHistory.capacity).toBe(HISTOGRAM_WIDTH);
        expect(surfaces.bassHistory.capacity).toBe(HISTOGRAM_WIDTH);
        expect(surfaces.midHistory.capacity).toBe(HISTOGRAM_WIDTH);
        expect(surfaces.highHistory.capacity).toBe(HISTOGRAM_WIDTH);
    });

    it('ring buffers start empty', () => {
        const surfaces = createBlinkAudioSurfaces();
        expect(surfaces.levelHistory.count).toBe(0);
        expect(surfaces.bassHistory.count).toBe(0);
        expect(surfaces.midHistory.count).toBe(0);
        expect(surfaces.highHistory.count).toBe(0);
    });

    it('supports custom spectrum bin count', () => {
        const surfaces = createBlinkAudioSurfaces(256);
        expect(surfaces.textureBuffers.rawSpectrum.length).toBe(256);
    });
});

describe('SPECTRUM_BINS constant', () => {
    it('is 1024', () => {
        expect(SPECTRUM_BINS).toBe(1024);
    });
});

describe('HISTOGRAM_WIDTH constant', () => {
    it('is 400', () => {
        expect(HISTOGRAM_WIDTH).toBe(400);
    });
});
