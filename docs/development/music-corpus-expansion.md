# Demo music and audio corpus expansion

Blink now includes five additional CC0 recordings alongside the two existing Chiptune Adventures tracks. The shared manifest drives grouped selection and public-build packaging. See [demo music](demo-music.md) for the catalog and verification boundaries. The application audio engine is unchanged.

The sibling ExoJS audio-fx corpus adds eight 30-second, 48 kHz mono PCM16 excerpts: Mandatory Overtime, Near and Far, Friendly Talk, JRPG2 Piano, Super Action Stage 7, Relaxed Menu Title, Space Upbeat and Storytime. Total added WAV payload is 23,040,352 bytes. The five existing fixtures and their accepted references are preserved. Production detector, harness and scoring contracts are unchanged.

Sources and excerpt conversion settings are recorded in ExoJS's `packages/exojs-audio-fx/test/fixtures/music/manifest.json`. Masters, license-page evidence and candidate click overlays are kept in a private corpus; tests require only the tracked WAV fixtures. Independent candidates were generated with librosa rather than detector output. All eight additions remain `unreviewed`, with `quality: null`, pending auditory confirmation of pulse, phase and meter. No new accuracy claims or thresholds are introduced.

The author's 94 BPM hint for Mandatory Overtime contrasts with the detector's estimated median 187.42 BPM. This motivates checking half/double-tempo interpretations, rather than treating the hint or candidate timestamps as accepted ground truth. Near and Far and the piano/chiptune excerpts also require independent metrical review.

The 12 Music Loops preview order differs from ZIP ordering. Blink uses preview index 1, archive member 215; ExoJS uses index 2, member 216, for the proposed intensity/tempo-change case. No actual tempo change is asserted. The 21.333-second preview index 9 is omitted from the 30-second fixture set instead of being padded or looped; Storytime is included instead. Menu Music remains withheld pending clarification of its Apple/GarageBand loop provenance.

## Verification

- Blink: 32 targeted catalog and StartScreen tests, strict TypeScript check, targeted ESLint and formatting checks.
- Built local and Pages artifacts: seven real-music WebGL2 browser scenarios each, including decode/playback, transport, effect switching and audio-uniform activity. Static build checks cover `/` and `/blink/`.
- ExoJS: the two named recorded-music test files exercise all 13 fixtures. Package source, test and worklet typechecks were also run. No full monorepo suite or algorithm tuning is part of this change.
- Existing build warnings about a large bundle and an unnamed IIFE remain. Browser evidence uses software WebGL2, without a hardware/browser compatibility claim.

The remaining corpus task is human review of the candidate click overlays before promoting annotations to accepted references. Neither repository has been pushed or deployed.
