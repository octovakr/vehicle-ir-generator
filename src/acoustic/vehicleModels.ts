/**
 * Vehicle-model catalog.
 *
 * Named models (2026 IONIQ 5, 2026 Tucson) convert published specification-
 * sheet dimensions into:
 *   1. an axis-aligned cabin enclosure for the Image Source Method
 *   2. interior objects (seats, dashboard, console, steering wheel)
 *
 * The acoustic engine consumes only the resulting cabin + objects. The 3D
 * viewport separately reads the exterior measurements for body rendering.
 *
 * Every numeric field is tagged as either SPEC SHEET or RESEARCHED so the
 * physical-model honesty rule (30) stays inspectable.
 */

import type {
  AcousticMaterial,
  InteriorObject,
  SurfaceMaterials,
  VehicleGeometry,
  VehicleModelId,
} from './types';
import {
  CARGO_HEIGHT_FRACTION_OF_CABIN,
  CARGO_WIDTH_FRACTION_OF_SHOULDER,
  CUBIC_METERS_PER_CUBIC_FOOT,
  DEFAULT_VEHICLE_HEIGHT_METERS,
  DEFAULT_VEHICLE_LENGTH_METERS,
  DEFAULT_VEHICLE_WIDTH_METERS,
  IONIQ5_DASHBOARD_DEPTH_METERS,
  METERS_PER_INCH,
  TUCSON_DASHBOARD_DEPTH_METERS,
  TYPICAL_CONSOLE_HEIGHT_METERS,
  TYPICAL_CONSOLE_WIDTH_METERS,
  TYPICAL_CUSHION_THICKNESS_METERS,
  TYPICAL_CUV_SEAT_H30_METERS,
  TYPICAL_DASHBOARD_HEIGHT_METERS,
  TYPICAL_DOOR_CARD_THICKNESS_METERS,
  TYPICAL_FRONT_BACKREST_HEIGHT_METERS,
  TYPICAL_FRONT_BACKREST_THICKNESS_METERS,
  TYPICAL_FRONT_CUSHION_DEPTH_METERS,
  TYPICAL_FRONT_CUSHION_WIDTH_METERS,
  TYPICAL_FRONT_FOOTWELL_METERS,
  TYPICAL_HEADREST_DEPTH_METERS,
  TYPICAL_HEADREST_HEIGHT_METERS,
  TYPICAL_HEADREST_WIDTH_METERS,
  TYPICAL_REAR_CUSHION_DEPTH_METERS,
  TYPICAL_SEAT_BACK_RECLINE_RADIANS,
  TYPICAL_STEERING_WHEEL_DIAMETER_METERS,
  TYPICAL_STEERING_WHEEL_THICKNESS_METERS,
} from './constants';
import { getMaterialPreset } from './materials';

export type VehicleBodyStyle = 'rectangular' | 'boxy-crossover' | 'compact-suv';

export interface VehicleExteriorSpec {
  lengthMeters: number;
  widthMeters: number;
  heightMeters: number;
  wheelbaseMeters: number;
  frontOverhangMeters: number;
  rearOverhangMeters: number;
  groundClearanceMeters: number;
  bodyStyle: VehicleBodyStyle;
}

export interface VehicleInteriorMeasurements {
  frontHeadroomMeters: number;
  rearHeadroomMeters: number;
  frontLegroomMeters: number;
  rearLegroomMeters: number;
  frontShoulderRoomMeters: number;
  rearShoulderRoomMeters: number;
  frontHipRoomMeters: number;
  rearHipRoomMeters: number;
  cargoVolumeSeatsUpCubicMeters: number;
  seatingCapacity: number;
}

export interface VehicleProfile {
  id: VehicleModelId;
  displayName: string;
  /** Short UI description of the acoustic / visual model. */
  summary: string;
  exterior: VehicleExteriorSpec | null;
  interior: VehicleInteriorMeasurements | null;
  cabin: VehicleGeometry;
  interiorObjects: InteriorObject[];
  defaultMaterials: SurfaceMaterials;
  /** Human-readable provenance notes shown in the Vehicle panel. */
  provenanceNotes: string[];
}

