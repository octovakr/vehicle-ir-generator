import { describe, it, expect } from 'vitest';
import { BUILTIN_PRESETS, getPresetById, parsePresetJson, serializePresetJson } from './index';
import { validateSimulationConfig } from '../acoustic/validation';

describe('Presets module', () => {
  it('loads built-in presets successfully', () => {
    expect(BUILTIN_PRESETS.length).toBeGreaterThanOrEqual(2);

    const defaultPreset = getPresetById('default-rectangular');
    expect(defaultPreset).toBeDefined();
    expect(defaultPreset?.config.vehicleModelId).toBe('rectangular');
    expect(validateSimulationConfig(defaultPreset!.config)).toHaveLength(0);

    const ioniq5Preset = getPresetById('ioniq5-4occupants-ohcl');
    expect(ioniq5Preset).toBeDefined();
    expect(ioniq5Preset?.config.vehicleModelId).toBe('ioniq5-2026');
    expect(ioniq5Preset?.config.occupants).toHaveLength(4);
    expect(ioniq5Preset?.config.sources).toHaveLength(4);
    expect(ioniq5Preset?.config.microphones).toHaveLength(4);
    expect(validateSimulationConfig(ioniq5Preset!.config)).toHaveLength(0);
  });

  it('serializes and parses presets cleanly', () => {
    const ioniq5 = getPresetById('ioniq5-4occupants-ohcl')!;
    const serialized = serializePresetJson(ioniq5.config, 'My Custom Preset');
    const { config, name } = parsePresetJson(serialized);

    expect(name).toBe('My Custom Preset');
    expect(config.vehicleModelId).toBe('ioniq5-2026');
    expect(config.sources).toHaveLength(4);
  });
});
