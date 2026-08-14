import { describe, expect, it } from 'vitest';
import type { SimulationConfig, Vec3 } from './types';
import { speedOfSoundMetersPerSecond } from './environment';
import { generateImpulseResponse } from './impulseResponse';
import { validateSimulationConfig } from './validation';
import { solveImageSources } from './imageSourceSolver';

/**
 * Acoustic engine unit tests (rule 25). Tests assert physical relationships
 * (delays grow with distance, energy falls with absorption, …) rather than
 * exact floating-point values.
 */

function makeConfig(overrides?: {
  sourcePosition?: Vec3;
  microphonePosition?: Vec3;
  absorption?: number;
  temperatureCelsius?: number;
  maxReflectionOrder?: number;
  vehicle?: { widthMeters: number; lengthMeters: number; heightMeters: number };
}): SimulationConfig {
  const beta = overrides?.absorption ?? 0.3;
  const material = { id: 'test', name: 'Test', absorptionCoefficient: beta };
  return {
    vehicle: overrides?.vehicle ?? { widthMeters: 1.5, lengthMeters: 2.8, heightMeters: 1.2 },
    sources: [
      {
        id: 'src-1',
        label: 'Source 1',
        position: overrides?.sourcePosition ?? { x: 0.4, y: 0.8, z: 0.9 },
        gain: 1,
        enabled: true,
        zone: 1,
        audio: { kind: 'generated', seed: 1, durationSeconds: 1 },
      },
    ],
    microphones: [
      {
        id: 'mic-1',
        label: 'Mic 1',
        position: overrides?.microphonePosition ?? { x: 0.75, y: 0.35, z: 1.05 },
        enabled: true,
        mounting: 'free',
      },
    ],
    materials: {
      floor: { ...material },
      ceiling: { ...material },
      left: { ...material },
      right: { ...material },
      front: { ...material },
      rear: { ...material },
    },
    environment: {
      temperatureCelsius: overrides?.temperatureCelsius ?? 20,
      relativeHumidityPercent: 50,
    },
    simulation: {
      sampleRateHz: 16000,
      irDurationSeconds: 0.25,
      maxReflectionOrder: overrides?.maxReflectionOrder ?? 6,
      randomSeed: 42,
    },
  };
}

function generate(config: SimulationConfig) {
  return generateImpulseResponse(config, config.sources[0], config.microphones[0]);
}

function firstNonZeroIndex(samples: Float32Array): number {
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > 1e-9) return i;
  }
  return -1;
}