function inches(value: number): number {
  return value * METERS_PER_INCH;
}

function cubicFeet(value: number): number {
  return value * CUBIC_METERS_PER_CUBIC_FOOT;
}

function mustMaterial(id: string): AcousticMaterial {
  const material = getMaterialPreset(id);
  if (!material) throw new Error(`Unknown material preset "${id}"`);
  return { ...material };
}

function cloneMaterials(materials: SurfaceMaterials): SurfaceMaterials {
  return {
    floor: { ...materials.floor },
    ceiling: { ...materials.ceiling },
    left: { ...materials.left },
    right: { ...materials.right },
    front: { ...materials.front },
    rear: { ...materials.rear },
  };
}

function defaultSedanMaterials(): SurfaceMaterials {
  return {
    floor: mustMaterial('carpet'),
    ceiling: mustMaterial('fabric'),
    left: mustMaterial('plastic'),
    right: mustMaterial('plastic'),
    front: mustMaterial('glass'),
    rear: mustMaterial('fabric'),
  };
}

/**
 * Recover the ISM cabin box from SAE-style interior measurements.
 *
 *   width  = front shoulder room          (SPEC SHEET)
 *   height = front headroom + typical H30 (SPEC + RESEARCHED)
 *   length = front legroom + rear legroom
 *            + typical rear cushion depth
 *            + cargoLength                (SPEC + RESEARCHED + DERIVED)
 *
 * cargoLength is inverted from the published cargo volume:
 *
 *   cargoLength = V_cargo / (0.80 · shoulder · 0.55 · cabinHeight)
 *
 * The 0.80 / 0.55 factors stand in for wheel-house pinch and cargo-cover
 * height, which the spec sheets do not publish.
 */
export function deriveCabinGeometry(
  interior: VehicleInteriorMeasurements,
  seatH30Meters: number = TYPICAL_CUV_SEAT_H30_METERS,
): VehicleGeometry {
  const widthMeters = interior.frontShoulderRoomMeters;
  const heightMeters = interior.frontHeadroomMeters + seatH30Meters;
  const cargoWidthMeters = CARGO_WIDTH_FRACTION_OF_SHOULDER * interior.frontShoulderRoomMeters;
  const cargoHeightMeters = CARGO_HEIGHT_FRACTION_OF_CABIN * heightMeters;
  const cargoLengthMeters =
    cargoWidthMeters > 0 && cargoHeightMeters > 0
      ? interior.cargoVolumeSeatsUpCubicMeters / (cargoWidthMeters * cargoHeightMeters)
      : 0;
  const lengthMeters =
    interior.frontLegroomMeters +
    interior.rearLegroomMeters +
    TYPICAL_REAR_CUSHION_DEPTH_METERS +
    cargoLengthMeters;
  return { widthMeters, lengthMeters, heightMeters };
}

function box(
  id: string,
  label: string,
  kind: InteriorObject['kind'],
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  material: AcousticMaterial,
): InteriorObject {
  return {
    id,
    label,
    kind,
    bounds: {
      min: { x: x0, y: y0, z: z0 },
      max: { x: x1, y: y1, z: z1 },
    },
    material: { ...material },
  };
}

/**
 * Place seats / dashboard / console inside the derived cabin.
 *
 * Longitudinal layout (y, front → rear), documented:
 *   [0, dashDepth]                     dashboard
 *   dashDepth + footwell               front cushion front edge
 *   + cushionDepth                     front backrest
 *   + rearLegroom                      rear seating reference (H-point)
 *   rear cushion / backrest / cargo    remainder of the cabin
 *
 * Lateral layout uses door-card inset and the published hip / shoulder
 * rooms only as a width budget — individual cushion widths are RESEARCHED.
 */
