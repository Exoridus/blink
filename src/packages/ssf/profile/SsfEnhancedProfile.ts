import { ExoEnhancedProvider } from '../original/enhanced';
import { createSsfPcmProfile } from './SsfOriginalProfile';

export const SSF_ENHANCED_PROFILE_ID = 'ssf-enhanced/1';

/** Version of the ExoJS audio package whose tempo estimate is published as evidence. */
const EXO_AUDIO_VERSION = '0.19.1';

/**
 * The SSF reconstruction with the generic ExoJS tempo estimate substituted for its BPM family.
 * Without a valid estimate the original values stay in place.
 */
export const ssfEnhancedProfile = createSsfPcmProfile(SSF_ENHANCED_PROFILE_ID, {
    createProvider: () => new ExoEnhancedProvider(EXO_AUDIO_VERSION),
    needsGenericAnalysis: true,
    beforeSnapshot: (provider, frame, lastSample) =>
        provider.publishTempo({
            bpm: frame.audio.bpm,
            confidence: frame.audio.bpmConfidence,
            sampleIndex: lastSample,
            sourceEpoch: 0,
        }),
});
