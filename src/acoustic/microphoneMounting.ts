/**
 * Microphone mounting / rigid-body (boundary) model.
 *
 * ── What is modeled ─────────────────────────────────────────────────────────
 * A mounted microphone is no longer a free-field point receiver. Its capsule
 * sits a small standoff in front of a locally planar rigid body (mirror
 * housing, overhead console, dashboard top, A-pillar, door card, or wall
 * trim). The incident ISM field is the cabin Green's function at the real
 * capsule M. The mounting body contributes an extra first-order reflection
 * of every already-accepted image source across that local plane:
 *
 *     I_local = I − 2 ((I − p) · n) n
 *
 *     a_local = a_incident · (d_M / d_local) · r_baffle
 *
 * with r_baffle = sqrt(1 − β) the pressure reflection coefficient of the
 * mounting face (same energy→amplitude convention as imageSourceSolver.ts).
 *
 * The reflection point of I_local → M must lie on a finite disk of radius
 * `a` centered at the foot of the perpendicular from M onto the plane
 * (geometric finite-baffle visibility).
 *
 * Cabin image positions are in Allen–Berkley unfolded space. The mounting
 * plane is the real-cabin plane extended: an image on the back side of that
 * plane is treated as not illuminating the baffle (one-sided housing). This
 * is exact for the direct path and an APPROXIMATION for high-order images
 * (the plane is not mirrored into every adjacent cabin copy).
 *
 * Frequency dependence (APPROXIMATION): the extra arrivals are accumulated
 * into a separate buffer and passed through a first-order high-pass
 *
 *     H(s) = s / (s + ω_c)     ω_c = c / a     ⇒     f_c = c / (2π a)
 *
 * which is the ka / (1 + ka) roll-off of a rigid circular baffle (pressure
 * doubling only for ka ≳ 1; a small housing does not double bass). This is
 * NOT a spherical-harmonic Mie series, a BEM of the housing, or a measured
 * in-car obstacle effect.
 *
 * ── What is NOT modeled ─────────────────────────────────────────────────────
 *   - CAD housing / pillar mesh
 *   - microphone capsule directivity (cardioid, array, …)
 *   - diffraction around the disk edge (beyond the ka high-pass)
 *   - rigid-sphere scattering of the capsule body itself
 *   - flush-mount infinite-baffle Green's function as a replacement of ISM
 *
 * ── Double-counting vs cabin walls ──────────────────────────────────────────
 * Local mounting faces are inset from the six ISM walls (headliner, door
 * card, trim, A-pillar). Extra baffle images are therefore not the same
 * paths as Allen–Berkley wall images. Interior-object faces that coincide
 * with the mounting plane are skipped in firstOrderObjectReflections.
 *
 * `free` mounting applies none of the above: ideal point receiver.
 *
 * This module is pure math — no UI or renderer imports.
 */

import type {
  AcousticMaterial,
  ImageSourceContribution,
  InteriorObject,
  MicrophoneConfig,
  MicrophoneMounting,
  SurfaceMaterials,
  Vec3,
  VehicleGeometry,
} from './types';
import {
  A_PILLAR_BAFFLE_RADIUS_METERS,
  A_PILLAR_FROM_FRONT_FRACTION,
  A_PILLAR_MOUNT_INSET_METERS,
  CEILING_CONSOLE_BAFFLE_RADIUS_METERS,
  DASHBOARD_LOCAL_BAFFLE_RADIUS_METERS,
  DOOR_CARD_BAFFLE_RADIUS_METERS,
  HEADLINER_MOUNT_INSET_METERS,
  MICROPHONE_CAPSULE_STANDOFF_METERS,
  MIN_PROPAGATION_DISTANCE_METERS,
  REARVIEW_MIRROR_BAFFLE_RADIUS_METERS,
  REARVIEW_MIRROR_BELOW_CEILING_METERS,
  REARVIEW_MIRROR_FROM_FRONT_FRACTION,
  TYPICAL_DASHBOARD_HEIGHT_METERS,
  TYPICAL_DOOR_CARD_THICKNESS_METERS,
  WALL_TRIM_BAFFLE_RADIUS_METERS,
  WALL_TRIM_MOUNT_INSET_METERS,
} from './constants';
import { getMaterialPreset } from './materials';

const PLANE_EPSILON_METERS = 1e-6;

export const MICROPHONE_MOUNTING_OPTIONS: ReadonlyArray<{
  value: MicrophoneMounting;
  label: string;
}> = [
  { value: 'free', label: 'Free field (point receiver)' },
  { value: 'rearview-mirror', label: 'Rear-view mirror' },
  { value: 'ceiling', label: 'Ceiling / overhead console' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'a-pillar', label: 'A-pillar' },
  { value: 'door', label: 'Door' },
  { value: 'wall', label: 'Wall' },
];