export function buildInteriorObjects(options: {
  cabin: VehicleGeometry;
  interior: VehicleInteriorMeasurements;
  dashboardDepthMeters: number;
  seatMaterial: AcousticMaterial;
  dashboardMaterial: AcousticMaterial;
  consoleMaterial: AcousticMaterial;
}): InteriorObject[] {
  const { cabin, interior, dashboardDepthMeters, seatMaterial, dashboardMaterial, consoleMaterial } =
    options;
  const W = cabin.widthMeters;
  const H = cabin.heightMeters;
  const door = TYPICAL_DOOR_CARD_THICKNESS_METERS;
  const cushionZ1 = TYPICAL_CUV_SEAT_H30_METERS;
  const cushionZ0 = Math.max(0.02, cushionZ1 - TYPICAL_CUSHION_THICKNESS_METERS);
  const backZ1 = Math.min(H - 0.04, cushionZ1 + TYPICAL_FRONT_BACKREST_HEIGHT_METERS);
  const headZ0 = backZ1;
  const headZ1 = Math.min(H - 0.02, headZ0 + TYPICAL_HEADREST_HEIGHT_METERS);

  const dashDepth = Math.min(dashboardDepthMeters, cabin.lengthMeters * 0.2);
  const dashHeight = Math.min(TYPICAL_DASHBOARD_HEIGHT_METERS, H * 0.6);
  const frontCushionY0 = dashDepth + TYPICAL_FRONT_FOOTWELL_METERS;
  const frontCushionY1 = frontCushionY0 + TYPICAL_FRONT_CUSHION_DEPTH_METERS;
  const frontBackY0 = frontCushionY1;
  const frontBackY1 = frontBackY0 + TYPICAL_FRONT_BACKREST_THICKNESS_METERS;

  const rearHpY = frontBackY1 + interior.rearLegroomMeters;
  const rearCushionY0 = rearHpY - 0.32;
  const rearCushionY1 = rearCushionY0 + TYPICAL_REAR_CUSHION_DEPTH_METERS;
  const rearBackY0 = rearCushionY1;
  const rearBackY1 = rearBackY0 + TYPICAL_FRONT_BACKREST_THICKNESS_METERS;

  const frontSeatWidth = TYPICAL_FRONT_CUSHION_WIDTH_METERS;
  const leftX0 = door;
  const leftX1 = leftX0 + frontSeatWidth;
  const rightX1 = W - door;
  const rightX0 = rightX1 - frontSeatWidth;

  const rearUsableX0 = door;
  const rearUsableX1 = W - door;
  const rearUsable = rearUsableX1 - rearUsableX0;
  // 60:40 split folding backrest (SPEC SHEET feature). 60 % on the left.
  const rearSplitX = rearUsableX0 + 0.6 * rearUsable;

  const objects: InteriorObject[] = [];

  objects.push(
    box(
      'dashboard',
      'Dashboard',
      'dashboard',
      0.02,
      W - 0.02,
      0.0,
      dashDepth,
      0.28,
      dashHeight,
      dashboardMaterial,
    ),
  );

  const consoleX0 = (W - TYPICAL_CONSOLE_WIDTH_METERS) / 2;
  const consoleX1 = consoleX0 + TYPICAL_CONSOLE_WIDTH_METERS;
  objects.push(
    box(
      'center-console',
      'Center console',
      'center-console',
      consoleX0,
      consoleX1,
      dashDepth * 0.45,
      frontBackY1,
      0.0,
      TYPICAL_CONSOLE_HEIGHT_METERS,
      consoleMaterial,
    ),
  );

  const wheelRadius = TYPICAL_STEERING_WHEEL_DIAMETER_METERS / 2;
  const wheelY0 = dashDepth - TYPICAL_STEERING_WHEEL_THICKNESS_METERS;
  const wheelY1 = dashDepth + 0.02;
  const wheelXMid = (leftX0 + leftX1) / 2;
  objects.push(
    box(
      'steering-wheel',
      'Steering wheel',
      'steering-wheel',
      wheelXMid - wheelRadius,
      wheelXMid + wheelRadius,
      wheelY0,
      wheelY1,
      dashHeight - wheelRadius - 0.04,
      dashHeight + wheelRadius * 0.15,
      dashboardMaterial,
    ),
  );

  const addSeat = (
    prefix: string,
    label: string,
    x0: number,
    x1: number,
    cushionY0: number,
    cushionY1: number,
    backY0: number,
    backY1: number,
  ): void => {
    // Recline: top of the backrest is further from the windshield (larger y).
    // The AABB is the axis-aligned envelope of that leaned backrest.
    const backrestHeight = backZ1 - cushionZ1;
    const reclineLeanMeters = Math.tan(TYPICAL_SEAT_BACK_RECLINE_RADIANS) * backrestHeight;
    const leanedBackY1 = backY1 + reclineLeanMeters;
    objects.push(
      box(
        `${prefix}-cushion`,
        `${label} cushion`,
        'seat-cushion',
        x0,
        x1,
        cushionY0,
        cushionY1,
        cushionZ0,
        cushionZ1,
        seatMaterial,
      ),
      box(
        `${prefix}-back`,
        `${label} backrest`,
        'seat-back',
        x0,
        x1,
        backY0,
        leanedBackY1,
        cushionZ1,
        backZ1,
        seatMaterial,
      ),
      box(
        `${prefix}-headrest`,
        `${label} headrest`,
        'headrest',
        (x0 + x1) / 2 - TYPICAL_HEADREST_WIDTH_METERS / 2,
        (x0 + x1) / 2 + TYPICAL_HEADREST_WIDTH_METERS / 2,
        leanedBackY1 - TYPICAL_HEADREST_DEPTH_METERS,
        leanedBackY1 + 0.02,
        headZ0,
        headZ1,
        seatMaterial,
      ),
    );
  };

  addSeat(
    'seat-fl',
    'Front left seat',
    leftX0,
    leftX1,
    frontCushionY0,
    frontCushionY1,
    frontBackY0,
    frontBackY1,
  );
  addSeat(
    'seat-fr',
    'Front right seat',
    rightX0,
    rightX1,
    frontCushionY0,
    frontCushionY1,
    frontBackY0,
    frontBackY1,
  );
  addSeat(
    'seat-rl',
    'Rear left (60%) seat',
    rearUsableX0,
    rearSplitX,
    rearCushionY0,
    rearCushionY1,
    rearBackY0,
    rearBackY1,
  );
  addSeat(
    'seat-rr',
    'Rear right (40%) seat',
    rearSplitX,
    rearUsableX1,
    rearCushionY0,
    rearCushionY1,
    rearBackY0,
    rearBackY1,
  );

  return objects.filter((object) => isWellFormedBox(object, cabin));
}

