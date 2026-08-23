/**
 * 3D meshes for the scene viewport. Visualization only — no acoustic math.
 *
 * Rectangular mode: translucent cabin box (original MVP).
 * Named vehicles: a *hollow* stylized body (panels outside the cabin AABB)
 * plus interior objects (seats, dashboard, console) from the catalog.
 * Occupants are schematic seated mannequins (visualization only).
 * The cabin air volume is not filled with body geometry — that would
 * contradict the acoustic model, which treats only catalog objects and
 * occupant AABBs as solid.
 *
 * APPROXIMATION: this is a dimension-driven schematic, not a CAD scan.
 * Proportions follow the spec sheet; panel curvature and styling details
 * are researched visual cues (IONIQ 5 pixel-light bar / boxy hatch,
 * Tucson grille / roof rails).
 */

import * as THREE from 'three';
import type { InteriorObject, OccupantConfig, SimulationConfig, Vec3 } from '../acoustic/types';
import type { VehicleExteriorSpec, VehicleProfile } from '../acoustic/vehicleModels';
import { getVehicleProfile } from '../acoustic/vehicleModels';
import {
  ADULT_CHEST_DEPTH_METERS,
  ADULT_HEAD_DEPTH_METERS,
  ADULT_HEAD_HEIGHT_METERS,
  ADULT_HEAD_WIDTH_METERS,
  ADULT_HIP_BREADTH_SITTING_METERS,
  ADULT_NECK_HEIGHT_METERS,
  ADULT_SHIN_CLEARANCE_ABOVE_FLOOR_METERS,
  ADULT_SHOULDER_BREADTH_METERS,
  ADULT_THIGH_LENGTH_METERS,
  ADULT_THIGH_THICKNESS_METERS,
  ADULT_TORSO_HEIGHT_METERS,
  TYPICAL_FRONT_BACKREST_THICKNESS_METERS,
  TYPICAL_SEAT_BACK_RECLINE_RADIANS,
} from '../acoustic/constants';

const ROOM_EDGE_COLOR = 0x4a4f58;
const ROOM_FACE_COLOR = 0x1b1e23;
const FLOOR_GRID_COLOR = 0x2a2e35;
const SOURCE_COLOR = 0xe0964f;
const MIC_COLOR = 0x58a6ff;

const IONIQ_BODY = 0x2c333c;
const IONIQ_ACCENT = 0x8b939c;
const TUCSON_BODY = 0x2f3338;
const TUCSON_ACCENT = 0x9aa0a6;
const GLASS_COLOR = 0x6a8498;
const TIRE_COLOR = 0x141618;
const WHEEL_COLOR = 0x6d737b;
const DASH_COLOR = 0x1c1f24;
const CONSOLE_COLOR = 0x22262c;
const LEATHER_SEAT = 0x4a3f38;
const FABRIC_SEAT = 0x3a424a;
const HEADREST_COLOR = 0x353028;
const HEADLINER_COLOR = 0x3a3d42;
const INNER_TRIM_COLOR = 0x2a2d32;
const OCCUPANT_SKIN = 0xb89a7c;
const OCCUPANT_SHIRT = 0x3e4650;
const OCCUPANT_PANTS = 0x2b3036;
const OCCUPANT_HAIR = 0x2a2622;

export function simToThree(position: Vec3, cabin: { widthMeters: number; lengthMeters: number }): THREE.Vector3 {
  return new THREE.Vector3(
    position.x - cabin.widthMeters / 2,
    position.z,
    position.y - cabin.lengthMeters / 2,
  );
}

export function buildSceneContent(config: SimulationConfig): THREE.Group {
  const group = new THREE.Group();
  const profile = getVehicleProfile(config.vehicleModelId);
  const cabin = config.vehicle;

  if (config.vehicleModelId === 'rectangular' || !profile.exterior) {
    group.add(buildRectangularCabin(cabin.widthMeters, cabin.lengthMeters, cabin.heightMeters));
  } else {
    group.add(buildNamedVehicle(config, profile));
  }

  group.add(buildOccupantMeshes(config.occupants, cabin));

  for (const source of config.sources) {
    group.add(buildSourceMarker(source.position, source.label, source.enabled, cabin));
  }
  for (const microphone of config.microphones) {
    group.add(buildMicrophoneMarker(microphone.position, microphone.label, microphone.enabled, cabin));
  }
  return group;
}