export function microphoneMountingLabel(mounting: MicrophoneMounting): string {
  return MICROPHONE_MOUNTING_OPTIONS.find((option) => option.value === mounting)?.label ?? mounting;
}

/**
 * Resolved local rigid baffle. `null` means the microphone is a free-field
 * point receiver and the solver must not add extra images.
 */
export interface MicrophoneBaffle {
  mounting: MicrophoneMounting;
  /** A point on the mounting plane, meters. */
  planePoint: Vec3;
  /** Unit normal pointing from the mounting face into the cabin. */
  planeNormal: Vec3;
  /** Disk center (projection of the capsule onto the plane), meters. */
  diskCenter: Vec3;
  /** Characteristic radius `a`, meters. */
  radiusMeters: number;
  /** Energy absorption coefficient β of the mounting face. */
  absorptionCoefficient: number;
  /** Signed capsule distance from the plane, meters (positive = along the normal). */
  standoffMeters: number;
}

export interface MicrophoneMountingContext {
  vehicle: VehicleGeometry;
  materials: SurfaceMaterials;
  interiorObjects: readonly InteriorObject[];
}

export function defaultMicrophoneOrientation(
  mounting: MicrophoneMounting,
  vehicle: VehicleGeometry,
  position: Vec3,
): Vec3 {
  const side: CabinSide = position.x < 0.5 * vehicle.widthMeters ? 'left' : 'right';
  switch (mounting) {
    case 'free':
      return { x: 0, y: 0, z: 1 };
    case 'rearview-mirror':
      return { x: 0, y: 1, z: 0 };
    case 'ceiling':
      return { x: 0, y: 0, z: -1 };
    case 'dashboard':
      return normalize({ x: 0, y: 1, z: 0.25 });
    case 'a-pillar':
      return side === 'left' ? normalize({ x: 1, y: 0.45, z: 0 }) : normalize({ x: -1, y: 0.45, z: 0 });
    case 'door':
      return side === 'left' ? { x: 1, y: 0, z: 0 } : { x: -1, y: 0, z: 0 };
    case 'wall': {
      const wall = nearestCabinWall(position, vehicle);
      return wallNormal(wall);
    }
  }
}

export function defaultMicrophonePositionForMounting(
  mounting: MicrophoneMounting,
  vehicle: VehicleGeometry,
  interiorObjects: readonly InteriorObject[] = [],
  previousPosition?: Vec3,
): Vec3 {
  const { widthMeters: W, lengthMeters: L, heightMeters: H } = vehicle;
  const side: CabinSide =
    previousPosition && previousPosition.x >= 0.5 * W ? 'right' : 'left';
  const standoff = MICROPHONE_CAPSULE_STANDOFF_METERS;

  switch (mounting) {
    case 'free':
      return previousPosition
        ? { ...previousPosition }
        : { x: 0.5 * W, y: 0.35 * L, z: 0.7 * H };
    case 'rearview-mirror':
      return {
        x: 0.5 * W,
        y: REARVIEW_MIRROR_FROM_FRONT_FRACTION * L + standoff,
        z: H - REARVIEW_MIRROR_BELOW_CEILING_METERS,
      };
    case 'ceiling':
      return {
        x: 0.5 * W,
        y: 0.32 * L,
        z: H - HEADLINER_MOUNT_INSET_METERS - standoff,
      };
    case 'dashboard': {
      const dash = dashboardObject(interiorObjects);
      if (dash) {
        return {
          x: 0.5 * (dash.bounds.min.x + dash.bounds.max.x),
          y: dash.bounds.max.y - 0.04,
          z: dash.bounds.max.z + standoff,
        };
      }
      return {
        x: 0.5 * W,
        y: Math.min(0.22 * L, L * 0.2),
        z: Math.min(TYPICAL_DASHBOARD_HEIGHT_METERS, H - 0.08) + standoff,
      };
    }
    case 'a-pillar': {
      const inset = A_PILLAR_MOUNT_INSET_METERS + standoff;
      return {
        x: side === 'left' ? inset : W - inset,
        y: A_PILLAR_FROM_FRONT_FRACTION * L,
        z: 0.68 * H,
      };
    }
    case 'door': {
      const inset = TYPICAL_DOOR_CARD_THICKNESS_METERS + standoff;
      return {
        x: side === 'left' ? inset : W - inset,
        y: 0.38 * L,
        z: 0.72 * H,
      };
    }
    case 'wall': {
      const wall = previousPosition ? nearestCabinWall(previousPosition, vehicle) : 'left';
      return positionOnWall(wall, vehicle, standoff);
    }
  }
}

