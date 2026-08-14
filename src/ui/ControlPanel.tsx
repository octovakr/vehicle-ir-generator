import React from 'react';
import type { SimulationConfig } from '../acoustic/types';
import { speedOfSoundMetersPerSecond } from '../acoustic/environment';
import { validateSimulationConfig } from '../acoustic/validation';
import {
  MAX_REFLECTION_ORDER_LIMIT,
  MIN_IR_DURATION_SECONDS,
  MAX_IR_DURATION_SECONDS,
} from '../acoustic/constants';
import { useStore } from '../state/store';
import { NumberField, Section, SelectField } from './common';
import { SourcesSection } from './SourcesSection';
import { MicrophonesSection } from './MicrophonesSection';
import { MaterialsSection } from './MaterialsSection';

const SAMPLE_RATE_OPTIONS = [
  { value: '8000', label: '8 000 Hz' },
  { value: '16000', label: '16 000 Hz' },
  { value: '24000', label: '24 000 Hz' },
  { value: '44100', label: '44 100 Hz' },
  { value: '48000', label: '48 000 Hz' },
];

export function ControlPanel({ onGenerate }: { onGenerate: () => void }): React.JSX.Element {
  const { state, dispatch } = useStore();
  const { config, isGenerating, generationProgress } = state;

  const updateConfig = (update: (c: SimulationConfig) => SimulationConfig): void =>
    dispatch({ type: 'config/update', update });

  const validationErrors = validateSimulationConfig(config);
  const speedOfSound = speedOfSoundMetersPerSecond(config.environment);

  return (
    <div className="control-panel">
      <SourcesSection />
      <MicrophonesSection />

      <Section title="Vehicle" defaultOpen={false}>
        <div className="section-note">
          Interior modeled as a rectangular enclosure. x spans the width, y the length (0 = front),
          z the height.
        </div>
        <div className="field-row">
          <NumberField
            label="Width"
            unit="m"
            step={0.05}
            value={config.vehicle.widthMeters}
            onCommit={(widthMeters) =>
              updateConfig((c) => ({ ...c, vehicle: { ...c.vehicle, widthMeters } }))
            }
          />
          <NumberField
            label="Length"
            unit="m"
            step={0.05}
            value={config.vehicle.lengthMeters}
            onCommit={(lengthMeters) =>
              updateConfig((c) => ({ ...c, vehicle: { ...c.vehicle, lengthMeters } }))
            }
          />
          <NumberField
            label="Height"
            unit="m"
            step={0.05}
            value={config.vehicle.heightMeters}
            onCommit={(heightMeters) =>
              updateConfig((c) => ({ ...c, vehicle: { ...c.vehicle, heightMeters } }))
            }
          />
        </div>
      </Section>

      <MaterialsSection />

      <Section title="Environment" defaultOpen={false}>
        <div className="field-row">
          <NumberField
            label="Temperature"
            unit="°C"
            step={1}
            value={config.environment.temperatureCelsius}
            onCommit={(temperatureCelsius) =>
              updateConfig((c) => ({
                ...c,
                environment: { ...c.environment, temperatureCelsius },
              }))
            }
          />
          <NumberField
            label="Rel. humidity"
            unit="%"
            step={5}
            min={0}
            max={100}
            value={config.environment.relativeHumidityPercent}
            onCommit={(relativeHumidityPercent) =>
              updateConfig((c) => ({
                ...c,
                environment: { ...c.environment, relativeHumidityPercent },
              }))
            }
          />
        </div>
        <div className="section-note">
          Resulting speed of sound: <b>{speedOfSound.toFixed(1)} m/s</b> (linear approximation
          c ≈ 331.4 + 0.6·T + 0.0124·RH).
        </div>
      </Section>

      <Section title="Simulation" defaultOpen={false}>
        <SelectField
          label="Sample rate"
          value={String(config.simulation.sampleRateHz)}
          options={SAMPLE_RATE_OPTIONS}
          onChange={(value) =>
            updateConfig((c) => ({
              ...c,
              simulation: { ...c.simulation, sampleRateHz: Number(value) },
            }))
          }
          title="Sample rate of generated IRs and rendered audio. Loaded files are explicitly resampled to this rate."
        />
        <div className="field-row">
          <NumberField
            label="IR duration"
            unit="s"
            step={0.05}
            min={MIN_IR_DURATION_SECONDS}
            max={MAX_IR_DURATION_SECONDS}
            value={config.simulation.irDurationSeconds}
            onCommit={(irDurationSeconds) =>
              updateConfig((c) => ({
                ...c,
                simulation: { ...c.simulation, irDurationSeconds },
              }))
            }
          />
          <NumberField
            label="Max order"
            step={1}
            min={0}
            max={MAX_REFLECTION_ORDER_LIMIT}
            value={config.simulation.maxReflectionOrder}
            onCommit={(maxReflectionOrder) =>
              updateConfig((c) => ({
                ...c,
                simulation: { ...c.simulation, maxReflectionOrder },
              }))
            }
            title="Maximum image-source reflection order. 0 = direct path only."
          />
          <NumberField
            label="Seed"
            step={1}
            value={config.simulation.randomSeed}
            onCommit={(randomSeed) =>
              updateConfig((c) => ({
                ...c,
                simulation: { ...c.simulation, randomSeed },
              }))
            }
            title="Random seed for reproducible generated audio."
          />
        </div>
      </Section>

      <div className="generate-area">
        {validationErrors.length > 0 && (
          <div className="validation-errors">
            {validationErrors.map((error) => (
              <div className="validation-error" key={error}>
                {error}
              </div>
            ))}
          </div>
        )}
        {isGenerating && generationProgress && (
          <>
            <div className="progress-bar">
              <div style={{ width: `${generationProgress.percent}%` }} />
            </div>
            <div className="progress-message">{generationProgress.message}</div>
          </>
        )}
        <button
          className="btn primary generate-btn"
          onClick={onGenerate}
          disabled={isGenerating || validationErrors.length > 0}
        >
          {isGenerating ? 'Generating…' : 'Generate impulse responses'}
        </button>
      </div>
    </div>
  );
}
