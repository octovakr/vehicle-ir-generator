/**
 * Centralized simulation defaults and named constants (rule 41).
 * All defaults live here — do not scatter magic numbers through the code.
 */

export const SIMULATOR_VERSION = '0.4.0';

/** Conversion: 1 inch = 25.4 mm exactly (SI). */
export const METERS_PER_INCH = 0.0254;

/** Conversion: 1 cubic foot = 0.028316846592 m³ exactly. */
export const CUBIC_METERS_PER_CUBIC_FOOT = 0.028316846592;

/** Default output sample rate for IRs and rendered audio, samples/second. */
export const DEFAULT_SAMPLE_RATE_HZ = 16000;

/** Default IR length. 0.25 s is ample for a small, absorptive car cabin. */
export const DEFAULT_IR_DURATION_SECONDS = 0.25;

/** Default maximum image-source reflection order. */
export const DEFAULT_MAX_REFLECTION_ORDER = 20;

export const DEFAULT_RANDOM_SEED = 42;

/** Default cabin environment. */
export const DEFAULT_TEMPERATURE_CELSIUS = 20;
export const DEFAULT_RELATIVE_HUMIDITY_PERCENT = 50;

/** Default interior dimensions of a mid-size sedan cabin, meters. */
export const DEFAULT_VEHICLE_WIDTH_METERS = 1.5;
export const DEFAULT_VEHICLE_LENGTH_METERS = 2.8;
export const DEFAULT_VEHICLE_HEIGHT_METERS = 1.2;

/** Limits used by validation (not physical limits, just sane UI bounds). */
export const MIN_DIMENSION_METERS = 0.5;
export const MAX_DIMENSION_METERS = 12;
export const MIN_SAMPLE_RATE_HZ = 8000;
export const MAX_SAMPLE_RATE_HZ = 96000;
export const MIN_IR_DURATION_SECONDS = 0.05;
export const MAX_IR_DURATION_SECONDS = 4;
export const MAX_REFLECTION_ORDER_LIMIT = 60;
export const MAX_SOURCES = 6;
/** Maximum seated occupants the user may place (one per seating zone). */
export const MAX_OCCUPANTS = 4;

/** Default duration of generated robotic test speech, seconds. */
export const DEFAULT_GENERATED_SPEECH_SECONDS = 3;

/**
 * Distance reference for the 1/d spherical-spreading law, meters.
 * Amplitudes are expressed relative to the pressure at 1 m from the source.
 */
export const SPREADING_REFERENCE_DISTANCE_METERS = 1;

/**
 * Minimum propagation distance used when computing 1/d attenuation, meters.
 * Prevents numerical blow-up when a source and microphone nearly coincide.
 * This is a numerical guard, not a physical model.
 */
export const MIN_PROPAGATION_DISTANCE_METERS = 0.01;

/**
 * Typical compact-CUV seating reference height (SAE H30, SgRP to heel),
 * meters. Specification sheets publish headroom, not H30; this value is a
 * researched class-typical number used to recover floor-to-headliner height
 * as  cabinHeight ≈ frontHeadroom + H30.
 *
 * Sources: SAE J1100 class ranges; compact CUV H30 is commonly ~280–320 mm.
 */
export const TYPICAL_CUV_SEAT_H30_METERS = 0.3;

/**
 * Typical front-bucket seat cushion planform, meters.
 * RESEARCHED — not published on the Hyundai spec sheets.
 * Representative of modern compact-CUV bucket seats (cushion cover measurements
 * and SAE J2732-style planform ranges).
 */
export const TYPICAL_FRONT_CUSHION_WIDTH_METERS = 0.52;
export const TYPICAL_FRONT_CUSHION_DEPTH_METERS = 0.5;
export const TYPICAL_CUSHION_THICKNESS_METERS = 0.14;
export const TYPICAL_FRONT_BACKREST_HEIGHT_METERS = 0.64;
export const TYPICAL_FRONT_BACKREST_THICKNESS_METERS = 0.12;
/**
 * Seat-back recline from vertical, radians (~12.6°).
 * RESEARCHED typical CUV torso/seat-back angle (SAE L40 is often 20–25°;
 * the visible backrest shell is shallower than the occupant torso angle).
 * Positive means the top of the backrest is further toward the rear
 * (away from the windshield).
 */
export const TYPICAL_SEAT_BACK_RECLINE_RADIANS = 0.22;
export const TYPICAL_REAR_CUSHION_DEPTH_METERS = 0.48;
export const TYPICAL_HEADREST_WIDTH_METERS = 0.26;
export const TYPICAL_HEADREST_DEPTH_METERS = 0.1;
export const TYPICAL_HEADREST_HEIGHT_METERS = 0.18;

/** Inset from the cabin side wall to the seat side (door-card thickness). RESEARCHED. */
export const TYPICAL_DOOR_CARD_THICKNESS_METERS = 0.06;

/** Footwell gap between the dashboard rear face and the front cushion. RESEARCHED. */
export const TYPICAL_FRONT_FOOTWELL_METERS = 0.18;

/**
 * Adult seated mouth height above the undepressed seat cushion, meters.
 * RESEARCHED anthropometric approximation (not a vehicle spec).
 */
export const SEATED_MOUTH_ABOVE_CUSHION_METERS = 0.62;

/**
 * 50th-percentile seated adult (male class) body dimensions, meters.
 * RESEARCHED from ISO 7250-1 / SAE J826 / ANSUR II class ranges — not a
 * vehicle specification and not a scanned individual.
 *
 * Used only to build the occupant AABB approximation and the viewport
 * mannequin. The two representations share these numbers so the visual
 * figure occupies roughly the same volume the solver attenuates through.
 */