function isWellFormedBox(object: InteriorObject, cabin: VehicleGeometry): boolean {
  const { min, max } = object.bounds;
  if (max.x <= min.x || max.y <= min.y || max.z <= min.z) return false;
  if (min.x >= cabin.widthMeters || max.x <= 0) return false;
  if (min.y >= cabin.lengthMeters || max.y <= 0) return false;
  if (min.z >= cabin.heightMeters || max.z <= 0) return false;
  return true;
}

function cloneObjects(objects: readonly InteriorObject[]): InteriorObject[] {
  return objects.map((object) => ({
    ...object,
    bounds: {
      min: { ...object.bounds.min },
      max: { ...object.bounds.max },
    },
    material: { ...object.material },
  }));
}

const IONIQ5_INTERIOR: VehicleInteriorMeasurements = {
  // 2026 US specification (inches → meters). Local PDF is the AU sheet
  // for the same generation; published interior SAE numbers match these.
  frontHeadroomMeters: inches(39.8),
  rearHeadroomMeters: inches(38.7),
  frontLegroomMeters: inches(41.7),
  rearLegroomMeters: inches(39.4),
  frontShoulderRoomMeters: inches(57.7),
  rearShoulderRoomMeters: inches(57.7),
  frontHipRoomMeters: inches(53.9),
  rearHipRoomMeters: inches(53.6),
  cargoVolumeSeatsUpCubicMeters: cubicFeet(26.3),
  seatingCapacity: 5,
};

