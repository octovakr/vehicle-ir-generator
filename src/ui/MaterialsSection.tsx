import React from 'react';
import type { SimulationConfig, SurfaceId } from '../acoustic/types';
import { ALL_SURFACES } from '../acoustic/types';
import { createCustomMaterial, getMaterialPreset, MATERIAL_PRESETS } from '../acoustic/materials';
import { surfaceDisplayName } from '../acoustic/validation';
import { useStore } from '../state/store';
import { NumberField, Section, SelectField } from './common';

export function MaterialsSection(): React.JSX.Element {
  const { state, dispatch } = useStore();
  const { config } = state;
  const { materials } = config;

  const updateConfig = (update: (c: SimulationConfig) => SimulationConfig): void =>
    dispatch({ type: 'config/update', update });

  const setSurfaceMaterial = (surface: SurfaceId, materialId: string): void =>
    updateConfig((c) => {
      const material =
        materialId === 'custom'
          ? createCustomMaterial(c.materials[surface].absorptionCoefficient)
          : { ...getMaterialPreset(materialId)! };
      return { ...c, materials: { ...c.materials, [surface]: material } };
    });

  const setCustomAbsorption = (surface: SurfaceId, absorptionCoefficient: number): void =>
    updateConfig((c) => ({
      ...c,
      materials: { ...c.materials, [surface]: createCustomMaterial(absorptionCoefficient) },
    }));

  const materialOptions = [
    ...MATERIAL_PRESETS.map((m) => ({
      value: m.id,
      label: `${m.name} (β=${m.absorptionCoefficient})`,
    })),
    { value: 'custom', label: 'Custom…' },
  ];

  return (
    <Section title="Materials" defaultOpen={false}>
      <div className="section-note">
        β is the broadband energy absorption coefficient (0 = fully reflective, 1 = fully
        absorptive). Preset values are approximations averaged over 250 Hz – 4 kHz.
      </div>
      {config.interiorObjects.length > 0 && (
        <div className="section-note">
          Interior objects use catalog materials (not editable here) and participate in the IR as
          absorbing volumes plus first-order face reflections:
          <ul className="provenance-list">
            {config.interiorObjects.map((object) => (
              <li key={object.id}>
                {object.label}: {object.material.name} (β={object.material.absorptionCoefficient})
              </li>
            ))}
          </ul>
        </div>
      )}
      {config.occupants.some((occupant) => occupant.enabled) && (
        <div className="section-note">
          Enabled occupants add extra body volumes (Occupants section). Clothing β is an
          approximation, not a measured in-car insertion loss.
        </div>
      )}
      {ALL_SURFACES.map((surface) => {
        const material = materials[surface];
        return (
          <div className="field-row" key={surface}>
            <SelectField
              label={surfaceDisplayName(surface)}
              value={material.isCustom ? 'custom' : material.id}
              options={materialOptions}
              onChange={(id) => setSurfaceMaterial(surface, id)}
            />
            {material.isCustom ? (
              <NumberField
                label="β"
                step={0.01}
                min={0}
                max={1}
                value={material.absorptionCoefficient}
                onCommit={(beta) => setCustomAbsorption(surface, beta)}
                title="Energy absorption coefficient, 0 ≤ β ≤ 1."
              />
            ) : (
              <div className="field" style={{ maxWidth: 64 }}>
                <label>β</label>
                <input type="text" value={material.absorptionCoefficient} readOnly disabled />
              </div>
            )}
          </div>
        );
      })}
    </Section>
  );
}
