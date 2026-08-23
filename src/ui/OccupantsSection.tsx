import React from 'react';
import type { OccupantConfig, OccupantSeatId, SimulationConfig } from '../acoustic/types';
import { MAX_OCCUPANTS } from '../acoustic/constants';
import { createCustomMaterial, getMaterialPreset, MATERIAL_PRESETS } from '../acoustic/materials';
import { OCCUPANT_SEAT_OPTIONS, occupantHipPreset, occupantMouthPosition } from '../acoustic/occupants';
import { useStore } from '../state/store';
import { createDefaultOccupant } from '../state/defaults';
import { NumberField, Section, SelectField } from './common';

const SEAT_OPTIONS = OCCUPANT_SEAT_OPTIONS.map((option) => ({
  value: String(option.seat),
  label: option.label,
}));

const CLOTHING_OPTIONS = [
  ...MATERIAL_PRESETS.map((material) => ({
    value: material.id,
    label: `${material.name} (β=${material.absorptionCoefficient})`,
  })),
  { value: 'custom', label: 'Custom…' },
];

export function OccupantsSection(): React.JSX.Element {
  const { state, dispatch } = useStore();
  const { config } = state;

  const updateConfig = (update: (c: SimulationConfig) => SimulationConfig): void =>
    dispatch({ type: 'config/update', update });

  const updateOccupant = (id: string, patch: Partial<OccupantConfig>): void =>
    updateConfig((c) => ({
      ...c,
      occupants: c.occupants.map((occupant) => (occupant.id === id ? { ...occupant, ...patch } : occupant)),
    }));

  const addOccupant = (): void =>
    updateConfig((c) => {
      const occupied = new Set(c.occupants.map((occupant) => occupant.seat));
      const seat = ([1, 2, 3, 4] as const).find((candidate) => !occupied.has(candidate));
      if (seat === undefined) return c;
      return {
        ...c,
        occupants: [...c.occupants, createDefaultOccupant(seat, c.vehicle, c.interiorObjects)],
      };
    });

  const removeOccupant = (id: string): void =>
    updateConfig((c) => ({
      ...c,
      occupants: c.occupants.filter((occupant) => occupant.id !== id),
    }));

  return (
    <Section title={`Occupants (${config.occupants.length})`}>
      <div className="section-note">
        Average seated adult (50th-percentile anthropometry). Each occupant is an absorbing and
        reflecting volume in the IR. This is an AABB / clothing-β approximation — not a scanned
        body mesh. Speech sources stay independent point sources; the mouth coordinate below is a
        placement hint only.
      </div>

      {config.occupants.map((occupant) => {
        const mouth = occupantMouthPosition(occupant.hipPosition);
        return (
          <div className="item-card" key={occupant.id}>
            <div className="item-card-header">
              <span className="item-dot occupant" />
              <span className="item-title">{occupant.label}</span>
              <label
                className="item-meta"
                style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={occupant.enabled}
                  onChange={(e) => updateOccupant(occupant.id, { enabled: e.target.checked })}
                />
                On
              </label>
              <button
                className="btn small ghost-danger"
                onClick={() => removeOccupant(occupant.id)}
                title="Remove occupant"
              >
                ✕
              </button>
            </div>

            <SelectField
              label="Seat"
              value={String(occupant.seat)}
              options={SEAT_OPTIONS.filter((option) => {
                const seat = Number(option.value) as OccupantSeatId;
                return (
                  seat === occupant.seat ||
                  !config.occupants.some((other) => other.id !== occupant.id && other.seat === seat)
                );
              })}
              onChange={(value) => {
                const seat = Number(value) as OccupantSeatId;
                updateOccupant(occupant.id, {
                  seat,
                  label: OCCUPANT_SEAT_OPTIONS.find((option) => option.seat === seat)?.label ?? occupant.label,
                  hipPosition: occupantHipPreset(seat, config.vehicle, config.interiorObjects),
                });
              }}
              title="Moves the occupant to that seating preset. Hip coordinates stay fully editable."
            />

            <div className="field-row">
              <NumberField
                label="Hip x"
                unit="m"
                step={0.05}
                value={occupant.hipPosition.x}
                onCommit={(x) =>
                  updateOccupant(occupant.id, { hipPosition: { ...occupant.hipPosition, x } })
                }
              />
              <NumberField
                label="Hip y"
                unit="m"
                step={0.05}
                value={occupant.hipPosition.y}
                onCommit={(y) =>
                  updateOccupant(occupant.id, { hipPosition: { ...occupant.hipPosition, y } })
                }
              />
              <NumberField
                label="Hip z"
                unit="m"
                step={0.05}
                value={occupant.hipPosition.z}
                onCommit={(z) =>
                  updateOccupant(occupant.id, { hipPosition: { ...occupant.hipPosition, z } })
                }
              />
            </div>

            <div className="field-row">
              <SelectField
                label="Clothing"
                value={occupant.material.isCustom ? 'custom' : occupant.material.id}
                options={CLOTHING_OPTIONS}
                onChange={(materialId) => {
                  const material =
                    materialId === 'custom'
                      ? createCustomMaterial(occupant.material.absorptionCoefficient)
                      : { ...getMaterialPreset(materialId)! };
                  updateOccupant(occupant.id, { material });
                }}
                title="Energy absorption coefficient β of the occupant surface. Clothing (average adult) is the default approximation."
              />
              {occupant.material.isCustom ? (
                <NumberField
                  label="β"
                  step={0.01}
                  min={0}
                  max={1}
                  value={occupant.material.absorptionCoefficient}
                  onCommit={(absorptionCoefficient) =>
                    updateOccupant(occupant.id, {
                      material: createCustomMaterial(absorptionCoefficient),
                    })
                  }
                  title="Energy absorption coefficient, 0 ≤ β ≤ 1."
                />
              ) : (
                <div className="field" style={{ maxWidth: 64 }}>
                  <label>β</label>
                  <input type="text" value={occupant.material.absorptionCoefficient} readOnly disabled />
                </div>
              )}
            </div>

            <div className="item-meta">
              Mouth hint: x {fmt(mouth.x)} · y {fmt(mouth.y)} · z {fmt(mouth.z)} m
            </div>
          </div>
        );
      })}

      <div className="field-row">
        <button
          className="btn"
          onClick={addOccupant}
          disabled={config.occupants.length >= MAX_OCCUPANTS}
        >
          + Add occupant
        </button>
      </div>
    </Section>
  );
}

function fmt(value: number): string {
  return (Math.round(value * 1000) / 1000).toFixed(3);
}