function buildRectangularCabin(W: number, L: number, H: number): THREE.Group {
  const group = new THREE.Group();
  const boxGeometry = new THREE.BoxGeometry(W, H, L);

  const faces = new THREE.Mesh(
    boxGeometry,
    new THREE.MeshStandardMaterial({
      color: ROOM_FACE_COLOR,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  faces.position.set(0, H / 2, 0);
  group.add(faces);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(boxGeometry),
    new THREE.LineBasicMaterial({ color: ROOM_EDGE_COLOR }),
  );
  edges.position.set(0, H / 2, 0);
  group.add(edges);

  const grid = new THREE.GridHelper(
    Math.max(W, L),
    Math.round(Math.max(W, L) * 4),
    FLOOR_GRID_COLOR,
    FLOOR_GRID_COLOR,
  );
  grid.position.y = 0.001;
  group.add(grid);

  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 0.02, -L / 2 + 0.28),
    0.25,
    0x6b7078,
    0.09,
    0.05,
  );
  group.add(arrow);
  return group;
}

function buildNamedVehicle(config: SimulationConfig, profile: VehicleProfile): THREE.Group {
  const group = new THREE.Group();
  const cabin = config.vehicle;
  const exterior = profile.exterior;
  if (!exterior) {
    return buildRectangularCabin(cabin.widthMeters, cabin.lengthMeters, cabin.heightMeters);
  }
  const isIoniq = exterior.bodyStyle === 'boxy-crossover';

  const frontBody = isIoniq
    ? clamp(exterior.frontOverhangMeters * 0.95, 0.55, 1.05)
    : clamp(exterior.frontOverhangMeters * 1.2, 0.85, 1.35);
  const rearBody = Math.max(0.14, exterior.lengthMeters - cabin.lengthMeters - frontBody);

  group.add(buildCabinInterior(cabin));
  group.add(buildInteriorMeshes(config.interiorObjects, cabin, isIoniq));
  group.add(buildHollowBody(cabin, exterior, frontBody, rearBody, isIoniq));
  group.add(buildWheels(cabin, exterior, frontBody));
  return group;
}

/**
 * Hollow cabin: floor, headliner and wall outlines only.
 * The acoustic air volume must stay visually empty except for interior objects.
 */
function buildCabinInterior(cabin: { widthMeters: number; lengthMeters: number; heightMeters: number }): THREE.Group {
  const { widthMeters: W, lengthMeters: L, heightMeters: H } = cabin;
  const group = new THREE.Group();

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, L)),
    new THREE.LineBasicMaterial({ color: 0x5a6570, transparent: true, opacity: 0.45 }),
  );
  edges.position.set(0, H / 2, 0);
  group.add(edges);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.02, L - 0.02),
    new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.95, side: THREE.DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.004;
  group.add(floor);

  const headliner = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.04, L - 0.04),
    new THREE.MeshStandardMaterial({ color: HEADLINER_COLOR, roughness: 0.9, side: THREE.DoubleSide }),
  );
  headliner.rotation.x = Math.PI / 2;
  headliner.position.y = H - 0.01;
  group.add(headliner);
  return group;
}

function buildInteriorMeshes(
  objects: readonly InteriorObject[],
  cabin: { widthMeters: number; lengthMeters: number },
  leatherSeats: boolean,
): THREE.Group {
  const group = new THREE.Group();
  const seatColor = leatherSeats ? LEATHER_SEAT : FABRIC_SEAT;

  for (const object of objects) {
    if (object.kind.startsWith('occupant-')) continue;
    const size = {
      x: object.bounds.max.x - object.bounds.min.x,
      y: object.bounds.max.y - object.bounds.min.y,
      z: object.bounds.max.z - object.bounds.min.z,
    };
    const center = {
      x: 0.5 * (object.bounds.min.x + object.bounds.max.x),
      y: 0.5 * (object.bounds.min.y + object.bounds.max.y),
      z: 0.5 * (object.bounds.min.z + object.bounds.max.z),
    };
    if (object.kind === 'seat-back') {
      // Draw a thin backrest and pivot it at the bight. The catalog AABB is
      // the axis-aligned envelope of this leaned slab (used by the solver).
      const thickness = TYPICAL_FRONT_BACKREST_THICKNESS_METERS;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.z, thickness),
        materialForKind(object.kind, seatColor),
      );
      const bight = simToThree(
        { x: center.x, y: object.bounds.min.y, z: object.bounds.min.z },
        cabin,
      );
      mesh.position.set(0, size.z / 2, thickness / 2);
      const pivot = new THREE.Group();
      pivot.position.copy(bight);
      pivot.rotation.x = TYPICAL_SEAT_BACK_RECLINE_RADIANS;
      pivot.add(mesh);
      group.add(pivot);
    } else {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.z, size.y),
        materialForKind(object.kind, seatColor),
      );
      mesh.position.copy(simToThree(center, cabin));
      group.add(mesh);
    }
  }
  return group;
}

