/**
 * Seated-occupant geometry for in-cabin acoustics.
 *
 * A speech source remains an omnidirectional point (rule 8 / 28). Occupants
 * are extra interior objects: they occupy volume, absorb along image-source
 * paths, and generate first-order face reflections via interiorGeometry.ts.
 *
 * APPROXIMATION — this is NOT:
 *   - a scanned body mesh or CAD manikin
 *   - an articulated skeleton / clothing-layer model
 *   - a diffraction or scattering model of limbs
 *   - a measured in-car insertion loss of a seated passenger
 *
 * What IS modeled:
 *   - four axis-aligned boxes (thighs, torso, head, shins) sized from
 *     50th-percentile seated-adult anthropometry (constants.ts)
 *   - seated recline matching TYPICAL_SEAT_BACK_RECLINE_RADIANS
 *   - clothing energy absorption β → amplitude reflection sqrt(1 − β)
 *
 * Overlap between occupant boxes and seat boxes can double-count a short
 * path length; that is accepted as part of the AABB approximation.
 *
 * This module is pure math — no UI or renderer imports.
 */

import type {
  AcousticMaterial,
  AxisAlignedBox,
  InteriorObject,
  OccupantConfig,
  OccupantSeatId,
  Vec3,
  VehicleGeometry,
} from './types';
import {
  ADULT_CHEST_DEPTH_METERS,
  ADULT_HEAD_DEPTH_METERS,
  ADULT_HEAD_HEIGHT_METERS,
  ADULT_HEAD_WIDTH_METERS,
  ADULT_HIP_BREADTH_SITTING_METERS,
  ADULT_MOUTH_ABOVE_HIP_METERS,
  ADULT_NECK_HEIGHT_METERS,
  ADULT_SHIN_CLEARANCE_ABOVE_FLOOR_METERS,
  ADULT_SHIN_DEPTH_METERS,
  ADULT_SHOULDER_BREADTH_METERS,
  ADULT_THIGH_LENGTH_METERS,
  ADULT_THIGH_THICKNESS_METERS,
  ADULT_TORSO_HEIGHT_METERS,
  OCCUPANT_HIP_AFT_OF_CUSHION_CENTER_METERS,
  TYPICAL_CUV_SEAT_H30_METERS,
  TYPICAL_SEAT_BACK_RECLINE_RADIANS,
} from './constants';

const SEAT_CUSHION_ID: Record<OccupantSeatId, string> = {
  1: 'seat-fl-cushion',
  2: 'seat-fr-cushion',
  3: 'seat-rl-cushion',
  4: 'seat-rr-cushion',
};

export const OCCUPANT_SEAT_OPTIONS: ReadonlyArray<{
  seat: OccupantSeatId;
  label: string;
}> = [
  { seat: 1, label: 'Front left' },
  { seat: 2, label: 'Front right' },
  { seat: 3, label: 'Rear left' },
  { seat: 4, label: 'Rear right' },
];

export function occupantSeatLabel(seat: OccupantSeatId): string {
  return OCCUPANT_SEAT_OPTIONS.find((option) => option.seat === seat)?.label ?? `Seat ${seat}`;
}

/**
 * H-point preset for a seating slot. When a matching seat cushion exists,
 * the hip sits on the cushion, slightly aft of the planform center (toward
 * the bight). Otherwise a rectangular-cabin zone estimate is used.
 */
export function occupantHipPreset(
  seat: OccupantSeatId,
  vehicle: VehicleGeometry,
  interiorObjects: readonly InteriorObject[],
): Vec3 {
  const cushion = interiorObjects.find((object) => object.id === SEAT_CUSHION_ID[seat]);
  if (cushion) {
    const { min, max } = cushion.bounds;
    const hipY = clamp(
      0.5 * (min.y + max.y) + OCCUPANT_HIP_AFT_OF_CUSHION_CENTER_METERS,
      min.y + 0.06,
      max.y - 0.04,
    );
    return {
      x: 0.5 * (min.x + max.x),
      y: hipY,
      z: max.z,
    };
  }

  const { widthMeters: W, lengthMeters: L, heightMeters: H } = vehicle;
  const hipZ = Math.min(TYPICAL_CUV_SEAT_H30_METERS, H - 0.2);
  switch (seat) {
    case 1:
      return { x: 0.27 * W, y: 0.3 * L, z: hipZ };
    case 2:
      return { x: 0.73 * W, y: 0.3 * L, z: hipZ };
    case 3:
      return { x: 0.27 * W, y: 0.72 * L, z: hipZ };
    case 4:
      return { x: 0.73 * W, y: 0.72 * L, z: hipZ };
  }
}

/** Approximate mouth location used as a UI readout (sources stay independent). */
export function occupantMouthPosition(hipPosition: Vec3): Vec3 {
  return {
    x: hipPosition.x,
    y: hipPosition.y - ADULT_CHEST_DEPTH_METERS * 0.25,
    z: hipPosition.z + ADULT_MOUTH_ABOVE_HIP_METERS,
  };
}

export function acousticInteriorObjects(config: {
  interiorObjects: readonly InteriorObject[];
  occupants: readonly OccupantConfig[];
  vehicle: VehicleGeometry;
}): InteriorObject[] {
  return [
    ...config.interiorObjects,
    ...occupantInteriorObjects(config.occupants, config.vehicle),
  ];
}

