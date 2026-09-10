import React, { useState } from 'react';
import type { SimulationConfig } from '../acoustic/types';
import { useStore } from '../state/store';
import { BUILTIN_PRESETS, exportPresetToFile, getPresetById, parsePresetJson } from '../presets';
import { openLocalTextFile } from '../platform/fileSystem';
import { Section, SelectField } from './common';

export function PresetsSection(): React.JSX.Element {
  const { state, dispatch } = useStore();
  const { config } = state;
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const updateConfig = (update: (c: SimulationConfig) => SimulationConfig): void =>
    dispatch({ type: 'config/update', update });

  const handleSelectPreset = (presetId: string): void => {
    setSelectedPresetId(presetId);
    if (!presetId) return;
    const preset = getPresetById(presetId);
    if (preset) {
      updateConfig(() => ({ ...preset.config }));
      setStatusMessage(`Loaded: ${preset.name}`);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleImport = async (): Promise<void> => {
    try {
      const file = await openLocalTextFile('.json,application/json');
      if (!file) return;
      const { config: importedConfig, name } = parsePresetJson(file.content);
      updateConfig(() => ({ ...importedConfig }));
      setSelectedPresetId('');
      setStatusMessage(`Imported preset: ${name}`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      dispatch({
        type: 'generation/failure',
        error: `Preset import failed: ${(err as Error).message}`,
      });
    }
  };

  const handleExport = async (): Promise<void> => {
    try {
      await exportPresetToFile(config);
      setStatusMessage('Preset exported to JSON');
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      dispatch({
        type: 'generation/failure',
        error: `Preset export failed: ${(err as Error).message}`,
      });
    }
  };

  return (
    <Section title="Presets" defaultOpen>
      <div className="section-note">
        Load a full vehicle and microphone preset, or import/export configuration JSON files.
      </div>
      <SelectField
        label="Load preset"
        value={selectedPresetId}
        options={[
          { value: '', label: '— Select preset to load —' },
          ...BUILTIN_PRESETS.map((p) => ({ value: p.id, label: p.name })),
        ]}
        onChange={handleSelectPreset}
        title="Selecting a preset replaces cabin, sources, microphones, occupants and simulation parameters."
      />
      {statusMessage && (
        <div style={{ fontSize: '0.8rem', color: '#58a6ff', margin: '6px 0' }}>
          ✓ {statusMessage}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn small" type="button" onClick={() => void handleImport()}>
          Import JSON…
        </button>
        <button className="btn small" type="button" onClick={() => void handleExport()}>
          Export JSON…
        </button>
      </div>
    </Section>
  );
}