function materialForKind(kind: InteriorObject['kind'], seatColor: number): THREE.MeshStandardMaterial {
  switch (kind) {
    case 'seat-cushion':
    case 'seat-back':
      return new THREE.MeshStandardMaterial({ color: seatColor, roughness: 0.72, metalness: 0.02 });
    case 'headrest':
      return new THREE.MeshStandardMaterial({ color: HEADREST_COLOR, roughness: 0.7 });
    case 'dashboard':
      return new THREE.MeshStandardMaterial({ color: DASH_COLOR, roughness: 0.55, metalness: 0.08 });
    case 'center-console':
      return new THREE.MeshStandardMaterial({ color: CONSOLE_COLOR, roughness: 0.5, metalness: 0.1 });
    case 'steering-wheel':
      return new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.45 });
    case 'occupant-thighs':
    case 'occupant-torso':
    case 'occupant-head':
    case 'occupant-shins':
      return new THREE.MeshStandardMaterial({ color: OCCUPANT_SKIN, roughness: 0.8 });
  }
}

/**
 * Exterior body as a hollow shell. Solid boxes are placed only outside the
 * cabin AABB so the seat / air volume is not visually filled with body paint.
 * That matches the solver: the cabin is empty air plus discrete interior objects.
 */
function buildHollowBody(
  cabin: { widthMeters: number; lengthMeters: number; heightMeters: number },
  exterior: VehicleExteriorSpec,
  frontBody: number,
  rearBody: number,
  isIoniq: boolean,
): THREE.Group {
  const group = new THREE.Group();
  const bodyColor = isIoniq ? IONIQ_BODY : TUCSON_BODY;
  const accent = isIoniq ? IONIQ_ACCENT : TUCSON_ACCENT;
  const extW = exterior.widthMeters;
  const cabinW = cabin.widthMeters;
  const cabinL = cabin.lengthMeters;
  const cabinH = cabin.heightMeters;
  const beltHeight = Math.min(0.78, cabinH * 0.58);
  const doorThickness = clamp((extW - cabinW) / 2, 0.08, 0.22);
  const frontZ = -cabinL / 2;
  const rearZ = cabinL / 2;

  // Underbody sits *below* the cabin floor, not through the seats.
  const underbody = meshBox(extW * 0.92, 0.05, cabinL + frontBody * 0.3 + rearBody * 0.3, 0x1a1c1f, 0.75, 0.05);
  underbody.position.set(0, -0.03, (rearBody - frontBody) * 0.12);
  group.add(underbody);

  // Door / side panels live outside the cabin width.
  const doorLength = cabinL * 0.88;
  const leftDoorX = -(cabinW / 2 + doorThickness / 2);
  const rightDoorX = cabinW / 2 + doorThickness / 2;
  for (const x of [leftDoorX, rightDoorX]) {
    const outer = meshBox(doorThickness, beltHeight, doorLength, bodyColor, 0.55, 0.12);
    outer.position.set(x, beltHeight / 2, 0);
    group.add(outer);
    const inner = meshBox(0.02, beltHeight * 0.92, doorLength * 0.94, INNER_TRIM_COLOR, 0.7, 0.04);
    inner.position.set(x + (x < 0 ? doorThickness / 2 - 0.012 : -(doorThickness / 2 - 0.012)), beltHeight / 2, 0);
    group.add(inner);
    const window = glassPlane(doorLength * 0.72, cabinH - beltHeight - 0.08);
    window.rotation.y = Math.PI / 2;
    window.position.set(x < 0 ? -cabinW / 2 + 0.012 : cabinW / 2 - 0.012, (beltHeight + cabinH) / 2, 0);
    group.add(window);
  }

  // Front clip (hood / bumper) entirely in front of the cabin (negative z).
  const frontClip = meshBox(extW * 0.9, beltHeight * 0.85, frontBody, bodyColor, 0.5, 0.14);
  frontClip.position.set(0, beltHeight * 0.42, frontZ - frontBody / 2);
  group.add(frontClip);
  const hood = meshBox(extW * 0.88, 0.05, frontBody * 0.82, bodyColor, 0.4, 0.18);
  hood.position.set(0, beltHeight * 0.92, frontZ - frontBody * 0.42);
  // Negative rx: front edge of the hood is lower than the cowl.
  hood.rotation.x = isIoniq ? -0.04 : -0.1;
  group.add(hood);

  // Rear clip entirely behind the cabin (positive z).
  const rearClip = meshBox(extW * 0.9, beltHeight * 0.75, rearBody, bodyColor, 0.5, 0.14);
  rearClip.position.set(0, beltHeight * 0.38, rearZ + rearBody / 2);
  group.add(rearClip);
  const hatch = meshBox(cabinW * 0.96, cabinH * 0.72, 0.05, bodyColor, 0.45, 0.15);
  hatch.position.set(0, cabinH * 0.52, rearZ + Math.max(0.04, rearBody * 0.25));
  // Negative rx: top of the hatch leans into the cabin (toward the front).
  hatch.rotation.x = isIoniq ? -0.08 : -0.28;
  group.add(hatch);

  const roof = meshBox(cabinW * 0.96, 0.035, cabinL * 0.9, bodyColor, 0.45, 0.2);
  roof.position.set(0, cabinH + 0.02, 0.02);
  group.add(roof);

  const windshield = glassPlane(cabinW * 0.9, cabinH * 0.62);
  windshield.position.set(0, cabinH * 0.62, frontZ + 0.03);
  // Positive rx: top of the windshield rakes into the cabin (toward +Z / rear).
  windshield.rotation.x = isIoniq ? 0.35 : 0.55;
  group.add(windshield);

  const rearGlass = glassPlane(cabinW * 0.86, cabinH * 0.48);
  rearGlass.position.set(0, cabinH * 0.58, rearZ - 0.02);
  // Negative rx: top of the rear glass rakes into the cabin (toward −Z / front).
  rearGlass.rotation.x = isIoniq ? -0.12 : -0.22;
  group.add(rearGlass);

  if (isIoniq) {
    group.add(buildPixelBar(extW * 0.78, frontZ - frontBody * 0.72, beltHeight * 0.7, accent));
    group.add(buildPixelBar(extW * 0.72, rearZ + rearBody * 0.55, cabinH * 0.58, accent));
  } else {
    const grille = meshBox(extW * 0.55, beltHeight * 0.28, 0.04, 0x111315, 0.7, 0.05);
    grille.position.set(0, beltHeight * 0.48, frontZ - frontBody * 0.78);
    group.add(grille);
    const rail = meshBox(0.025, 0.02, cabinL * 0.7, accent, 0.35, 0.4);
    const left = rail.clone();
    left.position.set(-cabinW * 0.32, cabinH + 0.05, 0);
    const right = rail.clone();
    right.position.set(cabinW * 0.32, cabinH + 0.05, 0);
    group.add(left, right);
  }
  return group;
}