/**
 * Apply a mounting choice: updates mounting, snaps the capsule to the
 * documented preset for that surface, and resets look direction.
 */
export function applyMicrophoneMounting(
  microphone: MicrophoneConfig,
  mounting: MicrophoneMounting,
  vehicle: VehicleGeometry,
  interiorObjects: readonly InteriorObject[] = [],
): MicrophoneConfig {
  const position = defaultMicrophonePositionForMounting(
    mounting,
    vehicle,
    interiorObjects,
    microphone.position,
  );
  return {
    ...microphone,
    mounting,
    position,
    orientation: defaultMicrophoneOrientation(mounting, vehicle, position),
  };
}

export function resolveMicrophoneBaffle(
  microphone: MicrophoneConfig,
  context: MicrophoneMountingContext,
): MicrophoneBaffle | null {
  if (microphone.mounting === 'free') return null;

  const spec = mountingSurfaceSpec(microphone, context);
  const planeNormal = spec.planeNormal;
  if (vectorLength(planeNormal) < 1e-9) return null;

  const standoffMeters = dot(sub(microphone.position, spec.planePoint), planeNormal);
  const diskCenter = sub(microphone.position, scale(planeNormal, standoffMeters));

  return {
    mounting: microphone.mounting,
    planePoint: spec.planePoint,
    planeNormal,
    diskCenter,
    radiusMeters: spec.radiusMeters,
    absorptionCoefficient: spec.absorptionCoefficient,
    standoffMeters,
  };
}

export function baffleCutoffHz(radiusMeters: number, speedOfSoundMetersPerSecond: number): number {
  const radius = Math.max(radiusMeters, MIN_PROPAGATION_DISTANCE_METERS);
  return speedOfSoundMetersPerSecond / (2 * Math.PI * radius);
}

/**
 * Extra image-source arrivals from the local rigid baffle.
 *
 * Applied to every incident image already in the cabin field, including the
 * direct path. The local bounce does not consume the cabin reflection-order
 * budget: it is a receiver-body effect, not an extra cabin-wall hit.
 */
export function localBaffleContributions(
  incident: readonly ImageSourceContribution[],
  baffle: MicrophoneBaffle,
  microphonePosition: Vec3,
  speedOfSoundMetersPerSecond: number,
  maxDelaySeconds: number,
): ImageSourceContribution[] {
  const rBaffle = Math.sqrt(1 - clamp01(baffle.absorptionCoefficient));
  if (rBaffle <= 0) return [];

  const maxDistance = maxDelaySeconds * speedOfSoundMetersPerSecond;
  const extra: ImageSourceContribution[] = [];

  for (const arrival of incident) {
    const image = arrival.imagePosition;
    const sideImage = dot(sub(image, baffle.planePoint), baffle.planeNormal);
    const sideMic = dot(sub(microphonePosition, baffle.planePoint), baffle.planeNormal);
    if (sideImage <= PLANE_EPSILON_METERS || sideMic <= PLANE_EPSILON_METERS) continue;

    const imageLocal = reflectPointAcrossPlane(image, baffle.planePoint, baffle.planeNormal);
    const hit = planeSegmentIntersection(imageLocal, microphonePosition, baffle.planePoint, baffle.planeNormal);
    if (!hit) continue;
    if (distance(hit, baffle.diskCenter) > baffle.radiusMeters) continue;

    const distanceMeters = distance(microphonePosition, imageLocal);
    if (distanceMeters > maxDistance) continue;

    const incidentDistance = Math.max(arrival.propagationDistanceMeters, MIN_PROPAGATION_DISTANCE_METERS);
    const localDistance = Math.max(distanceMeters, MIN_PROPAGATION_DISTANCE_METERS);
    extra.push({
      propagationDelaySeconds: distanceMeters / speedOfSoundMetersPerSecond,
      propagationDistanceMeters: distanceMeters,
      amplitude: arrival.amplitude * (incidentDistance / localDistance) * rBaffle,
      reflectionOrder: arrival.reflectionOrder + 1,
      imagePosition: imageLocal,
    });
  }

  return extra;
}

/**
 * True when an interior-object face is the same plane as the microphone
 * baffle, so first-order object images of that face would double-count the
 * local bounce of the real source.
 */
