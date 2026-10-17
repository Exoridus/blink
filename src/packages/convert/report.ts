import type { BlinkFxManifest } from '../blinkfx/manifest';

export type IssueSeverity = 'info' | 'warning' | 'error';

export interface ConversionIssue {
    readonly severity: IssueSeverity;
    /** Stable machine-readable identifier, for grouping across a corpus. */
    readonly code: string;
    readonly message: string;
}

/**
 * How faithfully a scene converted.
 *
 * - `complete`: nothing was approximated or dropped.
 * - `approximate`: it converts and should render, but a feature has only structural or semantic
 *   compatibility (audio DSP, a control modifier, a sampling mode).
 * - `failed`: no usable package came out of it.
 */
export type ConversionStatus = 'complete' | 'approximate' | 'failed';

export interface ConversionReport {
    readonly slug: string;
    readonly status: ConversionStatus;
    readonly issues: readonly ConversionIssue[];
    /** Source features the scene uses, for corpus statistics. */
    readonly features: readonly string[];
}

/** A converted package: the manifest and every file of the package, `manifest.json` included. */
export interface ConvertedPackage {
    readonly manifest: BlinkFxManifest;
    /** Package-relative path to file content. */
    readonly files: ReadonlyMap<string, string | Uint8Array>;
    readonly report: ConversionReport;
}