const TUCSON_INTERIOR: VehicleInteriorMeasurements = {
  frontHeadroomMeters: inches(40.1),
  rearHeadroomMeters: inches(39.5),
  frontLegroomMeters: inches(41.4),
  rearLegroomMeters: inches(41.3),
  frontShoulderRoomMeters: inches(57.6),
  rearShoulderRoomMeters: inches(56.0),
  frontHipRoomMeters: inches(54.5),
  rearHipRoomMeters: inches(53.9),
  cargoVolumeSeatsUpCubicMeters: cubicFeet(38.7),
  seatingCapacity: 5,
};

function buildIoniq5Profile(): VehicleProfile {
  const cabin = deriveCabinGeometry(IONIQ5_INTERIOR);
  const leather = mustMaterial('leather');
  const plastic = mustMaterial('plastic');
  const interiorObjects = buildInteriorObjects({
    cabin,
    interior: IONIQ5_INTERIOR,
    dashboardDepthMeters: IONIQ5_DASHBOARD_DEPTH_METERS,
    seatMaterial: leather,
    dashboardMaterial: plastic,
    consoleMaterial: plastic,
  });
  return {
    id: 'ioniq5-2026',
    displayName: '2026 IONIQ 5',
    summary:
      'Cabin ISM enclosure from published interior dimensions, plus seats / dashboard as extra absorbing and reflecting objects.',
    exterior: {
      lengthMeters: inches(183.3),
      widthMeters: inches(74.4),
      heightMeters: inches(63.0),
      wheelbaseMeters: inches(118.1),
      frontOverhangMeters: inches(34.1),
      rearOverhangMeters: inches(33.1),
      groundClearanceMeters: inches(6.1),
      bodyStyle: 'boxy-crossover',
    },
    interior: IONIQ5_INTERIOR,
    cabin,
    interiorObjects,
    defaultMaterials: {
      floor: mustMaterial('carpet'),
      ceiling: mustMaterial('fabric'),
      left: mustMaterial('plastic'),
      right: mustMaterial('plastic'),
      front: mustMaterial('glass'),
      rear: mustMaterial('glass'),
    },
    provenanceNotes: [
      'Exterior L/W/H, wheelbase and interior SAE rooms / cargo volume: 2026 IONIQ 5 specification sheet (US figures; AU sheet is the same generation).',
      'Front/rear overhang 34.1 / 33.1 in and ground clearance 6.1 in: published 2026 IONIQ 5 figures (not printed as a dedicated Dimensions block in every regional PDF).',
      'Cabin width = front shoulder room. Cabin height = front headroom + typical CUV H30 (300 mm, researched). Cabin length = front + rear legroom + typical rear cushion + cargo length inverted from cargo volume (researched width/height fractions).',
      'Seat / dashboard / console / steering-wheel sizes and exact placement: researched typical CUV values. Seat backs recline ~12.6° so the top is further from the windshield (AABB is the leaned envelope). Spec confirms 5 seats, 60:40 rear split, leather-appointed seats (Elite / higher), sliding center console, acoustic windshield.',
      'Acoustic model: axis-aligned cabin ISM (physically modeled) + object-volume attenuation and first-order object-face reflections (documented approximations). Not a CAD/BEM vehicle model.',
    ],
  };
}