export function objectFaceMatchesBaffle(
  facePoint: Vec3,
  faceNormal: Vec3,
  baffle: MicrophoneBaffle,
): boolean {
  const nFace = normalize(faceNormal);
  const aligned = Math.abs(dot(nFace, baffle.planeNormal));
  if (aligned < 0.85) return false;
  // Compare along the face's own normal so a slightly tilted look direction
  // still matches the AABB face it sits on.
  return Math.abs(dot(sub(facePoint, baffle.planePoint), nFace)) < 0.05;
}

export function reflectPointAcrossPlane(point: Vec3, planePoint: Vec3, planeNormal: Vec3): Vec3 {
  const n = normalize(planeNormal);
  return sub(point, scale(n, 2 * dot(sub(point, planePoint), n)));
}

/**
 * First-order high-pass implementing H(s) = s / (s + ω_c) via the bilinear
 * (one-pole) difference equation. In-place. DC gain is 0, Nyquist gain → 1.
 */
export function firstOrderHighpassInPlace(
  samples: Float32Array,
  sampleRateHz: number,
  cutoffHz: number,
): void {
  if (samples.length === 0) return;
  const nyquist = 0.45 * sampleRateHz;
  const fc = Math.min(Math.max(cutoffHz, 0), nyquist);
  if (fc <= 0) {
    samples.fill(0);
    return;
  }
  const dt = 1 / sampleRateHz;
  const rc = 1 / (2 * Math.PI * fc);
  const alpha = rc / (rc + dt);
  let previousX = 0;
  let previousY = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = alpha * (previousY + x - previousX);
    samples[i] = y;
    previousX = x;
    previousY = y;
  }
}

export function addInPlace(target: Float32Array, source: Float32Array): void {
  const n = Math.min(target.length, source.length);
  for (let i = 0; i < n; i++) target[i] += source[i];
}

type CabinSide = 'left' | 'right';
type CabinWall = 'left' | 'right' | 'front' | 'rear';

interface MountingSurfaceSpec {
  planePoint: Vec3;
  /** Unit normal of the mounting face, pointing into the cabin. Independent of capsule look direction. */
  planeNormal: Vec3;
  radiusMeters: number;
  absorptionCoefficient: number;
}

function mountingSurfaceSpec(
  microphone: MicrophoneConfig,
  context: MicrophoneMountingContext,
): MountingSurfaceSpec {
  const { vehicle, materials, interiorObjects } = context;
  const { widthMeters: W, lengthMeters: L, heightMeters: H } = vehicle;
  const position = microphone.position;
  const side: CabinSide = position.x < 0.5 * W ? 'left' : 'right';
  const plastic = materialBeta(getMaterialPreset('plastic'));

  switch (microphone.mounting) {
    case 'free':
      throw new Error('mountingSurfaceSpec is not defined for free-field microphones');
    case 'rearview-mirror':
      return {
        planePoint: {
          x: 0.5 * W,
          y: REARVIEW_MIRROR_FROM_FRONT_FRACTION * L,
          z: H - REARVIEW_MIRROR_BELOW_CEILING_METERS,
        },
        planeNormal: { x: 0, y: 1, z: 0 },
        radiusMeters: REARVIEW_MIRROR_BAFFLE_RADIUS_METERS,
        absorptionCoefficient: plastic,
      };
    case 'ceiling':
      return {
        planePoint: { x: position.x, y: position.y, z: H - HEADLINER_MOUNT_INSET_METERS },
        planeNormal: { x: 0, y: 0, z: -1 },
        radiusMeters: CEILING_CONSOLE_BAFFLE_RADIUS_METERS,
        absorptionCoefficient: clamp01(materials.ceiling.absorptionCoefficient),
      };
    case 'dashboard': {
      const dash = dashboardObject(interiorObjects);
      if (dash) {
        return {
          planePoint: {
            x: 0.5 * (dash.bounds.min.x + dash.bounds.max.x),
            y: 0.5 * (dash.bounds.min.y + dash.bounds.max.y),
            z: dash.bounds.max.z,
          },
          planeNormal: { x: 0, y: 0, z: 1 },
          radiusMeters: DASHBOARD_LOCAL_BAFFLE_RADIUS_METERS,
          absorptionCoefficient: clamp01(dash.material.absorptionCoefficient),
        };
      }
      return {
        planePoint: {
          x: 0.5 * W,
          y: Math.min(0.22 * L, L * 0.2),
          z: Math.min(TYPICAL_DASHBOARD_HEIGHT_METERS, H - 0.08),
        },
        planeNormal: { x: 0, y: 0, z: 1 },
        radiusMeters: DASHBOARD_LOCAL_BAFFLE_RADIUS_METERS,
        absorptionCoefficient: plastic,
      };
    }
    case 'a-pillar': {
      const inset = A_PILLAR_MOUNT_INSET_METERS;
      return {
        planePoint: {
          x: side === 'left' ? inset : W - inset,
          y: A_PILLAR_FROM_FRONT_FRACTION * L,
          z: position.z,
        },
        planeNormal: side === 'left' ? { x: 1, y: 0, z: 0 } : { x: -1, y: 0, z: 0 },
        radiusMeters: A_PILLAR_BAFFLE_RADIUS_METERS,
        absorptionCoefficient: clamp01(
          side === 'left' ? materials.left.absorptionCoefficient : materials.right.absorptionCoefficient,
        ),
      };
    }
    case 'door': {
      const inset = TYPICAL_DOOR_CARD_THICKNESS_METERS;
      return {
        planePoint: {
          x: side === 'left' ? inset : W - inset,
          y: position.y,
          z: position.z,
        },
        planeNormal: side === 'left' ? { x: 1, y: 0, z: 0 } : { x: -1, y: 0, z: 0 },
        radiusMeters: DOOR_CARD_BAFFLE_RADIUS_METERS,
        absorptionCoefficient: clamp01(
          side === 'left' ? materials.left.absorptionCoefficient : materials.right.absorptionCoefficient,
        ),
      };
    }
    case 'wall': {
      const wall = nearestCabinWall(position, vehicle);
      const inset = WALL_TRIM_MOUNT_INSET_METERS;
      return {
        planePoint: wallPlanePoint(wall, vehicle, inset, position),
        planeNormal: wallNormal(wall),
        radiusMeters: WALL_TRIM_BAFFLE_RADIUS_METERS,
        absorptionCoefficient: clamp01(materials[wall].absorptionCoefficient),
      };
    }
  }
}

