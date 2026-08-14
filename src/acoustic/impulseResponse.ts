import type {
  ImpulseResponse,
  MicrophoneConfig,
  SimulationConfig,
  SoundSourceConfig,
} from './types';
import { solveImageSources } from './imageSourceSolver';
import { SIMULATOR_VERSION } from './constants';

/**
 * Accumulates image-source contributions into a discrete-time impulse
 * response h[n].
 *
 * Each contribution is an ideal impulse a·δ(t − τ). Its arrival time in
 * samples is generally fractional:
 *
 *     n_exact = τ · f_s
 *
 * The impulse is deposited onto the two neighboring samples with linear
 * interpolation:
 *
 *     h[⌊n⌋]   += a · (1 − frac)
 *     h[⌊n⌋+1] += a · frac
 *
 * APPROXIMATION: linear interpolation slightly low-pass filters each impulse
 * compared to an ideal band-limited (windowed-sinc) fractional delay. It
 * avoids the audible dispersion of nearest-sample rounding and is standard
 * practice for broadband ISM renderers. A band-limited deposit is a possible
 * future refinement.
 */
export function generateImpulseResponse(
  config: SimulationConfig,
  source: SoundSourceConfig,
  microphone: MicrophoneConfig,
): ImpulseResponse {
  const { sampleRateHz, irDurationSeconds, maxReflectionOrder, randomSeed } = config.simulation;

  const solverOutput = solveImageSources({
    geometry: config.vehicle,
    sourcePosition: source.position,
    microphonePosition: microphone.position,
    materials: config.materials,
    environment: config.environment,
    maxReflectionOrder,
    maxDelaySeconds: irDurationSeconds,
  });

  const sampleCount = Math.round(irDurationSeconds * sampleRateHz);
  const samples = new Float32Array(sampleCount);

  for (const contribution of solverOutput.contributions) {
    const exactSampleIndex = contribution.propagationDelaySeconds * sampleRateHz;
    const lowerIndex = Math.floor(exactSampleIndex);
    if (lowerIndex >= sampleCount) continue;
    const fraction = exactSampleIndex - lowerIndex;
    samples[lowerIndex] += contribution.amplitude * (1 - fraction);
    if (lowerIndex + 1 < sampleCount) {
      samples[lowerIndex + 1] += contribution.amplitude * fraction;
    }
  }

  return {
    sourceId: source.id,
    microphoneId: microphone.id,
    sampleRateHz,
    samples,
    metadata: {
      simulatorVersion: SIMULATOR_VERSION,
      vehicle: { ...config.vehicle },
      sourcePosition: { ...source.position },
      microphonePosition: { ...microphone.position },
      surfaceAbsorption: {
        floor: config.materials.floor.absorptionCoefficient,
        ceiling: config.materials.ceiling.absorptionCoefficient,
        left: config.materials.left.absorptionCoefficient,
        right: config.materials.right.absorptionCoefficient,
        front: config.materials.front.absorptionCoefficient,
        rear: config.materials.rear.absorptionCoefficient,
      },
      environment: { ...config.environment },
      speedOfSoundMetersPerSecond: solverOutput.speedOfSoundMetersPerSecond,
      sampleRateHz,
      irDurationSeconds,
      maxReflectionOrder,
      randomSeed,
      imageSourceCount: solverOutput.contributions.length,
    },
  };
}
