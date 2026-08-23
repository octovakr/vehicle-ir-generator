/**
 * Core data types shared by the acoustic engine.
 *
 * The acoustic engine is a pure TypeScript module: it must never import
 * anything from React, Three.js, Electron or the audio-playback layer.
 *
 * Coordinate convention (meters, right-handed):
 *   x — across the vehicle width,  0 = left wall,  W = right wall
 *   y — along the vehicle length,  0 = front wall, L = rear wall
 *   z — vehicle height,            0 = floor,      H = ceiling
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Identifies the cabin geometry the simulator is currently using.
 *
 * `rectangular` is the original axis-aligned shoebox (fully user-editable).
 * Named models replace that shoebox with a cabin derived from a published
 * vehicle specification sheet and add interior objects (seats, dashboard, …).
 */
export type VehicleModelId = 'rectangular' | 'ioniq5-2026' | 'tucson-2026';

/** Axis-aligned rectangular vehicle interior used as the ISM enclosure. */
export interface VehicleGeometry {
  /** Interior width in meters (x extent). */
  widthMeters: number;
  /** Interior length in meters (y extent). */
  lengthMeters: number;
  /** Interior height in meters (z extent). */
  heightMeters: number;
}

/** Axis-aligned bounding box in simulation coordinates (meters). */
export interface AxisAlignedBox {
  min: Vec3;
  max: Vec3;
}

/**
 * Kind of interior object. Used for visualization and for deciding which
 * faces generate extra first-order image sources.
 */
export type InteriorObjectKind =
  | 'seat-cushion'
  | 'seat-back'
  | 'headrest'
  | 'dashboard'
  | 'center-console'
  | 'steering-wheel';

/**
 * An interior object that occupies volume inside the cabin.
 *
 * Acoustically (see interiorGeometry.ts):
 *   - the object is an absorbing volume along image-source paths
 *   - its exposed faces can generate additional first-order reflections
 *
 * APPROXIMATION: objects are axis-aligned boxes, not scanned CAD meshes.
 */
export interface InteriorObject {
  id: string;
  label: string;
  kind: InteriorObjectKind;
  bounds: AxisAlignedBox;
  material: AcousticMaterial;
}

/**
 * The six primary surfaces of the rectangular enclosure. Each surface has an
 * independent material so that, e.g., a glass windshield (front) and a carpet
 * floor can coexist. Future geometry may add more surfaces; code must not
 * assume exactly six surfaces forever.
 */
export type SurfaceId = 'floor' | 'ceiling' | 'left' | 'right' | 'front' | 'rear';

export const ALL_SURFACES: readonly SurfaceId[] = [
  'floor',
  'ceiling',
  'left',
  'right',
  'front',
  'rear',
];

/**
 * Broadband acoustic material.
 *
 * `absorptionCoefficient` is the ENERGY absorption coefficient β with
 * 0 ≤ β ≤ 1 (β = 0: perfectly reflective, β = 1: perfectly absorptive).
 * The solver converts it to an amplitude (pressure) reflection coefficient
 * via r = sqrt(1 − β); see imageSourceSolver.ts for the derivation.
 *
 * APPROXIMATION: a single broadband β per material. The structure is designed
 * to be extended to frequency-dependent coefficients (β per octave band)
 * without breaking the public API.
 */
export interface AcousticMaterial {
  id: string;
  name: string;
  /** Energy absorption coefficient β, 0 ≤ β ≤ 1. */
  absorptionCoefficient: number;
  /** True when the user entered β manually ("Custom" material). */
  isCustom?: boolean;
}

/** Material assignment for each surface of the enclosure. */
export type SurfaceMaterials = Record<SurfaceId, AcousticMaterial>;

/**
 * Environmental parameters that affect sound propagation.
 * Temperature is in degrees Celsius; humidity is relative humidity in %.
 */
export interface AcousticEnvironment {
  temperatureCelsius: number;
  relativeHumidityPercent: number;
}

