/**
 * Interior-object acoustics used on top of the rectangular-cabin ISM.
 *
 * Two documented approximations, applied only when interior objects exist:
 *
 * 1. Path attenuation through object volumes
 *    Each cabin-wall image source is a straight line from the image position
 *    to the microphone in the unfolded (Allen–Berkley) space. That line is
 *    folded back into the real cabin and the length ℓ spent inside each
 *    object AABB is accumulated. The contribution amplitude is then
 *
 *        a *= exp(−α_eff · ℓ_total)
 *
 *    with α_eff = INTERIOR_OBJECT_ATTENUATION_PER_METER · (0.4 + 0.6 · β).
 *
 *    This is NOT a measured seat insertion-loss and does not model
 *    diffraction around the object.
 *
 * 2. First-order reflections from exposed object faces
 *    Each AABB face is treated as a finite rectangular reflector. The
 *    image of the source across that plane is kept only when the reflection
 *    point lies on the finite face and both endpoints are on the reflecting
 *    side. Amplitude is (d_ref / d) · sqrt(1 − β). Higher-order object
 *    reflections and object–wall mixed images are not generated.
 *
 * This module is pure math — no UI or renderer imports.
 */

import type {
  AxisAlignedBox,
  ImageSourceContribution,
  InteriorObject,
  Vec3,
  VehicleGeometry,
} from './types';
import {
  INTERIOR_OBJECT_ATTENUATION_PER_METER,
  MIN_PROPAGATION_DISTANCE_METERS,
  SPREADING_REFERENCE_DISTANCE_METERS,
} from './constants';

const BOUNDARY_EPSILON_METERS = 1e-6;
const FACE_INSET_METERS = 1e-4;

export interface PathSegment {
  start: Vec3;
  end: Vec3;
}

export function attenuationPerMeter(absorptionCoefficient: number): number {
  const beta = Math.min(1, Math.max(0, absorptionCoefficient));
  return INTERIOR_OBJECT_ATTENUATION_PER_METER * (0.4 + 0.6 * beta);
}

/** Fold an unfolded-axis coordinate back into [0, extent]. */
export function foldCoordinate(unfolded: number, extentMeters: number): number {
  if (extentMeters <= 0) return 0;
  const cell = Math.floor(unfolded / extentMeters);
  const local = unfolded - cell * extentMeters;
  return (cell & 1) === 0 ? local : extentMeters - local;
}

function foldPoint(point: Vec3, geometry: VehicleGeometry): Vec3 {
  return {
    x: foldCoordinate(point.x, geometry.widthMeters),
    y: foldCoordinate(point.y, geometry.lengthMeters),
    z: foldCoordinate(point.z, geometry.heightMeters),
  };
}

function cellIndex(unfolded: number, extentMeters: number): number {
  return Math.floor(unfolded / extentMeters + BOUNDARY_EPSILON_METERS);
}

/**
 * Split the unfolded image→microphone line at every cabin-cell boundary
 * and fold each piece into the real room. The result is the physical path
 * that the corresponding image source represents.
 */
export function foldedPathSegments(
  imagePosition: Vec3,
  microphonePosition: Vec3,
  geometry: VehicleGeometry,
): PathSegment[] {
  const extents: Array<[keyof Vec3, number]> = [
    ['x', geometry.widthMeters],
    ['y', geometry.lengthMeters],
    ['z', geometry.heightMeters],
  ];

  const splits = new Set<number>([0, 1]);
  for (const [axis, extent] of extents) {
    const start = imagePosition[axis];
    const delta = microphonePosition[axis] - start;
    if (Math.abs(delta) < BOUNDARY_EPSILON_METERS) continue;
    const startCell = cellIndex(start, extent);
    const endCell = cellIndex(microphonePosition[axis], extent);
    const step = endCell >= startCell ? 1 : -1;
    for (let cell = startCell; cell !== endCell; cell += step) {
      const boundary = (step > 0 ? cell + 1 : cell) * extent;
      const t = (boundary - start) / delta;
      if (t > 0 && t < 1) splits.add(t);
    }
  }

  const times = [...splits].sort((a, b) => a - b);
  const segments: PathSegment[] = [];
  for (let i = 0; i < times.length - 1; i++) {
    const t0 = times[i];
    const t1 = times[i + 1];
    if (t1 - t0 < 1e-9) continue;
    segments.push({
      start: foldPoint(lerpPoint(imagePosition, microphonePosition, t0), geometry),
      end: foldPoint(lerpPoint(imagePosition, microphonePosition, t1), geometry),
    });
  }
  return segments;
}

