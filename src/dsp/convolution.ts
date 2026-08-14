import { fftInPlace, ifftInPlace, nextPowerOfTwo } from './fft';

/**
 * Linear convolution y = x * h via a single zero-padded FFT.
 *
 *   y[n] = Σ_k x[k] · h[n − k],   length(y) = length(x) + length(h) − 1
 *
 * FFT size = nextPowerOfTwo(Nx + Nh − 1). For the signal lengths this
 * application handles (seconds of speech at ≤ 96 kHz convolved with sub-second
 * IRs) a single big FFT is both simple and fast; block-based overlap-add is
 * unnecessary complexity here.
 */
export function convolve(x: Float32Array, h: Float32Array): Float32Array {
  if (x.length === 0 || h.length === 0) return new Float32Array(0);

  const outputLength = x.length + h.length - 1;
  const fftSize = nextPowerOfTwo(outputLength);

  const xReal = new Float64Array(fftSize);
  const xImag = new Float64Array(fftSize);
  const hReal = new Float64Array(fftSize);
  const hImag = new Float64Array(fftSize);
  xReal.set(x);
  hReal.set(h);

  fftInPlace(xReal, xImag);
  fftInPlace(hReal, hImag);

  // Pointwise complex multiplication X·H (result stored back into x buffers).
  for (let i = 0; i < fftSize; i++) {
    const real = xReal[i] * hReal[i] - xImag[i] * hImag[i];
    const imag = xReal[i] * hImag[i] + xImag[i] * hReal[i];
    xReal[i] = real;
    xImag[i] = imag;
  }

  ifftInPlace(xReal, xImag);

  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) output[i] = xReal[i];
  return output;
}

/** Mix (sum) several equal-rate signals; output length is the longest input. */
export function mixSignals(signals: Float32Array[]): Float32Array {
  const length = signals.reduce((max, s) => Math.max(max, s.length), 0);
  const mixed = new Float32Array(length);
  for (const signal of signals) {
    for (let i = 0; i < signal.length; i++) mixed[i] += signal[i];
  }
  return mixed;
}

/** Peak-normalize to `targetPeak` if the signal exceeds it (prevents clipping). */
export function normalizeIfClipping(signal: Float32Array, targetPeak = 0.98): Float32Array {
  let peak = 0;
  for (let i = 0; i < signal.length; i++) {
    const abs = Math.abs(signal[i]);
    if (abs > peak) peak = abs;
  }
  if (peak <= targetPeak || peak === 0) return signal;
  const scale = targetPeak / peak;
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) out[i] = signal[i] * scale;
  return out;
}
