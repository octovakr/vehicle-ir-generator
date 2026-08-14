import React, { useEffect, useRef } from 'react';
import { computeMagnitudeSpectrum } from '../dsp/spectrum';

/**
 * Canvas-based plots for the result view. Plots only read the sample buffers
 * they are given — visualization never modifies the underlying signal
 * (rule 14).
 */

const PLOT_HEIGHT_PX = 170;
const AXIS_COLOR = '#3a3e45';
const GRID_COLOR = '#22252a';
const LABEL_COLOR = '#8a8f97';
const LABEL_FONT = '10px Inter, sans-serif';

function usePlotCanvas(
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
): React.RefObject<HTMLCanvasElement> {
  const canvasRef = useRef<HTMLCanvasElement>(null) as React.RefObject<HTMLCanvasElement>;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = (): void => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const width = parent.clientWidth - 16;
      const height = PLOT_HEIGHT_PX;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      draw(ctx, width, height);
    };

    render();
    const observer = new ResizeObserver(render);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [draw]);

  return canvasRef;
}

/** Time-domain waveform with min/max envelope decimation. */
export function WaveformPlot({
  samples,
  sampleRateHz,
  color = '#7f8bd9',
  title,
}: {
  samples: Float32Array;
  sampleRateHz: number;
  color?: string;
  title: string;
}): React.JSX.Element {
  const canvasRef = usePlotCanvas(
    React.useCallback(
      (ctx, width, height) => {
        const plotLeft = 34;
        const plotBottom = height - 16;
        const plotTop = 6;
        const plotWidth = width - plotLeft - 6;
        const plotHeight = plotBottom - plotTop;
        if (plotWidth <= 0 || samples.length === 0) return;

        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
          const abs = Math.abs(samples[i]);
          if (abs > peak) peak = abs;
        }
        const yScale = peak > 0 ? plotHeight / 2 / peak : 1;
        const yMid = plotTop + plotHeight / 2;

        // Grid + axes
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(plotLeft, yMid);
        ctx.lineTo(plotLeft + plotWidth, yMid);
        ctx.stroke();
        ctx.strokeStyle = AXIS_COLOR;
        ctx.strokeRect(plotLeft, plotTop, plotWidth, plotHeight);

        // Time ticks
        const durationSeconds = samples.length / sampleRateHz;
        ctx.fillStyle = LABEL_COLOR;
        ctx.font = LABEL_FONT;
        ctx.textAlign = 'center';
        const tickCount = 5;
        for (let t = 0; t <= tickCount; t++) {
          const x = plotLeft + (t / tickCount) * plotWidth;
          const seconds = (t / tickCount) * durationSeconds;
          ctx.fillText(`${seconds.toFixed(seconds < 1 ? 2 : 1)}s`, x, height - 4);
        }
        ctx.textAlign = 'right';
        ctx.fillText(peak.toExponential(1), plotLeft - 3, plotTop + 8);
        ctx.fillText('0', plotLeft - 3, yMid + 3);

        // Min/max envelope per pixel column
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const samplesPerPixel = samples.length / plotWidth;
        for (let px = 0; px < plotWidth; px++) {
          const start = Math.floor(px * samplesPerPixel);
          const end = Math.min(Math.floor((px + 1) * samplesPerPixel) + 1, samples.length);
          let min = Infinity;
          let max = -Infinity;
          for (let i = start; i < end; i++) {
            if (samples[i] < min) min = samples[i];
            if (samples[i] > max) max = samples[i];
          }
          if (min === Infinity) continue;
          const x = plotLeft + px + 0.5;
          ctx.moveTo(x, yMid - max * yScale);
          ctx.lineTo(x, yMid - min * yScale + 1);
        }
        ctx.stroke();
      },
      [samples, sampleRateHz, color],
    ),
  );

  return (
    <div className="plot-container">
      <div className="plot-title">{title}</div>
      <canvas ref={canvasRef} />
    </div>
  );
}

/** Frequency-domain magnitude plot (Welch-averaged, dB scale). */
export function SpectrumPlot({
  samples,
  sampleRateHz,
  color = '#5fb3a1',
  title,
}: {
  samples: Float32Array;
  sampleRateHz: number;
  color?: string;
  title: string;
}): React.JSX.Element {
  const canvasRef = usePlotCanvas(
    React.useCallback(
      (ctx, width, height) => {
        if (samples.length === 0) return;
        const { frequenciesHz, magnitudesDb } = computeMagnitudeSpectrum(samples, sampleRateHz);

        const plotLeft = 38;
        const plotBottom = height - 16;
        const plotTop = 6;
        const plotWidth = width - plotLeft - 6;
        const plotHeight = plotBottom - plotTop;
        if (plotWidth <= 0) return;

        let maxDb = -Infinity;
        for (let i = 1; i < magnitudesDb.length; i++) {
          if (magnitudesDb[i] > maxDb) maxDb = magnitudesDb[i];
        }
        if (!Number.isFinite(maxDb)) maxDb = 0;
        const dynamicRangeDb = 80;
        const minDb = maxDb - dynamicRangeDb;

        ctx.strokeStyle = AXIS_COLOR;
        ctx.strokeRect(plotLeft, plotTop, plotWidth, plotHeight);
        ctx.fillStyle = LABEL_COLOR;
        ctx.font = LABEL_FONT;

        // dB grid lines every 20 dB
        ctx.textAlign = 'right';
        for (let db = 0; db <= dynamicRangeDb; db += 20) {
          const y = plotTop + (db / dynamicRangeDb) * plotHeight;
          ctx.strokeStyle = GRID_COLOR;
          ctx.beginPath();
          ctx.moveTo(plotLeft, y);
          ctx.lineTo(plotLeft + plotWidth, y);
          ctx.stroke();
          ctx.fillText(`${Math.round(maxDb - db)}`, plotLeft - 3, y + 3);
        }

        // Frequency ticks (linear axis)
        const nyquist = sampleRateHz / 2;
        ctx.textAlign = 'center';
        const freqTicks = 6;
        for (let t = 0; t <= freqTicks; t++) {
          const frequency = (t / freqTicks) * nyquist;
          const x = plotLeft + (t / freqTicks) * plotWidth;
          const label = frequency >= 1000 ? `${(frequency / 1000).toFixed(1)}k` : `${Math.round(frequency)}`;
          ctx.fillText(label, x, height - 4);
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let started = false;
        for (let bin = 1; bin < frequenciesHz.length; bin++) {
          const x = plotLeft + (frequenciesHz[bin] / nyquist) * plotWidth;
          const clampedDb = Math.max(magnitudesDb[bin], minDb);
          const y = plotTop + ((maxDb - clampedDb) / dynamicRangeDb) * plotHeight;
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      },
      [samples, sampleRateHz, color],
    ),
  );

  return (
    <div className="plot-container">
      <div className="plot-title">{title} — magnitude (dB) vs frequency (Hz)</div>
      <canvas ref={canvasRef} />
    </div>
  );
}
