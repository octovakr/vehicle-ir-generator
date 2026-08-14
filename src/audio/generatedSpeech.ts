import { createSeededRandom } from './random';

/**
 * Deterministic "robotic speech" test-signal generator.
 *
 * Purpose: give every source a usable default signal so the simulator can be
 * exercised without loading real recordings. This generator is a TESTING
 * utility — it is not part of the acoustic simulation and makes no claim of
 * modeling human speech production.
 *
 * Signal model: a sequence of vowel-like "syllables". Each syllable is a
 * glottal-like pulse train (sum of harmonics of a random fundamental
 * f0 ∈ [95, 220] Hz) shaped by two random formant resonances, with an
 * attack/decay amplitude envelope, separated by short silences. All random
 * choices come from a seeded PRNG, so (seed, duration, sampleRate) fully
 * determines the output.
 */
export function generateRoboticSpeech(
  seed: number,
  durationSeconds: number,
  sampleRateHz: number,
): Float32Array {
  const random = createSeededRandom(seed);
  const totalSamples = Math.round(durationSeconds * sampleRateHz);
  const output = new Float32Array(totalSamples);

  let cursor = 0;
  while (cursor < totalSamples) {
    const syllableSeconds = 0.12 + random() * 0.22;
    const gapSeconds = 0.04 + random() * 0.12;
    const syllableSamples = Math.min(
      Math.round(syllableSeconds * sampleRateHz),
      totalSamples - cursor,
    );

    const f0 = 95 + random() * 125; // fundamental, Hz
    const formant1 = 350 + random() * 500; // Hz
    const formant2 = 1200 + random() * 1300; // Hz
    const harmonicCount = Math.min(30, Math.floor(sampleRateHz / 2 / f0));

    // Precompute harmonic weights: each harmonic is weighted by proximity to
    // the two formants (Gaussian in log-frequency) plus a gentle -6 dB/oct tilt.
    const weights: number[] = [];
    for (let harmonicIndex = 1; harmonicIndex <= harmonicCount; harmonicIndex++) {
      const frequency = harmonicIndex * f0;
      const formantGain =
        Math.exp(-0.5 * Math.pow((frequency - formant1) / 180, 2)) +
        0.7 * Math.exp(-0.5 * Math.pow((frequency - formant2) / 320, 2));
      weights.push((formantGain + 0.05) / harmonicIndex);
    }

    const attackSamples = Math.round(0.015 * sampleRateHz);
    const releaseSamples = Math.round(0.05 * sampleRateHz);

    for (let i = 0; i < syllableSamples; i++) {
      const time = i / sampleRateHz;
      let sample = 0;
      for (let harmonicIndex = 1; harmonicIndex <= harmonicCount; harmonicIndex++) {
        sample += weights[harmonicIndex - 1] * Math.sin(2 * Math.PI * harmonicIndex * f0 * time);
      }
      let envelope = 1;
      if (i < attackSamples) envelope = i / attackSamples;
      const remaining = syllableSamples - i;
      if (remaining < releaseSamples) envelope = Math.min(envelope, remaining / releaseSamples);
      output[cursor + i] = sample * envelope;
    }

    cursor += syllableSamples + Math.round(gapSeconds * sampleRateHz);
  }

  // Peak-normalize to a comfortable level.
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) peak = Math.max(peak, Math.abs(output[i]));
  if (peak > 0) {
    const scale = 0.7 / peak;
    for (let i = 0; i < totalSamples; i++) output[i] *= scale;
  }
  return output;
}
