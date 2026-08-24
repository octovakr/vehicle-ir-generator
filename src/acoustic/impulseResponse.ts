import type {
  ImpulseResponse,
  ImageSourceContribution,
  MicrophoneConfig,
  SimulationConfig,
  SoundSourceConfig,
} from './types';
import { solveImageSources } from './imageSourceSolver';
import { SIMULATOR_VERSION } from './constants';
import { acousticInteriorObjects } from './occupants';
import {
  addInPlace,
  baffleCutoffHz,
  firstOrderHighpassInPlace,
  resolveMicrophoneBaffle,
} from './microphoneMounting';

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
 *
 * Mounted microphones add a second buffer of local-baffle arrivals which is
 * first-order high-passed at f_c = c / (2π a) before being summed in
 * (finite circular baffle / ka roll-off — see microphoneMounting.ts).
 */
export function generateImpulseResponse(
  config: SimulationConfig,
  source: SoundSourceConfig,
  microphone: MicrophoneConfig,
): ImpulseResponse {
  const { sampleRateHz, irDurationSeconds, maxReflectionOrder, randomSeed } = config.simulation;
  const interiorObjects = acousticInteriorObjects(config);
  const microphoneBaffle = resolveMicrophoneBaffle(microphone, {
    vehicle: config.vehicle,
    materials: config.materials,
    interiorObjects,
  });

  const solverOutput = solveImageSources({
    geometry: config.vehicle,
    sourcePosition: source.position,
    microphonePosition: microphone.position,
    materials: config.materials,
    environment: config.environment,
    maxReflectionOrder,
    maxDelaySeconds: irDurationSeconds,
    interiorObjects,
    microphoneBaffle,
  });

  const sampleCount = Math.round(irDurationSeconds * sampleRateHz);
  const samples = new Float32Array(sampleCount);
  depositContributions(samples, solverOutput.contributions, sampleRateHz);

  if (microphoneBaffle && solverOutput.baffleContributions.length > 0) {
    const extra = new Float32Array(sampleCount);
    depositContributions(extra, solverOutput.baffleContributions, sampleRateHz);
    firstOrderHighpassInPlace(
      extra,
      sampleRateHz,
      baffleCutoffHz(microphoneBaffle.radiusMeters, solverOutput.speedOfSoundMetersPerSecond),
    );
    addInPlace(samples, extra);
  }

  const cutoffHz = microphoneBaffle
    ? baffleCutoffHz(microphoneBaffle.radiusMeters, solverOutput.speedOfSoundMetersPerSecond)
    : 0;

  return {
    sourceId: source.id,
    microphoneId: microphone.id,
    sampleRateHz,
    samples,
    metadata: {
      simulatorVersion: SIMULATOR_VERSION,
      vehicleModelId: config.vehicleModelId,
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
      interiorObjectAbsorption: Object.fromEntries(
        interiorObjects.map((object) => [object.id, object.material.absorptionCoefficient]),
      ),
      occupants: config.occupants.map((occupant) => ({
        id: occupant.id,
        seat: occupant.seat,
        enabled: occupant.enabled,
        hipPosition: { ...occupant.hipPosition },
        absorptionCoefficient: occupant.material.absorptionCoefficient,
      })),
      environment: { ...config.environment },
      speedOfSoundMetersPerSecond: solverOutput.speedOfSoundMetersPerSecond,
      sampleRateHz,
      irDurationSeconds,
      maxReflectionOrder,
      randomSeed,
      imageSourceCount: solverOutput.contributions.length + solverOutput.baffleContributions.length,
      microphoneMounting: microphone.mounting,
      microphoneOrientation: { ...microphone.orientation },
      microphoneBaffle: microphoneBaffle
        ? {
            radiusMeters: microphoneBaffle.radiusMeters,
            absorptionCoefficient: microphoneBaffle.absorptionCoefficient,
            standoffMeters: microphoneBaffle.standoffMeters,
            cutoffHz,
            extraImageCount: solverOutput.baffleContributions.length,
          }
        : null,
    },
  };
}

function depositContributions(
  samples: Float32Array,
  contributions: readonly ImageSourceContribution[],
  sampleRateHz: number,
): void {
  const sampleCount = samples.length;
  for (const contribution of contributions) {
    const exactSampleIndex = contribution.propagationDelaySeconds * sampleRateHz;
    const lowerIndex = Math.floor(exactSampleIndex);
    if (lowerIndex >= sampleCount) continue;
    const fraction = exactSampleIndex - lowerIndex;
    samples[lowerIndex] += contribution.amplitude * (1 - fraction);
    if (lowerIndex + 1 < sampleCount) {
      samples[lowerIndex + 1] += contribution.amplitude * fraction;
    }
  }
}