function glassPlane(width: number, height: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({
      color: GLASS_COLOR,
      transparent: true,
      opacity: 0.22,
      roughness: 0.08,
      metalness: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
}

function buildPixelBar(width: number, z: number, y: number, color: number): THREE.Group {
  const group = new THREE.Group();
  const bar = meshBox(width, 0.035, 0.03, color, 0.25, 0.55);
  bar.position.set(0, y, z);
  group.add(bar);
  const cell = 0.028;
  const count = Math.max(8, Math.floor(width / 0.07));
  for (let i = 0; i < count; i++) {
    const x = -width / 2 + (i + 0.5) * (width / count);
    const pixel = meshBox(cell, cell, 0.02, 0xd5dbe0, 0.2, 0.6);
    pixel.position.set(x, y, z + 0.012);
    group.add(pixel);
  }
  return group;
}

function buildWheels(
  cabin: { widthMeters: number; lengthMeters: number },
  exterior: VehicleExteriorSpec,
  frontBody: number,
): THREE.Group {
  const group = new THREE.Group();
  const radius = 0.36;
  const width = 0.22;
  const track = exterior.widthMeters * 0.42;
  const cabinL = cabin.lengthMeters;
  // Front axle: near the windshield / front overhang junction.
  const frontZ = -cabinL / 2 - frontBody * 0.15;
  const rearZ = frontZ + exterior.wheelbaseMeters;
  const y = radius * 0.15;

  const positions: Array<[number, number]> = [
    [-track, frontZ],
    [track, frontZ],
    [-track, rearZ],
    [track, rearZ],
  ];
  for (const [x, z] of positions) {
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, width, 22),
      new THREE.MeshStandardMaterial({ color: TIRE_COLOR, roughness: 0.85 }),
    );
    tire.rotation.z = Math.PI / 2;
    tire.position.set(x, y, z);
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.02, 18),
      new THREE.MeshStandardMaterial({ color: WHEEL_COLOR, roughness: 0.35, metalness: 0.45 }),
    );
    rim.rotation.z = Math.PI / 2;
    rim.position.copy(tire.position);
    group.add(tire, rim);
  }
  return group;
}