export const ADULT_HIP_BREADTH_SITTING_METERS = 0.38;
export const ADULT_SHOULDER_BREADTH_METERS = 0.44;
export const ADULT_CHEST_DEPTH_METERS = 0.24;
export const ADULT_TORSO_HEIGHT_METERS = 0.52;
export const ADULT_HEAD_WIDTH_METERS = 0.16;
export const ADULT_HEAD_DEPTH_METERS = 0.2;
export const ADULT_HEAD_HEIGHT_METERS = 0.22;
export const ADULT_NECK_HEIGHT_METERS = 0.06;
export const ADULT_THIGH_LENGTH_METERS = 0.42;
export const ADULT_THIGH_THICKNESS_METERS = 0.14;
export const ADULT_SHIN_DEPTH_METERS = 0.11;
export const ADULT_SHIN_CLEARANCE_ABOVE_FLOOR_METERS = 0.02;
/** Mouth height above the H-point. Matches SEATED_MOUTH_ABOVE_CUSHION when hip sits on the cushion. */
export const ADULT_MOUTH_ABOVE_HIP_METERS = 0.6;
/** Offset of the hip rearward of the cushion planform center, toward the bight, meters. */
export const OCCUPANT_HIP_AFT_OF_CUSHION_CENTER_METERS = 0.08;

/**
 * Cargo-area width as a fraction of front shoulder room (wheel-house pinch).
 * RESEARCHED — used only to invert published cargo volume into a length.
 */
export const CARGO_WIDTH_FRACTION_OF_SHOULDER = 0.8;

/**
 * Cargo-area height as a fraction of cabin height (belt-line / cargo cover).
 * RESEARCHED — used only to invert published cargo volume into a length.
 */
export const CARGO_HEIGHT_FRACTION_OF_CABIN = 0.55;

/**
 * Broadband amplitude attenuation coefficient α (nepers / meter) applied to
 * the portion of an image-source path that travels inside an interior object.
 *
 *   a *= exp(−α_eff · ℓ)    with    α_eff = α · (0.4 + 0.6 · β)
 *
 * APPROXIMATION: this is a stand-in for a missing transmission / diffraction
 * model of upholstered seats. It is NOT a measured insertion-loss. 3 Np/m is
 * ~26 dB/m and yields a few dB through a seat back, ~10 dB through a cushion.
 */
export const INTERIOR_OBJECT_ATTENUATION_PER_METER = 3;

/**
 * Distance from a mounting face to the microphone capsule center, meters.
 * RESEARCHED typical MEMS / electret capsule standoff on automotive trim
 * (not a measured vehicle spec). Keeps the receiver strictly inside the cabin
 * so the shoebox ISM remains valid.
 */
export const MICROPHONE_CAPSULE_STANDOFF_METERS = 0.015;

/**
 * Maximum capsule-to-mounting-face distance at which a microphone is still
 * treated as mounted, meters. Farther than this, the user must choose Free
 * field or move the capsule. Not a physical limit of the baffle model.
 */
export const MAX_MICROPHONE_MOUNT_STANDOFF_METERS = 0.2;

/**
 * Characteristic radii of the local rigid mounting body, meters.
 * RESEARCHED typical housing sizes — circular-disk APPROXIMATION, not CAD.
 *
 * Used both as the geometric visibility radius of the finite baffle and as
 * the length `a` in the first-order ka high-pass (cutoff f_c = c / (2π a)).
 */
export const REARVIEW_MIRROR_BAFFLE_RADIUS_METERS = 0.07;
export const CEILING_CONSOLE_BAFFLE_RADIUS_METERS = 0.09;
export const DASHBOARD_LOCAL_BAFFLE_RADIUS_METERS = 0.12;
export const A_PILLAR_BAFFLE_RADIUS_METERS = 0.035;
export const DOOR_CARD_BAFFLE_RADIUS_METERS = 0.1;
export const WALL_TRIM_BAFFLE_RADIUS_METERS = 0.08;

/**
 * How far the local mounting face sits inboard of the shoebox wall, meters.
 * Distinguishes the finite housing (console / door card / trim / pillar)
 * from the infinite ISM wall so extra baffle images are not double-counted
 * against Allen–Berkley wall images.
 *
 * Door-card inset reuses TYPICAL_DOOR_CARD_THICKNESS_METERS.
 */
export const HEADLINER_MOUNT_INSET_METERS = 0.025;
export const WALL_TRIM_MOUNT_INSET_METERS = 0.03;
export const A_PILLAR_MOUNT_INSET_METERS = 0.05;

/** Rear-view mirror housing: fraction of cabin length back from the windshield. RESEARCHED. */
export const REARVIEW_MIRROR_FROM_FRONT_FRACTION = 0.1;

/** Rear-view mirror housing: drop below the headliner, meters. RESEARCHED. */
export const REARVIEW_MIRROR_BELOW_CEILING_METERS = 0.08;

/** A-pillar inner face: fraction of cabin length back from the windshield. RESEARCHED. */
export const A_PILLAR_FROM_FRONT_FRACTION = 0.06;

/** IONIQ 5 slim-cockpit dashboard depth, meters. RESEARCHED (press: "slim cockpit module"). */
export const IONIQ5_DASHBOARD_DEPTH_METERS = 0.32;

/** Conventional compact-SUV dashboard depth, meters. RESEARCHED. */
export const TUCSON_DASHBOARD_DEPTH_METERS = 0.4;

export const TYPICAL_DASHBOARD_HEIGHT_METERS = 0.72;
export const TYPICAL_CONSOLE_WIDTH_METERS = 0.18;
export const TYPICAL_CONSOLE_HEIGHT_METERS = 0.26;
export const TYPICAL_STEERING_WHEEL_DIAMETER_METERS = 0.37;
export const TYPICAL_STEERING_WHEEL_THICKNESS_METERS = 0.035;