function buildTucsonProfile(): VehicleProfile {
  const cabin = deriveCabinGeometry(TUCSON_INTERIOR);
  const fabric = mustMaterial('fabric');
  const plastic = mustMaterial('plastic');
  const interiorObjects = buildInteriorObjects({
    cabin,
    interior: TUCSON_INTERIOR,
    dashboardDepthMeters: TUCSON_DASHBOARD_DEPTH_METERS,
    seatMaterial: fabric,
    dashboardMaterial: plastic,
    consoleMaterial: plastic,
  });
  return {
    id: 'tucson-2026',
    displayName: '2026 Tucson',
    summary:
      'Cabin ISM enclosure from published interior dimensions, plus seats / dashboard as extra absorbing and reflecting objects.',
    exterior: {
      lengthMeters: inches(182.7),
      widthMeters: inches(73.4),
      heightMeters: inches(65.6),
      wheelbaseMeters: inches(108.5),
      frontOverhangMeters: inches(35.6),
      rearOverhangMeters: inches(38.6),
      groundClearanceMeters: inches(7.1),
      bodyStyle: 'compact-suv',
    },
    interior: TUCSON_INTERIOR,
    cabin,
    interiorObjects,
    defaultMaterials: {
      floor: mustMaterial('carpet'),
      ceiling: mustMaterial('fabric'),
      left: mustMaterial('plastic'),
      right: mustMaterial('plastic'),
      front: mustMaterial('glass'),
      rear: mustMaterial('glass'),
    },
    provenanceNotes: [
      'Exterior L/W/H (FWD, no roof-rail extra), wheelbase, overhangs, interior SAE rooms and cargo volume: 2026 Tucson specification sheet / Hyundai USA Dimensions.',
      'Ground clearance 7.1 in is the 2WD figure (AWD is 8.3 in). Height 65.6 in is the FWD figure (AWD 66.3 in with roof rails).',
      'Cabin width / height / length derived exactly as for IONIQ 5 (shoulder room, headroom + typical H30, legrooms + cushion + inverted cargo length).',
      'Seat / dashboard / console sizes: researched typical compact-SUV values. Seat backs recline ~12.6° away from the windshield. Spec confirms 5 seats, 60:40 rear split. Base upholstery is cloth (H-Tex / leather are optional trims) — seats use the fabric preset.',
      'Acoustic model: axis-aligned cabin ISM (physically modeled) + object-volume attenuation and first-order object-face reflections (documented approximations). Not a CAD/BEM vehicle model.',
    ],
  };
}

function buildRectangularProfile(): VehicleProfile {
  return {
    id: 'rectangular',
    displayName: 'Rectangular enclosure',
    summary: 'Axis-aligned shoebox. Width, length and height are fully editable.',
    exterior: null,
    interior: null,
    cabin: {
      widthMeters: DEFAULT_VEHICLE_WIDTH_METERS,
      lengthMeters: DEFAULT_VEHICLE_LENGTH_METERS,
      heightMeters: DEFAULT_VEHICLE_HEIGHT_METERS,
    },
    interiorObjects: [],
    defaultMaterials: defaultSedanMaterials(),
    provenanceNotes: [
      'Default mid-size sedan cabin (1.5 × 2.8 × 1.2 m). No specification-sheet vehicle is selected.',
      'No seats or interior objects — walls only. This is the original MVP geometry.',
    ],
  };
}

const PROFILE_BUILDERS: Record<VehicleModelId, () => VehicleProfile> = {
  rectangular: buildRectangularProfile,
  'ioniq5-2026': buildIoniq5Profile,
  'tucson-2026': buildTucsonProfile,
};

export const VEHICLE_MODEL_OPTIONS: ReadonlyArray<{ id: VehicleModelId; label: string }> = [
  { id: 'rectangular', label: 'Rectangular enclosure (default)' },
  { id: 'ioniq5-2026', label: '2026 IONIQ 5' },
  { id: 'tucson-2026', label: '2026 Tucson' },
];

/** Fresh profile instance (objects/materials are cloned so callers can mutate). */
export function getVehicleProfile(modelId: VehicleModelId): VehicleProfile {
  const builder = PROFILE_BUILDERS[modelId];
  const profile = builder();
  return {
    ...profile,
    cabin: { ...profile.cabin },
    interiorObjects: cloneObjects(profile.interiorObjects),
    defaultMaterials: cloneMaterials(profile.defaultMaterials),
    provenanceNotes: [...profile.provenanceNotes],
    exterior: profile.exterior ? { ...profile.exterior } : null,
    interior: profile.interior ? { ...profile.interior } : null,
  };
}

export function vehicleModelDisplayName(modelId: VehicleModelId): string {
  return getVehicleProfile(modelId).displayName;
}
