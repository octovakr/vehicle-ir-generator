import React, { useState } from 'react';
import type { SimulationConfig, SoundSourceConfig } from '../acoustic/types';
import { MAX_SOURCES } from '../acoustic/constants';
import { useStore } from '../state/store';
import { createDefaultSource, zonePresetPosition } from '../state/defaults';
import { resolveSourceSignal } from '../state/sourceSignals';
import { playSamples, stopPlayback } from '../audio/playback';
import { mixSignals, normalizeIfClipping } from '../dsp/convolution';
import { openLocalAudioFile } from '../platform/fileSystem';
import { NumberField, Section, SelectField } from './common';

const ZONE_OPTIONS = [
  { value: '1', label: 'Zone 1 — front left' },
  { value: '2', label: 'Zone 2 — front right' },
  { value: '3', label: 'Zone 3 — rear left' },
  { value: '4', label: 'Zone 4 — rear right' },
] as const;

export function SourcesSection(): React.JSX.Element {
  const { state, dispatch } = useStore();
  const { config, sourceFileAudio } = state;
  const [playingId, setPlayingId] = useState<string | null>(null);

  const updateConfig = (update: (c: SimulationConfig) => SimulationConfig): void =>
    dispatch({ type: 'config/update', update });

  const updateSource = (id: string, patch: Partial<SoundSourceConfig>): void =>
    updateConfig((c) => ({
      ...c,
      sources: c.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  const addSource = (): void =>
    updateConfig((c) => {
      const zone = (((c.sources.length % 4) + 1) as 1 | 2 | 3 | 4);
      return {
        ...c,
        sources: [
          ...c.sources,
          createDefaultSource(zone, c.vehicle, c.simulation.randomSeed + c.sources.length + 1),
        ],
      };
    });

  const removeSource = (id: string): void => {
    updateConfig((c) => ({ ...c, sources: c.sources.filter((s) => s.id !== id) }));
    dispatch({ type: 'sourceAudio/remove', sourceId: id });
  };

  const loadFile = async (source: SoundSourceConfig): Promise<void> => {
    try {
      const opened = await openLocalAudioFile();
      if (!opened) return;
      dispatch({
        type: 'sourceAudio/set',
        sourceId: source.id,
        audio: { fileName: opened.fileName, rawData: opened.data },
      });
      updateSource(source.id, { audio: { kind: 'file', fileName: opened.fileName } });
    } catch (error) {
      dispatch({
        type: 'generation/failure',
        error: error instanceof Error ? error.message : 'Failed to load the audio file.',
      });
    }
  };

  const preview = async (source: SoundSourceConfig): Promise<void> => {
    if (playingId === source.id) {
      stopPlayback();
      setPlayingId(null);
      return;
    }
    try {
      const samples = await resolveSourceSignal(
        source,
        sourceFileAudio[source.id],
        config.simulation.sampleRateHz,
      );
      setPlayingId(source.id);
      playSamples(normalizeIfClipping(samples), config.simulation.sampleRateHz, () =>
        setPlayingId(null),
      );
    } catch (error) {
      dispatch({
        type: 'generation/failure',
        error: error instanceof Error ? error.message : 'Preview failed.',
      });
    }
  };

  const previewMix = async (): Promise<void> => {
    if (playingId === 'mix') {
      stopPlayback();
      setPlayingId(null);
      return;
    }
    try {
      const enabled = config.sources.filter((s) => s.enabled);
      if (enabled.length === 0) return;
      const signals = await Promise.all(
        enabled.map((s) =>
          resolveSourceSignal(s, sourceFileAudio[s.id], config.simulation.sampleRateHz),
        ),
      );
      setPlayingId('mix');
      playSamples(normalizeIfClipping(mixSignals(signals)), config.simulation.sampleRateHz, () =>
        setPlayingId(null),
      );
    } catch (error) {
      dispatch({
        type: 'generation/failure',
        error: error instanceof Error ? error.message : 'Preview failed.',
      });
    }
  };

  return (
    <Section title={`Sources (${config.sources.length})`}>
      {config.sources.map((source) => (
        <div className="item-card" key={source.id}>
          <div className="item-card-header">
            <span className="item-dot source" />
            <span className="item-title">{source.label}</span>
            <label
              className="item-meta"
              style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={source.enabled}
                onChange={(e) => updateSource(source.id, { enabled: e.target.checked })}
              />
              On
            </label>
            <button
              className="btn small ghost-danger"
              onClick={() => removeSource(source.id)}
              disabled={config.sources.length <= 1}
              title="Remove source"
            >
              ✕
            </button>
          </div>

          <SelectField
            label="Zone preset"
            value={String(source.zone) as '1' | '2' | '3' | '4'}
            options={[...ZONE_OPTIONS]}
            onChange={(zone) => {
              const zoneNumber = Number(zone) as 1 | 2 | 3 | 4;
              updateSource(source.id, {
                zone: zoneNumber,
                position: zonePresetPosition(zoneNumber, config.vehicle),
              });
            }}
            title="Selecting a zone moves the source to that seating preset. Coordinates stay fully editable."
          />

          <div className="field-row">
            <NumberField
              label="x"
              unit="m"
              step={0.05}
              value={source.position.x}
              onCommit={(x) => updateSource(source.id, { position: { ...source.position, x } })}
            />
            <NumberField
              label="y"
              unit="m"
              step={0.05}
              value={source.position.y}
              onCommit={(y) => updateSource(source.id, { position: { ...source.position, y } })}
            />
            <NumberField
              label="z"
              unit="m"
              step={0.05}
              value={source.position.z}
              onCommit={(z) => updateSource(source.id, { position: { ...source.position, z } })}
            />
          </div>

          <div className="field-row">
            <SelectField
              label="Audio"
              value={source.audio.kind}
              options={[
                { value: 'generated', label: 'Generated speech' },
                { value: 'file', label: 'Local audio file' },
              ]}
              onChange={(kind) => {
                if (kind === 'generated') {
                  updateSource(source.id, {
                    audio: { kind: 'generated', seed: config.simulation.randomSeed, durationSeconds: 3 },
                  });
                } else {
                  const existing = sourceFileAudio[source.id];
                  updateSource(source.id, {
                    audio: { kind: 'file', fileName: existing?.fileName ?? '' },
                  });
                }
              }}
            />
            <NumberField
              label="Gain"
              step={0.05}
              min={0}
              value={source.gain}
              onCommit={(gain) => updateSource(source.id, { gain })}
              title="Linear gain applied to this source's signal (1 = unity)."
            />
          </div>

          {source.audio.kind === 'generated' ? (
            <div className="field-row">
              <NumberField
                label="Seed"
                step={1}
                value={source.audio.seed}
                onCommit={(seed) => {
                  const audio = source.audio as { kind: 'generated'; seed: number; durationSeconds: number };
                  updateSource(source.id, { audio: { ...audio, seed } });
                }}
              />
              <NumberField
                label="Duration"
                unit="s"
                step={0.5}
                min={0.5}
                max={30}
                value={source.audio.durationSeconds}
                onCommit={(durationSeconds) => {
                  const audio = source.audio as { kind: 'generated'; seed: number; durationSeconds: number };
                  updateSource(source.id, { audio: { ...audio, durationSeconds } });
                }}
              />
            </div>
          ) : (
            <div className="field-row" style={{ alignItems: 'center' }}>
              <button className="btn small" onClick={() => void loadFile(source)}>
                Choose file…
              </button>
              <span className="item-meta" style={{ flex: 1 }}>
                {sourceFileAudio[source.id]?.fileName ?? 'No file selected'}
              </span>
            </div>
          )}

          <div className="field-row">
            <button className="btn small" onClick={() => void preview(source)}>
              {playingId === source.id ? '■ Stop' : '▶ Preview'}
            </button>
          </div>
        </div>
      ))}

      <div className="field-row">
        <button className="btn" onClick={addSource} disabled={config.sources.length >= MAX_SOURCES}>
          + Add source
        </button>
        <button className="btn" onClick={() => void previewMix()}>
          {playingId === 'mix' ? '■ Stop mix' : '▶ Preview mix'}
        </button>
      </div>
    </Section>
  );
}
