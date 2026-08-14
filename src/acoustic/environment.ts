import type { AcousticEnvironment } from './types';

/**
 * Speed of sound in humid air.
 *
 * Model (documented approximation, adequate for cabin conditions
 * −20 °C … +50 °C, 0–100 % RH at ~1 atm):
 *
 *   c(T, RH) ≈ 331.4 + 0.6 · T + 0.0124 · RH   [m/s]
 *
 * where
 *   T  — air temperature in degrees Celsius
 *   RH — relative humidity in percent (0–100)
 *
 * The temperature term is the first-order Taylor expansion of the ideal-gas
 * relation c = 331.4 · sqrt(1 + T/273.15) around 0 °C. The humidity term is a
 * small linear correction accounting for the lower molar mass of water vapor
 * (humid air is slightly "faster"). This is an APPROXIMATION — it neglects
 * pressure variation and the nonlinear humidity/temperature coupling, which
 * are negligible for this application (< 0.1 % error in-cabin).
 *
 * This is the ONLY place in the codebase where the speed of sound is
 * computed (rule 5).
 */
export function speedOfSoundMetersPerSecond(environment: AcousticEnvironment): number {
  const { temperatureCelsius, relativeHumidityPercent } = environment;
  return 331.4 + 0.6 * temperatureCelsius + 0.0124 * relativeHumidityPercent;
}
