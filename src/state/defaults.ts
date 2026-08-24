import type {
  InteriorObject,
  MicrophoneConfig,
  OccupantConfig,
  OccupantSeatId,
  SimulationConfig,
  SoundSourceConfig,
  SurfaceMaterials,
  Vec3,
  VehicleGeometry,
  VehicleModelId,
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
  SEATED_MOUTH_ABOVE_CUSHION_METERS,
} from '../acoustic/constants';
import {
  applyMicrophoneMounting,
  defaultMicrophoneOrientation,
  defaultMicrophonePositionForMounting,
} from '../acoustic/microphoneMounting';
import { occupantHipPreset, occupantSeatLabel } from '../acoustic/occupants';
import { getVehicleProfile } from '../acoustic/vehicleModels';

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
const ZONE_SEAT_PREFIX: Record<1 | 2 | 3 | 4, string> = {
  1: 'seat-fl-cushion',
  2: 'seat-fr-cushion',
  3: 'seat-rl-cushion',
  4: 'seat-rr-cushion',
};

export function zonePresetPosition(
  zone: 1 | 2 | 3 | 4,
  vehicle: VehicleGeometry,
  interiorObjects: readonly InteriorObject[] = [],
): Vec3 {
  const seat = interiorObjects.find((object) => object.id === ZONE_SEAT_PREFIX[zone]);
  if (seat) {
    const { min, max } = seat.bounds;
    const mouthHeight = Math.min(max.z + SEATED_MOUTH_ABOVE_CUSHION_METERS, vehicle.heightMeters - 0.05);
    return {
      x: 0.5 * (min.x + max.x),
      y: 0.5 * (min.y + max.y),
      z: mouthHeight,
    };
  }

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
  return defaultMicrophonePositionForMounting('rearview-mirror', vehicle);
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
  interiorObjects: readonly InteriorObject[] = [],
): SoundSourceConfig {
  return {
    id: nextId('source'),
    label: `Source ${idCounter}`,
    position: zonePresetPosition(zone, vehicle, interiorObjects),
    gain: 1,
    enabled: true,
    zone,
    audio: { kind: 'generated', seed, durationSeconds: DEFAULT_GENERATED_SPEECH_SECONDS },
  };
}

export function createDefaultMicrophone(vehicle: VehicleGeometry): MicrophoneConfig {
  const mounting = 'rearview-mirror';
  const position = defaultMicrophonePositionForMounting(mounting, vehicle);
  return {
    id: nextId('mic'),
    label: `Mic ${idCounter}`,
    position,
    enabled: true,
    mounting,
    orientation: defaultMicrophoneOrientation(mounting, vehicle, position),
  };
}

function defaultClothingMaterial() {
  const clothing = getMaterialPreset('clothing');
  if (!clothing) throw new Error('Missing clothing material preset');
  return { ...clothing };
}

export function createDefaultOccupant(
  seat: OccupantSeatId,
  vehicle: VehicleGeometry,
  interiorObjects: readonly InteriorObject[] = [],
): OccupantConfig {
  return {
    id: nextId('occupant'),
    label: occupantSeatLabel(seat),
    enabled: true,
    seat,
    hipPosition: occupantHipPreset(seat, vehicle, interiorObjects),
    material: defaultClothingMaterial(),
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
  const profile = getVehicleProfile('rectangular');
  const vehicle = { ...profile.cabin };
  return {
    vehicleModelId: 'rectangular',
    vehicle,
    interiorObjects: [],
    occupants: [],
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

/**
 * Replace the current vehicle model. Cabin dimensions, interior objects and
 * default surface materials come from the catalog. Source / microphone
 * coordinates and occupant hip positions are remapped to the new cabin's
 * seating presets — the previous numbers are not meaningful in a different
 * enclosure, so they are not kept. Occupants themselves are preserved.
 */
export function applyVehicleModel(
  config: SimulationConfig,
  modelId: VehicleModelId,
): SimulationConfig {
  const profile = getVehicleProfile(modelId);
  const vehicle = { ...profile.cabin };
  const interiorObjects = profile.interiorObjects;
  return {
    ...config,
    vehicleModelId: modelId,
    vehicle,
    interiorObjects,
    occupants: config.occupants.map((occupant) => ({
      ...occupant,
      hipPosition: occupantHipPreset(occupant.seat, vehicle, interiorObjects),
    })),
    materials: {
      floor: { ...profile.defaultMaterials.floor },
      ceiling: { ...profile.defaultMaterials.ceiling },
      left: { ...profile.defaultMaterials.left },
      right: { ...profile.defaultMaterials.right },
      front: { ...profile.defaultMaterials.front },
      rear: { ...profile.defaultMaterials.rear },
    },
    sources: config.sources.map((source) => ({
      ...source,
      position: zonePresetPosition(source.zone, vehicle, interiorObjects),
    })),
    microphones: config.microphones.map((microphone) =>
      applyMicrophoneMounting(microphone, microphone.mounting, vehicle, interiorObjects),
    ),
  };
}
