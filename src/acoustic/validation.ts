import type { InteriorObject, SimulationConfig, Vec3, VehicleGeometry } from './types';
import { ALL_SURFACES } from './types';
import {
  MAX_DIMENSION_METERS,
  MAX_IR_DURATION_SECONDS,
  MAX_REFLECTION_ORDER_LIMIT,
  MAX_SAMPLE_RATE_HZ,
  MAX_SOURCES,
  MIN_DIMENSION_METERS,
  MIN_IR_DURATION_SECONDS,
  MIN_SAMPLE_RATE_HZ,
} from './constants';

/**
 * Human-readable validation of the full simulation configuration (rule 34).
 * Returns a list of error messages; an empty list means the configuration is
 * valid and Generate may run. Positions are never silently clipped.
 */
export function validateSimulationConfig(config: SimulationConfig): string[] {
  const errors: string[] = [];
  const { vehicle, sources, microphones, materials, simulation } = config;

  validateVehicle(vehicle, errors);

  if (sources.length === 0) {
    errors.push('At least one speech source is required.');
  }
  if (sources.length > MAX_SOURCES) {
    errors.push(`At most ${MAX_SOURCES} speech sources are supported.`);
  }
  if (!sources.some((s) => s.enabled)) {
    errors.push('At least one speech source must be enabled.');
  }

  for (const source of sources) {
    validatePositionInside(source.position, vehicle, `Source "${source.label}"`, errors);
    if (!Number.isFinite(source.gain) || source.gain < 0) {
      errors.push(`Source "${source.label}" gain must be a non-negative number.`);
    }
  }

  if (microphones.length === 0) {
    errors.push('At least one microphone is required.');
  }
  if (!microphones.some((m) => m.enabled)) {
    errors.push('At least one microphone must be enabled.');
  }
  for (const microphone of microphones) {
    validatePositionInside(microphone.position, vehicle, `Microphone "${microphone.label}"`, errors);
  }

  for (const surface of ALL_SURFACES) {
    const beta = materials[surface]?.absorptionCoefficient;
    if (beta === undefined || !Number.isFinite(beta) || beta < 0 || beta > 1) {
      errors.push(
        `${surfaceDisplayName(surface)} absorption coefficient must be between 0 and 1.`,
      );
    }
  }

  for (const object of config.interiorObjects) {
    validateInteriorObject(object, vehicle, errors);
  }

  if (
    !Number.isFinite(simulation.sampleRateHz) ||
    simulation.sampleRateHz < MIN_SAMPLE_RATE_HZ ||
    simulation.sampleRateHz > MAX_SAMPLE_RATE_HZ
  ) {
    errors.push(`Sample rate must be between ${MIN_SAMPLE_RATE_HZ} and ${MAX_SAMPLE_RATE_HZ} Hz.`);
  }
  if (
    !Number.isFinite(simulation.irDurationSeconds) ||
    simulation.irDurationSeconds < MIN_IR_DURATION_SECONDS ||
    simulation.irDurationSeconds > MAX_IR_DURATION_SECONDS
  ) {
    errors.push(
      `IR duration must be between ${MIN_IR_DURATION_SECONDS} and ${MAX_IR_DURATION_SECONDS} seconds.`,
    );
  }
  if (
    !Number.isInteger(simulation.maxReflectionOrder) ||
    simulation.maxReflectionOrder < 0 ||
    simulation.maxReflectionOrder > MAX_REFLECTION_ORDER_LIMIT
  ) {
    errors.push(
      `Maximum reflection order must be an integer between 0 and ${MAX_REFLECTION_ORDER_LIMIT}.`,
    );
  }

  return errors;
}

function validateVehicle(vehicle: VehicleGeometry, errors: string[]): void {
  const dims: Array<[string, number]> = [
    ['width', vehicle.widthMeters],
    ['length', vehicle.lengthMeters],
    ['height', vehicle.heightMeters],
  ];
  for (const [name, value] of dims) {
    if (!Number.isFinite(value) || value < MIN_DIMENSION_METERS || value > MAX_DIMENSION_METERS) {
      errors.push(
        `Vehicle ${name} must be between ${MIN_DIMENSION_METERS} and ${MAX_DIMENSION_METERS} meters.`,
      );
    }
  }
}

/**
 * A position is valid strictly inside the enclosure: 0 < x < W, 0 < y < L,
 * 0 < z < H. Boundary-mounted objects are not yet supported by the solver.
 */
function validatePositionInside(
  position: Vec3,
  vehicle: VehicleGeometry,
  subject: string,
  errors: string[],
): void {
  const { x, y, z } = position;
  if (![x, y, z].every(Number.isFinite)) {
    errors.push(`${subject} position contains an invalid number.`);
    return;
  }
  if (x <= 0 || x >= vehicle.widthMeters) {
    errors.push(
      `${subject} is outside the vehicle: x must be between 0 and ${vehicle.widthMeters} m (exclusive).`,
    );
  }
  if (y <= 0 || y >= vehicle.lengthMeters) {
    errors.push(
      `${subject} is outside the vehicle: y must be between 0 and ${vehicle.lengthMeters} m (exclusive).`,
    );
  }
  if (z <= 0 || z >= vehicle.heightMeters) {
    errors.push(
      `${subject} is outside the vehicle: z must be between 0 and ${vehicle.heightMeters} m (exclusive).`,
    );
  }
}

function validateInteriorObject(
  object: InteriorObject,
  vehicle: VehicleGeometry,
  errors: string[],
): void {
  const beta = object.material?.absorptionCoefficient;
  if (beta === undefined || !Number.isFinite(beta) || beta < 0 || beta > 1) {
    errors.push(
      `Interior object "${object.label}" absorption coefficient must be between 0 and 1.`,
    );
  }
  const { min, max } = object.bounds;
  if (![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite) || max.x <= min.x || max.y <= min.y || max.z <= min.z) {
    errors.push(`Interior object "${object.label}" has an invalid bounding box.`);
    return;
  }
  if (max.x <= 0 || min.x >= vehicle.widthMeters || max.y <= 0 || min.y >= vehicle.lengthMeters || max.z <= 0 || min.z >= vehicle.heightMeters) {
    errors.push(`Interior object "${object.label}" lies entirely outside the vehicle cabin.`);
  }
}

export function surfaceDisplayName(surface: string): string {
  switch (surface) {
    case 'floor':
      return 'Floor';
    case 'ceiling':
      return 'Ceiling';
    case 'left':
      return 'Left wall';
    case 'right':
      return 'Right wall';
    case 'front':
      return 'Front wall (windshield)';
    case 'rear':
      return 'Rear wall';
    default:
      return surface;
  }
}
