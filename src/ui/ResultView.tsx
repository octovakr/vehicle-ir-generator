import React, { useEffect, useMemo, useState } from 'react';
import type { ImpulseResponse } from '../acoustic/types';
import { encodeWavFloat32, encodeWavPcm16 } from '../audio/wav';
import { playSamples, stopPlayback } from '../audio/playback';
import { normalizeIfClipping } from '../dsp/convolution';
import { saveLocalFile } from '../platform/fileSystem';
import { useStore, type SimulationResult } from '../state/store';
import { WaveformPlot, SpectrumPlot } from './plots';

export function ResultView(): React.JSX.Element {
  const { state } = useStore();
  const result = state.result;

  if (!result) {
    return (
      <div className="empty-state">
        No simulation result yet. Configure the scene and click Generate.
      </div>
    );
  }
  return <ResultContent result={result} />;
}

function ResultContent({ result }: { result: SimulationResult }): React.JSX.Element {
  const config = result.configSnapshot;
  const [playing, setPlaying] = useState<string | null>(null);

  const [selectedInputId, setSelectedInputId] = useState<'mix' | string>('mix');
  const [selectedIrIndex, setSelectedIrIndex] = useState(0);
  const [selectedMicId, setSelectedMicId] = useState(
    result.microphoneSignals[0]?.microphoneId ?? '',
  );

  // Reset selections and stop audio when a new result arrives.
  useEffect(() => {
    setSelectedInputId('mix');
    setSelectedIrIndex(0);
    setSelectedMicId(result.microphoneSignals[0]?.microphoneId ?? '');
    stopPlayback();
    setPlaying(null);
  }, [result]);

  const sourceLabel = (id: string): string =>
    config.sources.find((s) => s.id === id)?.label ?? id;
  const microphoneLabel = (id: string): string =>
    config.microphones.find((m) => m.id === id)?.label ?? id;

  const inputSamples = useMemo(() => {
    if (selectedInputId === 'mix') return result.mixedInput;
    return (
      result.sourceSignals.find((s) => s.sourceId === selectedInputId)?.samples ??
      result.mixedInput
    );
  }, [selectedInputId, result]);

  const selectedIr: ImpulseResponse | undefined = result.impulseResponses[selectedIrIndex];
  const selectedMicSignal = result.microphoneSignals.find(
    (m) => m.microphoneId === selectedMicId,
  );

  const togglePlay = (key: string, samples: Float32Array): void => {
    if (playing === key) {
      stopPlayback();
      setPlaying(null);
      return;
    }
    setPlaying(key);
    playSamples(normalizeIfClipping(samples), result.sampleRateHz, () => setPlaying(null));
  };

  const saveIr = async (ir: ImpulseResponse): Promise<void> => {
    const baseName = `ir_${sanitize(sourceLabel(ir.sourceId))}_${sanitize(microphoneLabel(ir.microphoneId))}`;
    // 32-bit float WAV: lossless for the internal Float32 representation.
    await saveLocalFile(`${baseName}.wav`, encodeWavFloat32(ir.samples, ir.sampleRateHz), 'WAV audio', ['wav']);
    const metadataJson = JSON.stringify(ir.metadata, null, 2);
    await saveLocalFile(
      `${baseName}.json`,
      new TextEncoder().encode(metadataJson).buffer as ArrayBuffer,
      'JSON metadata',
      ['json'],
    );
  };

  const saveMicSignal = async (): Promise<void> => {
    if (!selectedMicSignal) return;
    await saveLocalFile(
      `rendered_${sanitize(microphoneLabel(selectedMicSignal.microphoneId))}.wav`,
      encodeWavPcm16(normalizeIfClipping(selectedMicSignal.samples), result.sampleRateHz),
      'WAV audio',
      ['wav'],
    );
  };

  return (
    <div className="result-view">
      {/* ── Input signal ─────────────────────────────────── */}
      <div className="result-card">
        <div className="result-card-header">
          <span className="result-card-title">Input signal (dry)</span>
          <select value={selectedInputId} onChange={(e) => setSelectedInputId(e.target.value)}>
            <option value="mix">Mixed input (all enabled sources)</option>
            {result.sourceSignals.map((s) => (
              <option key={s.sourceId} value={s.sourceId}>
                {sourceLabel(s.sourceId)}
              </option>
            ))}
          </select>
          <button className="btn small" onClick={() => togglePlay('input', inputSamples)}>
            {playing === 'input' ? '■ Stop' : '▶ Play'}
          </button>
        </div>
        <div className="plot-grid">
          <WaveformPlot title="Time domain" samples={inputSamples} sampleRateHz={result.sampleRateHz} />
          <SpectrumPlot title="Frequency domain" samples={inputSamples} sampleRateHz={result.sampleRateHz} />
        </div>
      </div>

      {/* ── Impulse responses ────────────────────────────── */}
      <div className="result-card">
        <div className="result-card-header">
          <span className="result-card-title">
            Impulse responses ({result.impulseResponses.length})
          </span>
          <select
            value={selectedIrIndex}
            onChange={(e) => setSelectedIrIndex(Number(e.target.value))}
          >
            {result.impulseResponses.map((ir, index) => (
              <option key={`${ir.sourceId}-${ir.microphoneId}`} value={index}>
                {sourceLabel(ir.sourceId)} → {microphoneLabel(ir.microphoneId)}
              </option>
            ))}
          </select>
          {selectedIr && (
            <>
              <button
                className="btn small"
                onClick={() => togglePlay('ir', selectedIr.samples)}
                title="Play the raw impulse response"
              >
                {playing === 'ir' ? '■ Stop' : '▶ Play IR'}
              </button>
              <button className="btn small primary" onClick={() => void saveIr(selectedIr)}>
                Save IR (WAV + metadata)
              </button>
            </>
          )}
        </div>
        {selectedIr && (
          <>
            <div className="plot-grid">
              <WaveformPlot
                title="h[n] — amplitude vs time"
                samples={selectedIr.samples}
                sampleRateHz={selectedIr.sampleRateHz}
                color="#e0964f"
              />
              <SpectrumPlot
                title="|H(f)|"
                samples={selectedIr.samples}
                sampleRateHz={selectedIr.sampleRateHz}
                color="#e0964f"
              />
            </div>
            <div className="result-meta">
              {selectedIr.metadata.imageSourceCount.toLocaleString()} image sources · c ={' '}
              {selectedIr.metadata.speedOfSoundMetersPerSecond.toFixed(1)} m/s · max order{' '}
              {selectedIr.metadata.maxReflectionOrder} · {selectedIr.sampleRateHz} Hz ·{' '}
              {selectedIr.metadata.irDurationSeconds} s ·{' '}
              {selectedIr.metadata.vehicleModelId === 'rectangular'
                ? 'rectangular'
                : selectedIr.metadata.vehicleModelId === 'ioniq5-2026'
                  ? '2026 IONIQ 5'
                  : '2026 Tucson'}{' '}
              cabin {selectedIr.metadata.vehicle.widthMeters.toFixed(3)}×
              {selectedIr.metadata.vehicle.lengthMeters.toFixed(3)}×
              {selectedIr.metadata.vehicle.heightMeters.toFixed(3)} m
              {Object.keys(selectedIr.metadata.interiorObjectAbsorption).length > 0
                ? ` · ${Object.keys(selectedIr.metadata.interiorObjectAbsorption).length} interior objects`
                : ''}
              {selectedIr.metadata.occupants.filter((occupant) => occupant.enabled).length > 0
                ? ` · ${selectedIr.metadata.occupants.filter((occupant) => occupant.enabled).length} occupant(s)`
                : ''}
              {selectedIr.metadata.microphoneBaffle
                ? ` · ${selectedIr.metadata.microphoneMounting} baffle a=${(selectedIr.metadata.microphoneBaffle.radiusMeters * 100).toFixed(0)} cm`
                : ' · free-field mic'}
            </div>
          </>
        )}
      </div>

      {/* ── Rendered microphone signals ──────────────────── */}
      <div className="result-card">
        <div className="result-card-header">
          <span className="result-card-title">Rendered microphone signal (reverberant)</span>
          <select value={selectedMicId} onChange={(e) => setSelectedMicId(e.target.value)}>
            {result.microphoneSignals.map((m) => (
              <option key={m.microphoneId} value={m.microphoneId}>
                {microphoneLabel(m.microphoneId)}
              </option>
            ))}
          </select>
          {selectedMicSignal && (
            <>
              <button
                className="btn small"
                onClick={() => togglePlay('mic', selectedMicSignal.samples)}
              >
                {playing === 'mic' ? '■ Stop' : '▶ Play'}
              </button>
              <button className="btn small" onClick={() => void saveMicSignal()}>
                Save WAV
              </button>
            </>
          )}
        </div>
        {selectedMicSignal && (
          <div className="plot-grid">
            <WaveformPlot
              title="Time domain"
              samples={selectedMicSignal.samples}
              sampleRateHz={result.sampleRateHz}
              color="#58a6ff"
            />
            <SpectrumPlot
              title="Frequency domain"
              samples={selectedMicSignal.samples}
              sampleRateHz={result.sampleRateHz}
              color="#58a6ff"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]+/g, '_');
}