function lerpPoint(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
    z: a.z + t * (b.z - a.z),
  };
}

/**
 * Length of the segment that lies inside an AABB (slab test).
 * Returns 0 when the segment misses the box.
 */
export function segmentLengthInsideBox(start: Vec3, end: Vec3, box: AxisAlignedBox): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < BOUNDARY_EPSILON_METERS) {
    return pointInsideBox(start, box) ? 0 : 0;
  }

  let tMin = 0;
  let tMax = 1;
  const clip = (origin: number, direction: number, min: number, max: number): boolean => {
    if (Math.abs(direction) < BOUNDARY_EPSILON_METERS) {
      return origin >= min && origin <= max;
    }
    const t1 = (min - origin) / direction;
    const t2 = (max - origin) / direction;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    return tMin <= tMax;
  };

  if (!clip(start.x, dx, box.min.x, box.max.x)) return 0;
  if (!clip(start.y, dy, box.min.y, box.max.y)) return 0;
  if (!clip(start.z, dz, box.min.z, box.max.z)) return 0;
  return (tMax - tMin) * length;
}

export function pointInsideBox(point: Vec3, box: AxisAlignedBox): boolean {
  return (
    point.x >= box.min.x &&
    point.x <= box.max.x &&
    point.y >= box.min.y &&
    point.y <= box.max.y &&
    point.z >= box.min.z &&
    point.z <= box.max.z
  );
}

export function pathLengthInsideObjects(
  segments: readonly PathSegment[],
  objects: readonly InteriorObject[],
): number {
  let total = 0;
  for (const segment of segments) {
    for (const object of objects) {
      total += segmentLengthInsideBox(segment.start, segment.end, object.bounds);
    }
  }
  return total;
}

/**
 * Mean β-weighted attenuation along a folded path. When the path intersects
 * several objects, each object's own α(β) is applied to the length spent
 * inside that object.
 */
export function pathAmplitudeTransmission(
  segments: readonly PathSegment[],
  objects: readonly InteriorObject[],
): number {
  if (objects.length === 0) return 1;
  let logGain = 0;
  for (const segment of segments) {
    for (const object of objects) {
      const lengthInside = segmentLengthInsideBox(segment.start, segment.end, object.bounds);
      if (lengthInside <= 0) continue;
      logGain -= attenuationPerMeter(object.material.absorptionCoefficient) * lengthInside;
    }
  }
  return Math.exp(logGain);
}

export function applyObjectAttenuation(
  contribution: ImageSourceContribution,
  imagePosition: Vec3,
  microphonePosition: Vec3,
  geometry: VehicleGeometry,
  objects: readonly InteriorObject[],
): ImageSourceContribution {
  if (objects.length === 0) return contribution;
  const segments = foldedPathSegments(imagePosition, microphonePosition, geometry);
  const transmission = pathAmplitudeTransmission(segments, objects);
  return {
    ...contribution,
    amplitude: contribution.amplitude * transmission,
  };
}

interface ObjectFace {
  axis: 'x' | 'y' | 'z';
  coordinate: number;
  /** The reflecting side is the half-space with this sign relative to the plane. */
  outwardSign: 1 | -1;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  uAxis: 'x' | 'y' | 'z';
  vAxis: 'x' | 'y' | 'z';
}

function objectFaces(box: AxisAlignedBox): ObjectFace[] {
  return [
    {
      axis: 'x',
      coordinate: box.min.x,
      outwardSign: -1,
      uMin: box.min.y,
      uMax: box.max.y,
      vMin: box.min.z,
      vMax: box.max.z,
      uAxis: 'y',
      vAxis: 'z',
    },
    {
      axis: 'x',
      coordinate: box.max.x,
      outwardSign: 1,
      uMin: box.min.y,
      uMax: box.max.y,
      vMin: box.min.z,
      vMax: box.max.z,
      uAxis: 'y',
      vAxis: 'z',
    },
    {
      axis: 'y',
      coordinate: box.min.y,
      outwardSign: -1,
      uMin: box.min.x,
      uMax: box.max.x,
      vMin: box.min.z,
      vMax: box.max.z,
      uAxis: 'x',
      vAxis: 'z',
    },
    {
      axis: 'y',
      coordinate: box.max.y,
      outwardSign: 1,
      uMin: box.min.x,
      uMax: box.max.x,
      vMin: box.min.z,
      vMax: box.max.z,
      uAxis: 'x',
      vAxis: 'z',
    },
    {
      axis: 'z',
      coordinate: box.min.z,
      outwardSign: -1,
      uMin: box.min.x,
      uMax: box.max.x,
      vMin: box.min.y,
      vMax: box.max.y,
      uAxis: 'x',
      vAxis: 'y',
    },
    {
      axis: 'z',
      coordinate: box.max.z,
      outwardSign: 1,
      uMin: box.min.x,
      uMax: box.max.x,
      vMin: box.min.y,
      vMax: box.max.y,
      uAxis: 'x',
      vAxis: 'y',
    },
  ];
}

