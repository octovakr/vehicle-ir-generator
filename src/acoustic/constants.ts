/**
 * Centralized simulation defaults and named constants (rule 41).
 * All defaults live here — do not scatter magic numbers through the code.
 */

export const SIMULATOR_VERSION = '0.1.0';

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
