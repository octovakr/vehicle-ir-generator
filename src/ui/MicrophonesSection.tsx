import React from 'react';
import type { MicrophoneConfig, MicrophoneMounting, SimulationConfig } from '../acoustic/types';
import { useStore } from '../state/store';
import { createDefaultMicrophone } from '../state/defaults';
import { NumberField, Section, SelectField } from './common';

const MOUNTING_OPTIONS: Array<{ value: MicrophoneMounting; label: string }> = [
  { value: 'free', label: 'Free field (point)' },
  { value: 'rearview-mirror', label: 'Rear-view mirror' },
  { value: 'ceiling', label: 'Ceiling' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'a-pillar', label: 'A-pillar' },
  { value: 'door', label: 'Door' },
];

export function MicrophonesSection(): React.JSX.Element {
  const { state, dispatch } = useStore();
  const { config } = state;

  const updateConfig = (update: (c: SimulationConfig) => SimulationConfig): void =>
    dispatch({ type: 'config/update', update });

  const updateMicrophone = (id: string, patch: Partial<MicrophoneConfig>): void =>
    updateConfig((c) => ({
      ...c,
      microphones: c.microphones.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));

  return (
    <Section title={`Microphones (${config.microphones.length})`}>
      {config.microphones.map((microphone) => (
        <div className="item-card" key={microphone.id}>
          <div className="item-card-header">
            <span className="item-dot mic" />
            <span className="item-title">{microphone.label}</span>
            <label
              className="item-meta"
              style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={microphone.enabled}
                onChange={(e) => updateMicrophone(microphone.id, { enabled: e.target.checked })}
              />
              On
            </label>
            <button
              className="btn small ghost-danger"
              onClick={() =>
                updateConfig((c) => ({
                  ...c,
                  microphones: c.microphones.filter((m) => m.id !== microphone.id),
                }))
              }
              disabled={config.microphones.length <= 1}
              title="Remove microphone"
            >
              ✕
            </button>
          </div>

          <div className="field-row">
            <NumberField
              label="x"
              unit="m"
              step={0.05}
              value={microphone.position.x}
              onCommit={(x) =>
                updateMicrophone(microphone.id, { position: { ...microphone.position, x } })
              }
            />
            <NumberField
              label="y"
              unit="m"
              step={0.05}
              value={microphone.position.y}
              onCommit={(y) =>
                updateMicrophone(microphone.id, { position: { ...microphone.position, y } })
              }
            />
            <NumberField
              label="z"
              unit="m"
              step={0.05}
              value={microphone.position.z}
              onCommit={(z) =>
                updateMicrophone(microphone.id, { position: { ...microphone.position, z } })
              }
            />
          </div>

          <SelectField
            label="Mounting"
            value={microphone.mounting}
            options={MOUNTING_OPTIONS}
            onChange={(mounting) => updateMicrophone(microphone.id, { mounting })}
            title="Stored for future boundary-effect modeling. The current solver treats every microphone as an ideal point receiver."
          />
        </div>
      ))}

      <div className="section-note">
        Note: mounting is recorded in the configuration and IR metadata, but the current solver is a
        free-field point-receiver approximation — boundary / rigid-body effects are not yet modeled.
      </div>

      <div className="field-row">
        <button
          className="btn"
          onClick={() =>
            updateConfig((c) => ({
              ...c,
              microphones: [...c.microphones, createDefaultMicrophone(c.vehicle)],
            }))
          }
        >
          + Add microphone
        </button>
      </div>
    </Section>
  );
}
