import type { SimulationConfig } from '../acoustic/types';
import { validateSimulationConfig } from '../acoustic/validation';
import { saveLocalFile } from '../platform/fileSystem';
import defaultRectangularPreset from '../../presets/default_rectangular.json';
import ioniq5Preset from '../../presets/ioniq5_4occupants_ohcl.json';

export interface SimulationPreset {
  id: string;
  name: string;
  description: string;
  config: SimulationConfig;
}

export const BUILTIN_PRESETS: readonly SimulationPreset[] = [
  defaultRectangularPreset as unknown as SimulationPreset,
  ioniq5Preset as unknown as SimulationPreset,
];

export function getPresetById(id: string): SimulationPreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id);
}

/** Parse and validate a preset from JSON string. */
export function parsePresetJson(jsonString: string): { config: SimulationConfig; name: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(`Invalid JSON: ${(err as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON: expected an object.');
  }

  const obj = parsed as Record<string, unknown>;

  // Format 1: wrapped preset { id, name, description, config }
  if (obj.config && typeof obj.config === 'object') {
    const config = obj.config as SimulationConfig;
    const errors = validateSimulationConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid simulation config in preset: ${errors.join('; ')}`);
    }
    return {
      config,
      name: typeof obj.name === 'string' ? obj.name : 'Imported Preset',
    };
  }

  // Format 2: raw SimulationConfig { vehicle, sources, microphones, ... }
  if (obj.vehicle && obj.sources && obj.microphones) {
    const config = obj as unknown as SimulationConfig;
    const errors = validateSimulationConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid simulation config in file: ${errors.join('; ')}`);
    }
    return {
      config,
      name: typeof obj.vehicleModelId === 'string' ? `Imported (${obj.vehicleModelId})` : 'Imported Config',
    };
  }

  throw new Error('Unrecognized preset format: missing "config" or SimulationConfig fields.');
}

/** Export a simulation configuration to a JSON string wrapped as a preset. */
export function serializePresetJson(
  config: SimulationConfig,
  name?: string,
  description?: string,
): string {
  const preset: SimulationPreset = {
    id: `preset-${Date.now()}`,
    name: name ?? `Preset (${config.vehicleModelId})`,
    description: description ?? `Exported on ${new Date().toISOString()}`,
    config,
  };
  return JSON.stringify(preset, null, 2);
}

/** Save a simulation configuration to a JSON file on disk. */
export async function exportPresetToFile(config: SimulationConfig, name?: string): Promise<void> {
  const json = serializePresetJson(config, name);
  const encoder = new TextEncoder();
  const buffer = encoder.encode(json).buffer;
  const fileName = `${(name ?? config.vehicleModelId).toLowerCase().replace(/[^a-z0-9_-]+/g, '_')}_preset.json`;
  await saveLocalFile(fileName, buffer, 'JSON Preset', ['json']);
}