function meshBox(
  width: number,
  height: number,
  depth: number,
  color: number,
  roughness: number,
  metalness: number,
): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness, metalness }),
  );
}

/**
 * Schematic seated adult. Visualization only — the solver uses AABB boxes
 * from occupants.ts, not these capsules.
 */
function buildOccupantMeshes(
  occupants: readonly OccupantConfig[],
  cabin: { widthMeters: number; lengthMeters: number; heightMeters: number },
): THREE.Group {
  const group = new THREE.Group();
  for (const occupant of occupants) {
    group.add(buildSeatedMannequin(occupant, cabin));
  }
  return group;
}

function buildSeatedMannequin(
  occupant: OccupantConfig,
  cabin: { widthMeters: number; lengthMeters: number },
): THREE.Group {
  const root = new THREE.Group();
  root.position.copy(simToThree(occupant.hipPosition, cabin));

  const opacity = occupant.enabled ? 1 : 0.28;
  const transparent = !occupant.enabled;
  const skin = occupantMaterial(OCCUPANT_SKIN, 0.82, opacity, transparent);
  const shirt = occupantMaterial(OCCUPANT_SHIRT, 0.75, opacity, transparent);
  const pants = occupantMaterial(OCCUPANT_PANTS, 0.78, opacity, transparent);
  const hair = occupantMaterial(OCCUPANT_HAIR, 0.7, opacity, transparent);

  const thighRadius = ADULT_THIGH_THICKNESS_METERS / 2;
  const thighLength = ADULT_THIGH_LENGTH_METERS;
  const hipBreadth = ADULT_HIP_BREADTH_SITTING_METERS;
  const shoulder = ADULT_SHOULDER_BREADTH_METERS;
  const chest = ADULT_CHEST_DEPTH_METERS;
  const torsoHeight = ADULT_TORSO_HEIGHT_METERS;
  const shinLength = Math.max(0.16, occupant.hipPosition.z - ADULT_SHIN_CLEARANCE_ABOVE_FLOOR_METERS);
  const legX = hipBreadth * 0.22;

  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), pants);
  pelvis.scale.set(hipBreadth / 0.22, 0.82, 0.92);
  pelvis.position.set(0, thighRadius * 0.35, 0.01);
  root.add(pelvis);

  for (const side of [-1, 1]) {
    const thigh = capsuleMesh(thighRadius * 0.82, thighLength - thighRadius * 1.4, pants);
    thigh.rotation.x = -Math.PI / 2;
    thigh.position.set(side * legX, thighRadius * 0.5, -thighLength / 2);
    root.add(thigh);

    const shin = capsuleMesh(thighRadius * 0.68, shinLength - thighRadius * 1.1, pants);
    shin.position.set(side * legX, -shinLength / 2 + thighRadius * 0.15, -thighLength + 0.02);
    root.add(shin);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.045, 0.22), pants);
    foot.position.set(side * legX, -occupant.hipPosition.z + 0.03, -thighLength - 0.07);
    root.add(foot);
  }

  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, thighRadius * 0.45, 0);
  torsoGroup.rotation.x = TYPICAL_SEAT_BACK_RECLINE_RADIANS;

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(chest * 0.36, Math.max(0.1, torsoHeight - chest * 0.65), 6, 12),
    shirt,
  );
  torso.scale.set(shoulder / (chest * 0.72), 1, 1);
  torso.position.set(0, torsoHeight * 0.46, chest * 0.04);
  torsoGroup.add(torso);

  for (const side of [-1, 1]) {
    const upperArm = capsuleMesh(0.038, 0.24, shirt);
    upperArm.position.set(side * (shoulder / 2 - 0.015), torsoHeight * 0.38, 0.02);
    upperArm.rotation.z = side * 0.28;
    upperArm.rotation.x = 0.95;
    torsoGroup.add(upperArm);

    const forearm = capsuleMesh(0.032, 0.22, skin);
    forearm.position.set(side * (shoulder / 2 + 0.01), torsoHeight * 0.1, -0.14);
    forearm.rotation.x = 1.25;
    torsoGroup.add(forearm);
  }

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.044, ADULT_NECK_HEIGHT_METERS, 10),
    skin,
  );
  neck.position.set(0, torsoHeight + ADULT_NECK_HEIGHT_METERS / 2, 0.01);
  torsoGroup.add(neck);

  const headRadius = ADULT_HEAD_HEIGHT_METERS * 0.48;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 16, 14), skin);
  head.scale.set(
    ADULT_HEAD_WIDTH_METERS / (headRadius * 2),
    1,
    ADULT_HEAD_DEPTH_METERS / (headRadius * 2),
  );
  head.position.set(0, torsoHeight + ADULT_NECK_HEIGHT_METERS + headRadius * 0.85, 0.02);
  torsoGroup.add(head);

  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(headRadius * 0.88, 12, 10), hair);
  hairMesh.scale.set(0.98, 0.55, 0.92);
  hairMesh.position.set(0, torsoHeight + ADULT_NECK_HEIGHT_METERS + headRadius * 1.15, 0);
  torsoGroup.add(hairMesh);

  root.add(torsoGroup);
  root.add(
    makeLabelSprite(
      occupant.label,
      new THREE.Vector3(0, torsoHeight + ADULT_HEAD_HEIGHT_METERS + 0.18, 0.04),
      '#c4b08a',
    ),
  );
  return root;
}

