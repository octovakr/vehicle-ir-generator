import type { AcousticMaterial } from './types';

/**
 * Preset broadband materials for vehicle interiors.
 *
 * `absorptionCoefficient` is the ENERGY absorption coefficient β (0…1).
 *
 * APPROXIMATION: these are representative broadband values assembled from
 * published octave-band absorption tables (e.g. Everest & Pohlmann,
 * "Master Handbook of Acoustics"; typical automotive trim measurements),
 * averaged over the speech-relevant range (~250 Hz – 4 kHz). They are meant
 * for plausible data augmentation, not as certified material measurements.
 * Frequency-dependent coefficients are a planned future extension.
 */
export const MATERIAL_PRESETS: readonly AcousticMaterial[] = [
  { id: 'glass', name: 'Glass (window / windshield)', absorptionCoefficient: 0.05 },
  { id: 'metal', name: 'Metal panel', absorptionCoefficient: 0.05 },
  { id: 'plastic', name: 'Hard plastic trim', absorptionCoefficient: 0.08 },
  { id: 'leather', name: 'Leather upholstery', absorptionCoefficient: 0.35 },
  { id: 'polyurethane', name: 'Polyurethane foam seat', absorptionCoefficient: 0.6 },
  { id: 'fabric', name: 'Fabric upholstery / headliner', absorptionCoefficient: 0.45 },
  { id: 'carpet', name: 'Automotive carpet', absorptionCoefficient: 0.3 },
  // Clothing β is a speech-band average, not a measured in-car coefficient.
  { id: 'clothing', name: 'Clothing (average adult)', absorptionCoefficient: 0.48 },
];

/** Look up a preset; returns undefined for unknown ids (e.g. "custom"). */
export function getMaterialPreset(id: string): AcousticMaterial | undefined {
  return MATERIAL_PRESETS.find((m) => m.id === id);
}

/** Create a user-defined material with an explicit β. Validation is done by the caller. */
export function createCustomMaterial(absorptionCoefficient: number): AcousticMaterial {
  return {
    id: 'custom',
    name: 'Custom',
    absorptionCoefficient,
    isCustom: true,
  };
}
