import React from 'react';
import type { MicrophoneConfig, SimulationConfig } from '../acoustic/types';
import { MAX_MICROPHONE_MOUNT_STANDOFF_METERS } from '../acoustic/constants';
import {
  MICROPHONE_MOUNTING_OPTIONS,
  applyMicrophoneMounting,
  baffleCutoffHz,
  microphoneMountingLabel,
  resolveMicrophoneBaffle,
} from '../acoustic/microphoneMounting';
import { speedOfSoundMetersPerSecond } from '../acoustic/environment';
import { useStore } from '../state/store';
import { createDefaultMicrophone } from '../state/defaults';
import { NumberField, Section, SelectField } from './common';

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

  const speedOfSound = speedOfSoundMetersPerSecond(config.environment);

  return (
    <Section title={`Microphones (${config.microphones.length})`}>
      <div className="section-note">
        Mounting is consumed by the solver: a finite circular rigid baffle is placed at the
        selected surface and adds a local image-source bounce (plus a ka high-pass so small
        housings do not double bass). This is an approximation — not a CAD housing, BEM scatterer,
        or measured microphone directivity. Free field is an ideal point receiver.
      </div>

      {config.microphones.map((microphone) => {
        const baffle = resolveMicrophoneBaffle(microphone, {
          vehicle: config.vehicle,
          materials: config.materials,
          interiorObjects: config.interiorObjects,
        });
        const cutoffHz = baffle ? baffleCutoffHz(baffle.radiusMeters, speedOfSound) : null;
        const standoffOk =
          !baffle ||
          (baffle.standoffMeters > 0 && baffle.standoffMeters <= MAX_MICROPHONE_MOUNT_STANDOFF_METERS);

        return (
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
              options={[...MICROPHONE_MOUNTING_OPTIONS]}
              onChange={(mounting) =>
                updateConfig((c) => ({
                  ...c,
                  microphones: c.microphones.map((m) =>
                    m.id === microphone.id
                      ? applyMicrophoneMounting(m, mounting, c.vehicle, c.interiorObjects)
                      : m,
                  ),
                }))
              }
              title="Choosing a surface moves the capsule to that mount's preset and sets the look direction (baffle normal). Coordinates remain editable afterwards."
            />

            {microphone.mounting !== 'free' && (
              <>
                <div className="field-row">
                  <NumberField
                    label="Look nx"
                    step={0.05}
                    value={microphone.orientation.x}
                    onCommit={(x) =>
                      updateMicrophone(microphone.id, {
                        orientation: { ...microphone.orientation, x },
                      })
                    }
                    title="Capsule look direction (visualization). The rigid-baffle plane uses the mounting surface normal, not this vector. Directivity is not modeled."
                  />
                  <NumberField
                    label="Look ny"
                    step={0.05}
                    value={microphone.orientation.y}
                    onCommit={(y) =>
                      updateMicrophone(microphone.id, {
                        orientation: { ...microphone.orientation, y },
                      })
                    }
                  />
                  <NumberField
                    label="Look nz"
                    step={0.05}
                    value={microphone.orientation.z}
                    onCommit={(z) =>
                      updateMicrophone(microphone.id, {
                        orientation: { ...microphone.orientation, z },
                      })
                    }
                  />
                </div>
                <div className="spec-readout" style={{ marginTop: 4 }}>
                  <span className="item-meta">
                    {standoffOk
                      ? `${microphoneMountingLabel(microphone.mounting)} baffle · a = ${((baffle?.radiusMeters ?? 0) * 100).toFixed(0)} cm · β = ${(baffle?.absorptionCoefficient ?? 0).toFixed(2)} · standoff ${((baffle?.standoffMeters ?? 0) * 100).toFixed(1)} cm · f_c ≈ ${cutoffHz !== null ? Math.round(cutoffHz) : '—'} Hz`
                      : `Capsule is too far from the ${microphoneMountingLabel(microphone.mounting)} face (max ${MAX_MICROPHONE_MOUNT_STANDOFF_METERS} m).`}
                  </span>
                </div>
              </>
            )}
          </div>
        );
      })}

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