function capsuleMesh(radius: number, cylinderLength: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.02, cylinderLength), 4, 8),
    material,
  );
}

function occupantMaterial(
  color: number,
  roughness: number,
  opacity: number,
  transparent: boolean,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
    transparent,
    opacity,
    depthWrite: !transparent,
  });
}

function buildSourceMarker(
  position: Vec3,
  label: string,
  enabled: boolean,
  cabin: { widthMeters: number; lengthMeters: number },
): THREE.Group {
  const group = new THREE.Group();
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 20, 20),
    new THREE.MeshStandardMaterial({
      color: SOURCE_COLOR,
      transparent: !enabled,
      opacity: enabled ? 1 : 0.3,
    }),
  );
  marker.position.copy(simToThree(position, cabin));
  group.add(marker, makeLabelSprite(label, marker.position, '#e0964f'));
  return group;
}

function buildMicrophoneMarker(
  position: Vec3,
  label: string,
  enabled: boolean,
  cabin: { widthMeters: number; lengthMeters: number },
): THREE.Group {
  const group = new THREE.Group();
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.05),
    new THREE.MeshStandardMaterial({
      color: MIC_COLOR,
      transparent: !enabled,
      opacity: enabled ? 1 : 0.3,
    }),
  );
  marker.position.copy(simToThree(position, cabin));
  group.add(marker, makeLabelSprite(label, marker.position, '#58a6ff'));
  return group;
}

function makeLabelSprite(text: string, position: THREE.Vector3, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const scale = 4;
  const font = `${11 * scale}px Inter, sans-serif`;
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  const textWidth = ctx.measureText(text).width;
  canvas.width = Math.ceil(textWidth + 8 * scale);
  canvas.height = 18 * scale;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 4 * scale, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }),
  );
  const worldHeight = 0.09;
  sprite.scale.set((worldHeight * canvas.width) / canvas.height, worldHeight, 1);
  sprite.position.copy(position).add(new THREE.Vector3(0, 0.1, 0));
  return sprite;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
      node.geometry.dispose();
      const material = node.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }
    if (node instanceof THREE.Sprite) {
      node.material.map?.dispose();
      node.material.dispose();
    }
  });
}