function isAgainstCabinWall(face: ObjectFace, geometry: VehicleGeometry): boolean {
  const extent =
    face.axis === 'x'
      ? geometry.widthMeters
      : face.axis === 'y'
        ? geometry.lengthMeters
        : geometry.heightMeters;
  if (face.outwardSign < 0 && face.coordinate <= FACE_INSET_METERS) return true;
  if (face.outwardSign > 0 && face.coordinate >= extent - FACE_INSET_METERS) return true;
  return false;
}

/**
 * First-order image sources from interior-object faces.
 *
 * Only generated when maxReflectionOrder ≥ 1. The reflection order of each
 * contribution is 1 (a single object-face hit). Mixed wall+object images
 * are not enumerated — that would require a full beam-tracing solver.
 */
export function firstOrderObjectReflections(input: {
  sourcePosition: Vec3;
  microphonePosition: Vec3;
  objects: readonly InteriorObject[];
  geometry: VehicleGeometry;
  speedOfSoundMetersPerSecond: number;
  maxDelaySeconds: number;
}): ImageSourceContribution[] {
  const { sourcePosition, microphonePosition, objects, geometry } = input;
  const maxDistance = input.maxDelaySeconds * input.speedOfSoundMetersPerSecond;
  const contributions: ImageSourceContribution[] = [];

  for (const object of objects) {
    const reflectionAmplitude = Math.sqrt(1 - object.material.absorptionCoefficient);
    if (reflectionAmplitude <= 0) continue;

    for (const face of objectFaces(object.bounds)) {
      if (isAgainstCabinWall(face, geometry)) continue;

      const sourceOffset = (sourcePosition[face.axis] - face.coordinate) * face.outwardSign;
      const micOffset = (microphonePosition[face.axis] - face.coordinate) * face.outwardSign;
      if (sourceOffset <= FACE_INSET_METERS || micOffset <= FACE_INSET_METERS) continue;

      const image: Vec3 = { ...sourcePosition };
      image[face.axis] = 2 * face.coordinate - sourcePosition[face.axis];

      const delta = microphonePosition[face.axis] - image[face.axis];
      if (Math.abs(delta) < BOUNDARY_EPSILON_METERS) continue;
      const t = (face.coordinate - image[face.axis]) / delta;
      if (t <= 0 || t >= 1) continue;

      const hit = lerpPoint(image, microphonePosition, t);
      const u = hit[face.uAxis];
      const v = hit[face.vAxis];
      if (u < face.uMin || u > face.uMax || v < face.vMin || v > face.vMax) continue;

      const distanceMeters = Math.hypot(
        microphonePosition.x - image.x,
        microphonePosition.y - image.y,
        microphonePosition.z - image.z,
      );
      if (distanceMeters > maxDistance) continue;

      const clamped = Math.max(distanceMeters, MIN_PROPAGATION_DISTANCE_METERS);
      const spreading = SPREADING_REFERENCE_DISTANCE_METERS / clamped;

      // Attenuate if the source→hit or hit→mic legs pass through *other* objects.
      const others = objects.filter((candidate) => candidate.id !== object.id);
      const toHit = pathAmplitudeTransmission([{ start: sourcePosition, end: hit }], others);
      const toMic = pathAmplitudeTransmission([{ start: hit, end: microphonePosition }], others);

      contributions.push({
        propagationDelaySeconds: distanceMeters / input.speedOfSoundMetersPerSecond,
        propagationDistanceMeters: distanceMeters,
        amplitude: spreading * reflectionAmplitude * toHit * toMic,
        reflectionOrder: 1,
      });
    }
  }

  return contributions;
}
