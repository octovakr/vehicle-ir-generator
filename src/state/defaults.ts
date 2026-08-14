import type {
  MicrophoneConfig,
  SimulationConfig,
  SoundSourceConfig,
  SurfaceMaterials,
  Vec3,
  VehicleGeometry,
} from '../acoustic/types';
import { getMaterialPreset } from '../acoustic/materials';
import {
  DEFAULT_GENERATED_SPEECH_SECONDS,
  DEFAULT_IR_DURATION_SECONDS,
  DEFAULT_MAX_REFLECTION_ORDER,
  DEFAULT_RANDOM_SEED,
  DEFAULT_RELATIVE_HUMIDITY_PERCENT,
  DEFAULT_SAMPLE_RATE_HZ,
  DEFAULT_TEMPERATURE_CELSIUS,
  DEFAULT_VEHICLE_HEIGHT_METERS,
  DEFAULT_VEHICLE_LENGTH_METERS,
  DEFAULT_VEHICLE_WIDTH_METERS,
} from '../acoustic/constants';

/**
 * Default configuration factory and zone presets.
 *
 * Zones are logical seating presets (rule 8):
 *   Zone 1 — front left (driver, LHD)
 *   Zone 2 — front right (passenger)
 *   Zone 3 — rear left
 *   Zone 4 — rear right
 * Positions approximate a seated speaker's mouth location and are derived
 * from the vehicle dimensions. Sources may be moved freely afterwards.
 */
export function zonePresetPosition(zone: 1 | 2 | 3 | 4, vehicle: VehicleGeometry): Vec3 {
  const { widthMeters: W, lengthMeters: L, heightMeters: H } = vehicle;
  const mouthHeight = Math.min(0.75 * H, H - 0.05);
  switch (zone) {
    case 1:
      return { x: 0.27 * W, y: 0.3 * L, z: mouthHeight };
    case 2:
      return { x: 0.73 * W, y: 0.3 * L, z: mouthHeight };
    case 3:
      return { x: 0.27 * W, y: 0.72 * L, z: mouthHeight };
    case 4:
      return { x: 0.73 * W, y: 0.72 * L, z: mouthHeight };
  }
}

/** Default microphone position: near the rear-view mirror (front-center, high). */
export function defaultMicrophonePosition(vehicle: VehicleGeometry): Vec3 {
  return {
    x: 0.5 * vehicle.widthMeters,
    y: 0.12 * vehicle.lengthMeters,
    z: 0.88 * vehicle.heightMeters,
  };
}

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function createDefaultSource(
  zone: 1 | 2 | 3 | 4,
  vehicle: VehicleGeometry,
  seed: number,
): SoundSourceConfig {
  return {
    id: nextId('source'),
    label: `Source ${idCounter}`,
    position: zonePresetPosition(zone, vehicle),
    gain: 1,
    enabled: true,
    zone,
    audio: { kind: 'generated', seed, durationSeconds: DEFAULT_GENERATED_SPEECH_SECONDS },
  };
}

export function createDefaultMicrophone(vehicle: VehicleGeometry): MicrophoneConfig {
  return {
    id: nextId('mic'),
    label: `Mic ${idCounter}`,
    position: defaultMicrophonePosition(vehicle),
    enabled: true,
    mounting: 'rearview-mirror',
  };
}

function defaultMaterials(): SurfaceMaterials {
  // Typical sedan interior: carpet floor, fabric headliner, trimmed doors,
  // glass windshield, mixed rear (parcel shelf + glass).
  const carpet = getMaterialPreset('carpet')!;
  const fabric = getMaterialPreset('fabric')!;
  const plastic = getMaterialPreset('plastic')!;
  const glass = getMaterialPreset('glass')!;
  return {
    floor: { ...carpet },
    ceiling: { ...fabric },
    left: { ...plastic },
    right: { ...plastic },
    front: { ...glass },
    rear: { ...fabric },
  };
}

export function createDefaultConfig(): SimulationConfig {
  const vehicle: VehicleGeometry = {
    widthMeters: DEFAULT_VEHICLE_WIDTH_METERS,
    lengthMeters: DEFAULT_VEHICLE_LENGTH_METERS,
    heightMeters: DEFAULT_VEHICLE_HEIGHT_METERS,
  };
  return {
    vehicle,
    sources: [createDefaultSource(1, vehicle, DEFAULT_RANDOM_SEED)],
    microphones: [createDefaultMicrophone(vehicle)],
    materials: defaultMaterials(),
    environment: {
      temperatureCelsius: DEFAULT_TEMPERATURE_CELSIUS,
      relativeHumidityPercent: DEFAULT_RELATIVE_HUMIDITY_PERCENT,
    },
    simulation: {
      sampleRateHz: DEFAULT_SAMPLE_RATE_HZ,
      irDurationSeconds: DEFAULT_IR_DURATION_SECONDS,
      maxReflectionOrder: DEFAULT_MAX_REFLECTION_ORDER,
      randomSeed: DEFAULT_RANDOM_SEED,
    },
  };
}