function totalEnergy(samples: Float32Array): number {
  let energy = 0;
  for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
  return energy;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe('speed of sound', () => {
  it('is ~343 m/s at 20 °C / 50 % RH and increases with temperature', () => {
    const c20 = speedOfSoundMetersPerSecond({ temperatureCelsius: 20, relativeHumidityPercent: 50 });
    expect(c20).toBeGreaterThan(340);
    expect(c20).toBeLessThan(347);
    const c0 = speedOfSoundMetersPerSecond({ temperatureCelsius: 0, relativeHumidityPercent: 50 });
    expect(c20).toBeGreaterThan(c0);
  });
});

describe('direct path (reflection order 0)', () => {
  it('produces exactly one contribution at the direct propagation delay', () => {
    const config = makeConfig({ maxReflectionOrder: 0 });
    const ir = generate(config);

    const source = config.sources[0].position;
    const microphone = config.microphones[0].position;
    const c = speedOfSoundMetersPerSecond(config.environment);
    const expectedDelaySamples =
      (distance(source, microphone) / c) * config.simulation.sampleRateHz;

    const onset = firstNonZeroIndex(ir.samples);
    expect(onset).toBeGreaterThanOrEqual(Math.floor(expectedDelaySamples));
    expect(onset).toBeLessThanOrEqual(Math.ceil(expectedDelaySamples));
    expect(ir.metadata.imageSourceCount).toBe(1);
  });
});

describe('distance', () => {
  it('greater source–microphone distance produces a later direct-path onset', () => {
    const near = generate(
      makeConfig({ microphonePosition: { x: 0.5, y: 0.9, z: 0.9 }, maxReflectionOrder: 0 }),
    );
    const far = generate(
      makeConfig({ microphonePosition: { x: 1.1, y: 2.5, z: 0.3 }, maxReflectionOrder: 0 }),
    );
    expect(firstNonZeroIndex(far.samples)).toBeGreaterThan(firstNonZeroIndex(near.samples));
  });
});

describe('temperature', () => {
  it('higher temperature (faster sound) shortens the propagation delay', () => {
    const cold = generate(makeConfig({ temperatureCelsius: -10, maxReflectionOrder: 0 }));
    const hot = generate(makeConfig({ temperatureCelsius: 40, maxReflectionOrder: 0 }));
    expect(firstNonZeroIndex(hot.samples)).toBeLessThanOrEqual(firstNonZeroIndex(cold.samples));
    // Also verify at solver level (sample quantization can mask small shifts).
    const config = makeConfig({ temperatureCelsius: 40 });
    const solved = solveImageSources({
      geometry: config.vehicle,
      sourcePosition: config.sources[0].position,
      microphonePosition: config.microphones[0].position,
      materials: config.materials,
      environment: { temperatureCelsius: 40, relativeHumidityPercent: 50 },
      maxReflectionOrder: 0,
      maxDelaySeconds: 0.25,
    });
    const solvedCold = solveImageSources({
      geometry: config.vehicle,
      sourcePosition: config.sources[0].position,
      microphonePosition: config.microphones[0].position,
      materials: config.materials,
      environment: { temperatureCelsius: -10, relativeHumidityPercent: 50 },
      maxReflectionOrder: 0,
      maxDelaySeconds: 0.25,
    });
    expect(solved.contributions[0].propagationDelaySeconds).toBeLessThan(
      solvedCold.contributions[0].propagationDelaySeconds,
    );
  });
});

describe('absorption', () => {
  it('higher absorption reduces reflected energy but not the direct path', () => {
    const reflective = generate(makeConfig({ absorption: 0.05 }));
    const absorptive = generate(makeConfig({ absorption: 0.8 }));

    // Direct-path amplitude is independent of absorption.
    const onset = firstNonZeroIndex(reflective.samples);
    expect(firstNonZeroIndex(absorptive.samples)).toBe(onset);

    // Energy arriving after the direct path must decrease with absorption.
    const tailEnergy = (samples: Float32Array): number =>
      totalEnergy(samples.slice(onset + 8));
    expect(tailEnergy(absorptive.samples)).toBeLessThan(tailEnergy(reflective.samples));
  });

  it('β = 1 (fully absorptive) leaves only the direct path', () => {
    const ir = generate(makeConfig({ absorption: 1, maxReflectionOrder: 8 }));
    const direct = generate(makeConfig({ absorption: 1, maxReflectionOrder: 0 }));
    // All reflected contributions have amplitude 0 → IR equals direct-only IR.
    expect(totalEnergy(ir.samples)).toBeCloseTo(totalEnergy(direct.samples), 10);
  });
});

describe('room dimensions', () => {
  it('changing dimensions changes the reflection pattern', () => {
    const small = generate(makeConfig());
    const large = generate(
      makeConfig({ vehicle: { widthMeters: 2.2, lengthMeters: 4, heightMeters: 1.6 } }),
    );
    expect(irsDiffer(small.samples, large.samples)).toBe(true);
  });
});

describe('source and microphone positions', () => {
  it('moving the source changes the IR', () => {
    const a = generate(makeConfig({ sourcePosition: { x: 0.4, y: 0.8, z: 0.9 } }));
    const b = generate(makeConfig({ sourcePosition: { x: 1.1, y: 2.0, z: 0.6 } }));
    expect(irsDiffer(a.samples, b.samples)).toBe(true);
  });

  it('moving the microphone changes the IR', () => {
    const a = generate(makeConfig({ microphonePosition: { x: 0.75, y: 0.35, z: 1.05 } }));
    const b = generate(makeConfig({ microphonePosition: { x: 0.3, y: 2.2, z: 0.4 } }));
    expect(irsDiffer(a.samples, b.samples)).toBe(true);
  });
});

describe('multiple sources', () => {
  it('each source produces its own IR toward the same microphone', () => {
    const config = makeConfig();
    config.sources.push({
      ...config.sources[0],
      id: 'src-2',
      label: 'Source 2',
      position: { x: 1.1, y: 2.0, z: 0.9 },
    });
    const ir1 = generateImpulseResponse(config, config.sources[0], config.microphones[0]);
    const ir2 = generateImpulseResponse(config, config.sources[1], config.microphones[0]);
    expect(ir1.sourceId).toBe('src-1');
    expect(ir2.sourceId).toBe('src-2');
    expect(irsDiffer(ir1.samples, ir2.samples)).toBe(true);
  });
});

describe('boundary validation', () => {
  it('rejects a source outside the vehicle', () => {
    const config = makeConfig({ sourcePosition: { x: -0.1, y: 0.8, z: 0.9 } });
    const errors = validateSimulationConfig(config);
    expect(errors.some((e) => e.includes('Source "Source 1"'))).toBe(true);
  });

  it('rejects a microphone on the boundary', () => {
    const config = makeConfig({ microphonePosition: { x: 0.75, y: 0.35, z: 1.2 } });
    const errors = validateSimulationConfig(config);
    expect(errors.some((e) => e.includes('Microphone "Mic 1"'))).toBe(true);
  });

  it('rejects an invalid absorption coefficient', () => {
    const config = makeConfig();
    config.materials.ceiling.absorptionCoefficient = 1.4;
    const errors = validateSimulationConfig(config);
    expect(errors.some((e) => e.toLowerCase().includes('ceiling'))).toBe(true);
  });

  it('accepts the default configuration', () => {
    expect(validateSimulationConfig(makeConfig())).toEqual([]);
  });
});

describe('determinism', () => {
  it('identical config produces an identical IR', () => {
    const a = generate(makeConfig());
    const b = generate(makeConfig());
    expect(Array.from(a.samples)).toEqual(Array.from(b.samples));
  });
});

function irsDiffer(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 1e-9) return true;
  }
  return false;
}