function dashboardObject(objects: readonly InteriorObject[]): InteriorObject | undefined {
  return objects.find((object) => object.kind === 'dashboard' || object.id === 'dashboard');
}

function nearestCabinWall(position: Vec3, vehicle: VehicleGeometry): CabinWall {
  const distances: Array<[CabinWall, number]> = [
    ['left', position.x],
    ['right', vehicle.widthMeters - position.x],
    ['front', position.y],
    ['rear', vehicle.lengthMeters - position.y],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][0];
}

function wallNormal(wall: CabinWall): Vec3 {
  switch (wall) {
    case 'left':
      return { x: 1, y: 0, z: 0 };
    case 'right':
      return { x: -1, y: 0, z: 0 };
    case 'front':
      return { x: 0, y: 1, z: 0 };
    case 'rear':
      return { x: 0, y: -1, z: 0 };
  }
}

function wallPlanePoint(wall: CabinWall, vehicle: VehicleGeometry, inset: number, position: Vec3): Vec3 {
  switch (wall) {
    case 'left':
      return { x: inset, y: position.y, z: position.z };
    case 'right':
      return { x: vehicle.widthMeters - inset, y: position.y, z: position.z };
    case 'front':
      return { x: position.x, y: inset, z: position.z };
    case 'rear':
      return { x: position.x, y: vehicle.lengthMeters - inset, z: position.z };
  }
}

function positionOnWall(wall: CabinWall, vehicle: VehicleGeometry, standoff: number): Vec3 {
  const { widthMeters: W, lengthMeters: L, heightMeters: H } = vehicle;
  const inset = WALL_TRIM_MOUNT_INSET_METERS + standoff;
  const z = 0.7 * H;
  switch (wall) {
    case 'left':
      return { x: inset, y: 0.4 * L, z };
    case 'right':
      return { x: W - inset, y: 0.4 * L, z };
    case 'front':
      return { x: 0.5 * W, y: inset, z };
    case 'rear':
      return { x: 0.5 * W, y: L - inset, z };
  }
}

function planeSegmentIntersection(
  start: Vec3,
  end: Vec3,
  planePoint: Vec3,
  planeNormal: Vec3,
): Vec3 | null {
  const delta = sub(end, start);
  const denom = dot(delta, planeNormal);
  if (Math.abs(denom) < PLANE_EPSILON_METERS) return null;
  const t = dot(sub(planePoint, start), planeNormal) / denom;
  if (t <= 0 || t >= 1) return null;
  return add(start, scale(delta, t));
}

function materialBeta(material: AcousticMaterial | undefined): number {
  return clamp01(material?.absorptionCoefficient ?? 0.08);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function vectorLength(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function normalize(v: Vec3): Vec3 {
  const length = vectorLength(v);
  if (length < 1e-12) return { x: 0, y: 0, z: 0 };
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}