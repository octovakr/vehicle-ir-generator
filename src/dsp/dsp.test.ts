import { describe, expect, it } from 'vitest';
import { convolve, mixSignals } from './convolution';
import { fftInPlace, ifftInPlace } from './fft';
import { generateRoboticSpeech } from '../audio/generatedSpeech';

describe('FFT', () => {
  it('inverse FFT recovers the original signal', () => {
    const n = 64;
    const real = new Float64Array(n);
    const imag = new Float64Array(n);
    const original = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      original[i] = Math.sin((2 * Math.PI * 3 * i) / n) + 0.5 * Math.cos((2 * Math.PI * 7 * i) / n);
      real[i] = original[i];
    }
    fftInPlace(real, imag);
    ifftInPlace(real, imag);
    for (let i = 0; i < n; i++) {
      expect(real[i]).toBeCloseTo(original[i], 8);
    }
  });
});

describe('convolution', () => {
  it('matches direct time-domain convolution', () => {
    const x = new Float32Array([1, 0.5, -0.25, 0.125, 0.7]);
    const h = new Float32Array([0.9, 0.3, -0.1]);
    const result = convolve(x, h);

    const expected = new Float32Array(x.length + h.length - 1);
    for (let n = 0; n < expected.length; n++) {
      for (let k = 0; k < h.length; k++) {
        if (n - k >= 0 && n - k < x.length) expected[n] += x[n - k] * h[k];
      }
    }
    expect(result.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(result[i]).toBeCloseTo(expected[i], 5);
    }
  });

  it('convolving with a unit impulse returns the signal', () => {
    const x = new Float32Array([0.2, -0.4, 0.6, 0.1]);
    const identity = new Float32Array([1]);
    const result = convolve(x, identity);
    for (let i = 0; i < x.length; i++) expect(result[i]).toBeCloseTo(x[i], 6);
  });
});

describe('mixing', () => {
  it('sums signals of different lengths', () => {
    const mixed = mixSignals([new Float32Array([1, 1]), new Float32Array([1, 1, 1])]);
    expect(Array.from(mixed)).toEqual([2, 2, 1]);
  });
});

describe('generated speech determinism', () => {
  it('same seed produces identical audio; different seeds differ', () => {
    const a = generateRoboticSpeech(7, 0.5, 16000);
    const b = generateRoboticSpeech(7, 0.5, 16000);
    const c = generateRoboticSpeech(8, 0.5, 16000);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });
});
