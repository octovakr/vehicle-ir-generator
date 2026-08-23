import type {
  AcousticEnvironment,
  ImageSourceContribution,
  InteriorObject,
  SurfaceMaterials,
  Vec3,
  VehicleGeometry,
} from './types';
import { speedOfSoundMetersPerSecond } from './environment';
import {
  MIN_PROPAGATION_DISTANCE_METERS,
  SPREADING_REFERENCE_DISTANCE_METERS,
} from './constants';
import { applyObjectAttenuation, firstOrderObjectReflections } from './interiorGeometry';

export type { ImageSourceContribution };

/**
 * Image Source Method (ISM) solver for an axis-aligned rectangular enclosure,
 * following Allen & Berkley (1979), "Image method for efficiently simulating
 * small-room acoustics", JASA 65(4).
 *
 * ── Physical model ───────────────────────────────────────────────────────────
 * The impulse response is the sum of delayed, attenuated impulses, one per
 * (visible) image source i:
 *
 *     h(t) = Σ_i a_i · δ(t − τ_i)
 *
 * For each axis the mirror images of the source position s are enumerated as
 *
 *     x_img = (−1)^p · s_x + 2 · n · W        p ∈ {0, 1},  n ∈ ℤ
 *
 * (analogously for y with L and z with H). For an image identified by
 * (p, n) on one axis, the number of reflections off the two walls of that
 * axis is (Allen & Berkley eq. 6):
 *
 *     wall at coordinate 0     → |n − p| reflections
 *     wall at coordinate W/L/H → |n|     reflections
 *
 * The total reflection order of an image is the sum over the three axes, and
 * images with total order > maxReflectionOrder are skipped.
 *
 * ── Delay ────────────────────────────────────────────────────────────────────
 *     d_i = ‖m − s_i_image‖   [m]     (Euclidean distance to the microphone)
 *     τ_i = d_i / c           [s]     (c from environment.ts)
 *
 * ── Amplitude ────────────────────────────────────────────────────────────────
 * Two physically modeled effects are combined:
 *
 * 1. Spherical spreading: pressure amplitude decays as 1/d, referenced to
 *    1 m (SPREADING_REFERENCE_DISTANCE_METERS):
 *
 *        a_spread = d_ref / max(d_i, d_min)
 *
 * 2. Surface reflection: each material stores an ENERGY absorption
 *    coefficient β (0…1). The corresponding pressure (amplitude) reflection
 *    coefficient is
 *
 *        r = sqrt(1 − β)
 *
 *    because reflected energy ∝ (pressure)², so energy reflectance
 *    R_E = 1 − β = r². Each wall hit multiplies the amplitude by that
 *    wall's r:
 *
 *        a_refl = Π_walls r_wall ^ (hits on that wall)
 *
 *    APPROXIMATION: r is real, angle-independent and frequency-independent
 *    (no phase inversion, no frequency-dependent absorption yet). Air
 *    absorption is not modeled.
 *
 *     a_i = a_spread · a_refl
 *
 * This module is pure math — no UI, rendering, or audio-playback imports.
 */

export interface ImageSourceSolverInput {
  geometry: VehicleGeometry;
  sourcePosition: Vec3;
  microphonePosition: Vec3;
  materials: SurfaceMaterials;
  environment: AcousticEnvironment;
  maxReflectionOrder: number;
  /**
   * Contributions arriving later than this are skipped (they would fall
   * outside the rendered IR buffer anyway). Seconds.
   */
  maxDelaySeconds: number;
  /**
   * Optional interior objects (seats, dashboard, …). When present, cabin
   * image-source paths are attenuated through object volumes and first-order
   * object-face reflections are added. See interiorGeometry.ts.
   */
  interiorObjects?: readonly InteriorObject[];
}

export interface ImageSourceSolverOutput {
  contributions: ImageSourceContribution[];
  speedOfSoundMetersPerSecond: number;
}

/**
 * Enumerate all image sources up to `maxReflectionOrder` and compute each
 * one's delay and amplitude at the microphone.
 */