/**
 * Convert enabled occupants into AABB interior objects for the ISM extras.
 * Disabled occupants contribute nothing.
 */
export function occupantInteriorObjects(
  occupants: readonly OccupantConfig[],
  vehicle: VehicleGeometry,
): InteriorObject[] {
  const objects: InteriorObject[] = [];
  for (const occupant of occupants) {
    if (!occupant.enabled) continue;
    objects.push(...buildOccupantBoxes(occupant, vehicle));
  }
  return objects;
}

export function buildOccupantBoxes(
  occupant: OccupantConfig,
  vehicle: VehicleGeometry,
): InteriorObject[] {
  const hip = occupant.hipPosition;
  const material: AcousticMaterial = { ...occupant.material };
  const reclineLean =
    Math.tan(TYPICAL_SEAT_BACK_RECLINE_RADIANS) * ADULT_TORSO_HEIGHT_METERS;

  const thighs = clipBoxToCabin(
    {
      min: {
        x: hip.x - ADULT_HIP_BREADTH_SITTING_METERS / 2,
        y: hip.y - ADULT_THIGH_LENGTH_METERS,
        z: hip.z,
      },
      max: {
        x: hip.x + ADULT_HIP_BREADTH_SITTING_METERS / 2,
        y: hip.y + ADULT_CHEST_DEPTH_METERS * 0.2,
        z: hip.z + ADULT_THIGH_THICKNESS_METERS,
      },
    },
    vehicle,
  );

  const torso = clipBoxToCabin(
    {
      min: {
        x: hip.x - ADULT_SHOULDER_BREADTH_METERS / 2,
        y: hip.y - ADULT_CHEST_DEPTH_METERS * 0.35,
        z: hip.z + ADULT_THIGH_THICKNESS_METERS * 0.35,
      },
      max: {
        x: hip.x + ADULT_SHOULDER_BREADTH_METERS / 2,
        y: hip.y + ADULT_CHEST_DEPTH_METERS * 0.65 + reclineLean,
        z: hip.z + ADULT_TORSO_HEIGHT_METERS,
      },
    },
    vehicle,
  );

  const headZ0 = hip.z + ADULT_TORSO_HEIGHT_METERS + ADULT_NECK_HEIGHT_METERS * 0.35;
  const headYCenter = hip.y + ADULT_CHEST_DEPTH_METERS * 0.15 + reclineLean * 0.85;
  const head = clipBoxToCabin(
    {
      min: {
        x: hip.x - ADULT_HEAD_WIDTH_METERS / 2,
        y: headYCenter - ADULT_HEAD_DEPTH_METERS / 2,
        z: headZ0,
      },
      max: {
        x: hip.x + ADULT_HEAD_WIDTH_METERS / 2,
        y: headYCenter + ADULT_HEAD_DEPTH_METERS / 2,
        z: headZ0 + ADULT_HEAD_HEIGHT_METERS,
      },
    },
    vehicle,
  );

  const kneeY = hip.y - ADULT_THIGH_LENGTH_METERS;
  const shins = clipBoxToCabin(
    {
      min: {
        x: hip.x - ADULT_HIP_BREADTH_SITTING_METERS * 0.35,
        y: kneeY - ADULT_SHIN_DEPTH_METERS,
        z: ADULT_SHIN_CLEARANCE_ABOVE_FLOOR_METERS,
      },
      max: {
        x: hip.x + ADULT_HIP_BREADTH_SITTING_METERS * 0.35,
        y: kneeY + ADULT_SHIN_DEPTH_METERS * 0.6,
        z: hip.z + ADULT_THIGH_THICKNESS_METERS * 0.35,
      },
    },
    vehicle,
  );

  const boxes: Array<{ id: string; label: string; kind: InteriorObject['kind']; bounds: AxisAlignedBox | null }> = [
    { id: `${occupant.id}-thighs`, label: `${occupant.label} thighs`, kind: 'occupant-thighs', bounds: thighs },
    { id: `${occupant.id}-torso`, label: `${occupant.label} torso`, kind: 'occupant-torso', bounds: torso },
    { id: `${occupant.id}-head`, label: `${occupant.label} head`, kind: 'occupant-head', bounds: head },
    { id: `${occupant.id}-shins`, label: `${occupant.label} shins`, kind: 'occupant-shins', bounds: shins },
  ];

  return boxes
    .filter((part): part is typeof part & { bounds: AxisAlignedBox } => part.bounds !== null)
    .map((part) => ({
      id: part.id,
      label: part.label,
      kind: part.kind,
      bounds: part.bounds,
      material,
    }));
}

function clipBoxToCabin(box: AxisAlignedBox, vehicle: VehicleGeometry): AxisAlignedBox | null {
  const clipped: AxisAlignedBox = {
    min: {
      x: Math.max(box.min.x, 0),
      y: Math.max(box.min.y, 0),
      z: Math.max(box.min.z, 0),
    },
    max: {
      x: Math.min(box.max.x, vehicle.widthMeters),
      y: Math.min(box.max.y, vehicle.lengthMeters),
      z: Math.min(box.max.z, vehicle.heightMeters),
    },
  };
  if (
    clipped.max.x - clipped.min.x < 0.02 ||
    clipped.max.y - clipped.min.y < 0.02 ||
    clipped.max.z - clipped.min.z < 0.02
  ) {
    return null;
  }
  return clipped;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
