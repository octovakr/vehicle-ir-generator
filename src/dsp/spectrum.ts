import { fftInPlace, nextPowerOfTwo } from './fft';

/**
 * Frequency-domain analysis used by the result view.
 *
 * Centralized STFT/spectrum parameters (rule 15) — every visualization uses
 * these instead of duplicating FFT sizes and windows.
 */
export const SPECTRUM_FFT_SIZE = 4096;
export const STFT_FFT_SIZE = 1024;
export const STFT_HOP_SIZE = 256;

/** Periodic Hann window w[n] = 0.5 · (1 − cos(2πn/N)). */
export function hannWindow(size: number): Float64Array {
  const window = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / size));
  }
  return window;
}

export interface MagnitudeSpectrum {
  /** Frequency of each bin, Hz (length = fftSize / 2 + 1). */
  frequenciesHz: Float32Array;
  /** Magnitude in dBFS-like scale: 20·log10(|X| + ε), Welch-averaged. */
  magnitudesDb: Float32Array;
}

/**
 * Welch-averaged magnitude spectrum of an arbitrary-length signal.
 *
 * The signal is split into Hann-windowed segments of SPECTRUM_FFT_SIZE with
 * 50 % overlap; power spectra are averaged, then converted to dB. Only the
 * magnitude is returned because the UI shows magnitude (rule 15); the
 * underlying computation keeps complex bins until the final |·|² step.
 */
export function computeMagnitudeSpectrum(
  signal: Float32Array,
  sampleRateHz: number,
): MagnitudeSpectrum {
  const fftSize = Math.min(SPECTRUM_FFT_SIZE, nextPowerOfTwo(Math.max(signal.length, 2)));
  const hop = fftSize / 2;
  const window = hannWindow(fftSize);
  const binCount = fftSize / 2 + 1;

  const averagedPower = new Float64Array(binCount);
  let segmentCount = 0;

  const real = new Float64Array(fftSize);
  const imag = new Float64Array(fftSize);

  for (let start = 0; start === 0 || start + fftSize <= signal.length; start += hop) {
    real.fill(0);
    imag.fill(0);
    const available = Math.min(fftSize, signal.length - start);
    for (let i = 0; i < available; i++) real[i] = signal[start + i] * window[i];

    fftInPlace(real, imag);
    for (let bin = 0; bin < binCount; bin++) {
      averagedPower[bin] += real[bin] * real[bin] + imag[bin] * imag[bin];
    }
    segmentCount++;
  }

  const frequenciesHz = new Float32Array(binCount);
  const magnitudesDb = new Float32Array(binCount);
  const epsilon = 1e-12;
  for (let bin = 0; bin < binCount; bin++) {
    frequenciesHz[bin] = (bin * sampleRateHz) / fftSize;
    const meanPower = averagedPower[bin] / Math.max(segmentCount, 1);
    magnitudesDb[bin] = 10 * Math.log10(meanPower + epsilon);
  }
  return { frequenciesHz, magnitudesDb };
}