export function solveImageSources(input: ImageSourceSolverInput): ImageSourceSolverOutput {
  const { geometry, sourcePosition, microphonePosition, materials, environment } = input;
  const maxOrder = input.maxReflectionOrder;
  const objects = input.interiorObjects ?? [];

  const c = speedOfSoundMetersPerSecond(environment);
  const maxDistanceMeters = input.maxDelaySeconds * c;

  const W = geometry.widthMeters;
  const L = geometry.lengthMeters;
  const H = geometry.heightMeters;

  // Pressure (amplitude) reflection coefficient per wall: r = sqrt(1 − β).
  const rLeft = Math.sqrt(1 - materials.left.absorptionCoefficient);
  const rRight = Math.sqrt(1 - materials.right.absorptionCoefficient);
  const rFront = Math.sqrt(1 - materials.front.absorptionCoefficient);
  const rRear = Math.sqrt(1 - materials.rear.absorptionCoefficient);
  const rFloor = Math.sqrt(1 - materials.floor.absorptionCoefficient);
  const rCeiling = Math.sqrt(1 - materials.ceiling.absorptionCoefficient);

  // Along one axis an image with indices (p, n) has |n − p| + |n| wall hits,
  // which is ≥ 2|n| − 1. Requiring the per-axis hits alone not to exceed
  // maxOrder bounds |n| ≤ (maxOrder + 1) / 2.
  const nMax = Math.ceil((maxOrder + 1) / 2);

  const contributions: ImageSourceContribution[] = [];

  // Per-axis candidate lists are precomputed to avoid recomputing invariant
  // quantities inside the innermost loop (rule 26).
  const xCandidates = axisImages(sourcePosition.x, W, nMax, maxOrder, rLeft, rRight);
  const yCandidates = axisImages(sourcePosition.y, L, nMax, maxOrder, rFront, rRear);
  const zCandidates = axisImages(sourcePosition.z, H, nMax, maxOrder, rFloor, rCeiling);

  const mx = microphonePosition.x;
  const my = microphonePosition.y;
  const mz = microphonePosition.z;

  for (const cx of xCandidates) {
    const orderX = cx.hits;
    if (orderX > maxOrder) continue;
    const dx = cx.coordinate - mx;
    const dx2 = dx * dx;

    for (const cy of yCandidates) {
      const orderXY = orderX + cy.hits;
      if (orderXY > maxOrder) continue;
      const dy = cy.coordinate - my;
      const dxy2 = dx2 + dy * dy;
      const amplitudeXY = cx.reflectionAmplitude * cy.reflectionAmplitude;

      for (const cz of zCandidates) {
        const totalOrder = orderXY + cz.hits;
        if (totalOrder > maxOrder) continue;

        const dz = cz.coordinate - mz;
        const distanceMeters = Math.sqrt(dxy2 + dz * dz);
        if (distanceMeters > maxDistanceMeters) continue;

        const clampedDistance = Math.max(distanceMeters, MIN_PROPAGATION_DISTANCE_METERS);
        const spreading = SPREADING_REFERENCE_DISTANCE_METERS / clampedDistance;
        const amplitude = spreading * amplitudeXY * cz.reflectionAmplitude;

        const imagePosition = { x: cx.coordinate, y: cy.coordinate, z: cz.coordinate };
        const raw: ImageSourceContribution = {
          propagationDelaySeconds: distanceMeters / c,
          propagationDistanceMeters: distanceMeters,
          amplitude,
          reflectionOrder: totalOrder,
        };
        contributions.push(
          objects.length > 0
            ? applyObjectAttenuation(
                raw,
                imagePosition,
                microphonePosition,
                geometry,
                objects,
              )
            : raw,
        );
      }
    }
  }

  if (objects.length > 0 && maxOrder >= 1) {
    contributions.push(
      ...firstOrderObjectReflections({
        sourcePosition,
        microphonePosition,
        objects,
        geometry,
        speedOfSoundMetersPerSecond: c,
        maxDelaySeconds: input.maxDelaySeconds,
      }),
    );
  }

  return { contributions, speedOfSoundMetersPerSecond: c };
}

interface AxisImage {
  /** Image coordinate along this axis, meters. */
  coordinate: number;
  /** Total wall hits contributed by this axis: |n − p| + |n|. */
  hits: number;
  /** Product of amplitude reflection coefficients for this axis's hits. */
  reflectionAmplitude: number;
}

/**
 * Enumerate mirror images along a single axis.
 *
 * @param sourceCoord   source coordinate on this axis, meters
 * @param extentMeters  room extent on this axis (W, L or H), meters
 * @param nMax          bound on |n|
 * @param maxOrder      global reflection-order cap (per-axis pre-filter)
 * @param rLow          amplitude reflection coefficient of the wall at 0
 * @param rHigh         amplitude reflection coefficient of the wall at extent
 */
function axisImages(
  sourceCoord: number,
  extentMeters: number,
  nMax: number,
  maxOrder: number,
  rLow: number,
  rHigh: number,
): AxisImage[] {
  const images: AxisImage[] = [];
  for (let n = -nMax; n <= nMax; n++) {
    for (const p of [0, 1] as const) {
      const hitsLow = Math.abs(n - p); // reflections off the wall at coordinate 0
      const hitsHigh = Math.abs(n); // reflections off the wall at coordinate `extent`
      const hits = hitsLow + hitsHigh;
      if (hits > maxOrder) continue;
      images.push({
        coordinate: (p === 0 ? sourceCoord : -sourceCoord) + 2 * n * extentMeters,
        hits,
        reflectionAmplitude: Math.pow(rLow, hitsLow) * Math.pow(rHigh, hitsHigh),
      });
    }
  }
  return images;
}