/** How a source obtains its audio signal (irrelevant to IR computation). */
export type SourceAudioConfig =
  | { kind: 'generated'; seed: number; durationSeconds: number }
  | { kind: 'file'; fileName: string };

/** A speech source, modeled as an omnidirectional point source (MVP). */
export interface SoundSourceConfig {
  id: string;
  label: string;
  /** Position inside the enclosure, meters. */
  position: Vec3;
  /** Linear gain applied to the source signal before convolution (1 = 0 dB). */
  gain: number;
  enabled: boolean;
  /** Logical seating zone preset (1–4). Purely organizational. */
  zone: 1 | 2 | 3 | 4;
  audio: SourceAudioConfig;
}

/**
 * Microphone mounting descriptor.
 *
 * MVP: every microphone is simulated as an ideal point receiver in the free
 * field regardless of mounting (documented approximation — boundary/rigid-body
 * effects are NOT modeled yet). The mounting type is carried through the data
 * model so the future solver can consume it (rule 29).
 */
export type MicrophoneMounting =
  | 'free'
  | 'rearview-mirror'
  | 'ceiling'
  | 'dashboard'
  | 'a-pillar'
  | 'door';

export interface MicrophoneConfig {
  id: string;
  label: string;
  position: Vec3;
  enabled: boolean;
  mounting: MicrophoneMounting;
}

/**
 * One image-source arrival at the microphone. Produced by the ISM solver
 * and accumulated into h[n] by the IR generator.
 */
export interface ImageSourceContribution {
  /** Propagation delay from image source to microphone, seconds. */
  propagationDelaySeconds: number;
  /** Propagation distance, meters. */
  propagationDistanceMeters: number;
  /** Signed pressure amplitude of this impulse (dimensionless, re 1 m). */
  amplitude: number;
  /** Total number of reflections for this image (0 = direct path). */
  reflectionOrder: number;
}

/** Discrete-time simulation parameters. */
export interface SimulationParams {
  /** Output sample rate in samples/second. */
  sampleRateHz: number;
  /** Length of the generated IR in seconds. */
  irDurationSeconds: number;
  /** Maximum image-source reflection order (0 = direct path only). */
  maxReflectionOrder: number;
  /** Seed for all randomized generation (generated speech, etc.). */
  randomSeed: number;
}

/**
 * The single canonical simulation configuration (rule 20). UI components
 * edit this object through the store; the engine consumes it read-only.
 */
export interface SimulationConfig {
  /** Which vehicle model produced the current cabin / interior objects. */
  vehicleModelId: VehicleModelId;
  vehicle: VehicleGeometry;
  /**
   * Seats, dashboard and other cabin objects. Empty for the rectangular
   * default. Consumed by the solver (absorption + extra reflections) and
   * by the 3D viewport (visualization only).
   */
  interiorObjects: InteriorObject[];
  sources: SoundSourceConfig[];
  microphones: MicrophoneConfig[];
  materials: SurfaceMaterials;
  environment: AcousticEnvironment;
  simulation: SimulationParams;
}

/** One impulse response h[n] for a specific (source, microphone) pair. */
export interface ImpulseResponse {
  sourceId: string;
  microphoneId: string;
  sampleRateHz: number;
  /** Discrete-time impulse response samples h[n]. */
  samples: Float32Array;
  /** Metadata for reproducibility / ML dataset generation (rule 42). */
  metadata: ImpulseResponseMetadata;
}

export interface ImpulseResponseMetadata {
  simulatorVersion: string;
  vehicleModelId: VehicleModelId;
  vehicle: VehicleGeometry;
  sourcePosition: Vec3;
  microphonePosition: Vec3;
  surfaceAbsorption: Record<SurfaceId, number>;
  interiorObjectAbsorption: Record<string, number>;
  environment: AcousticEnvironment;
  speedOfSoundMetersPerSecond: number;
  sampleRateHz: number;
  irDurationSeconds: number;
  maxReflectionOrder: number;
  randomSeed: number;
  imageSourceCount: number;
}
