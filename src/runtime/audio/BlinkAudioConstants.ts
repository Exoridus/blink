/**
 * Evidence-based audio texture constants reverse-engineered from Synesthesia 1.25.2.
 *
 * Confidence levels:
 *   confirmed  — directly observed in binary data or decompiled code path
 *   probable   — strong inference from fixed-point pattern or neighbourhood evidence
 */

// ---------------------------------------------------------------------------
// Clamp range — confirmed
//   Synesthesia audio texture channels are clamped to [0, 2] rather than [0, 1].
//   The extra headroom allows juiced-spectrum quadratic overshoot and prevents
//   hard clipping of attack-envelope peaks.
// ---------------------------------------------------------------------------
export const TEXTURE_CLAMP_MIN = 0;
export const TEXTURE_CLAMP_MAX = 2;

// ---------------------------------------------------------------------------
// Noise floors — confirmed
//   Tiny positive floors prevent log-domain explosions and division-by-zero
//   in downstream shader code that calls log() or pow() on spectrum samples.
// ---------------------------------------------------------------------------
export const RAW_FLOOR = 1e-5;
export const SMOOTH_FLOOR = 1e-12;

// ---------------------------------------------------------------------------
// Raw-spectrum quadratic boost — confirmed
//   Used by buildRawSpectrumFromFFT / buildLogSpectrum.
// ---------------------------------------------------------------------------
export const JUICED_QUAD_A = 6.25; // 25/4
export const JUICED_QUAD_SCALE = 5 / 11; // ≈ 0.454545…
export const JUICED_LINEAR_B = 27 / 55; // ≈ 0.490909…

/** Convenience product: QUAD_A × QUAD_SCALE (≈ 2.8409). */
export const JUICED_QUAD_COEFF = JUICED_QUAD_A * JUICED_QUAD_SCALE;

// ---------------------------------------------------------------------------
// Exact Synesthesia Juiced constants — Stage A (Syn_SpectrumJuiced2D_Update)
// ---------------------------------------------------------------------------
export const JUICED_INPUT_FLOOR = 2 ** -16; // 1.52587890625e-5
export const JUICED_INPUT_SCALE = 0.6;
export const JUICED_PEAK_MIN = 0.0001;
export const JUICED_PEAK_DECAY = 0.9999899864196777;
export const JUICED_WEIGHT_THRESHOLD = 0.0001;
export const JUICED_FILL_FACTOR_LOW = 8.5e-5;
export const JUICED_FILL_FACTOR_HIGH = 1.275e-4;
export const JUICED_LOG_CUTOFF_BIN = 279;
export const JUICED_PEAK_TRACKER_INIT = 1.17549435e-38; // FLT_MIN

// ---------------------------------------------------------------------------
// Raw spectrum amplitude-processing constants — confirmed via forensics
//   Applied in buildRawSpectrumFromFFT and reused by buildLogSpectrum so
//   both channels share identical amplitude semantics.
// ---------------------------------------------------------------------------

/** SCALE_FACTOR: 0 dBFS → linear 1.0 → scaled 2.0, matching syn_Spectrum [0, 2] range. */
export const RAW_SCALE_FACTOR = 2;

/**
 * Threshold separating the "below-floor" quiet branch from the quadratic boost branch.
 * Confirmed from Synesthesia runtime: median output near-zero when scaled < 0.05.
 */
export const RAW_THRESHOLD = 0.05;

/** Upper clamp applied after the quadratic boost before OUTPUT_CLAMP. */
export const RAW_BOOST_CLAMP = 0.72;

/**
 * Final output clamp for raw and log spectrum channels.
 * Slightly above 1.0 to allow modest per-bin headroom while preventing extreme values.
 */
export const RAW_OUTPUT_CLAMP = 1.1;

// ---------------------------------------------------------------------------
// Exact Synesthesia Juiced constants — Stage B (Syn_SpectrumJuiced_Update)
// ---------------------------------------------------------------------------
export const JUICED_STAGE_B_LN2 = 0.6931471806;
export const JUICED_STAGE_B_NORMALIZE_SCALE = 0.0625;
export const JUICED_STAGE_B_ATTACK_BASE = 0.5;
export const JUICED_STAGE_B_ATTACK_DT_SCALE = 0.39;
export const JUICED_STAGE_B_RELEASE_BASE = 0.3;
export const JUICED_STAGE_B_RELEASE_DT_SCALE = 0.2;

export const JUICED_STAGE_B_TAP0 = 0.26596153;
export const JUICED_STAGE_B_TAP1 = 0.21296534;
export const JUICED_STAGE_B_TAP2 = 0.10934005;
export const JUICED_STAGE_B_TAP3 = 0.03599398;
export const JUICED_STAGE_B_TAP4 = 0.00759732;
export const JUICED_STAGE_B_TAP5 = 0.00102819;
export const JUICED_STAGE_B_TAP6 = 0.00008922;
export const JUICED_STAGE_B_TAP7 = 0.00000496;
