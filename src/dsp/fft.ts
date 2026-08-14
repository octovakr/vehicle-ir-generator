/**
 * Iterative radix-2 complex FFT (Cooley–Tukey, decimation in time).
 *
 * Pure, dependency-free implementation used by convolution and spectrum
 * visualization. Operates in place on separate real/imaginary Float64Array
 * buffers whose length must be a power of two.
 */

/** Smallest power of two ≥ n. */
export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place forward FFT. `real` and `imag` must have the same power-of-two length. */
export function fftInPlace(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  if (n !== imag.length || (n & (n - 1)) !== 0) {
    throw new Error(`FFT size must be a power of two (got ${n}).`);
  }

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = real[i];
      real[i] = real[j];
      real[j] = tr;
      const ti = imag[i];
      imag[i] = imag[j];
      imag[j] = ti;
    }
  }

  // Butterfly passes.
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRealStep = Math.cos(angle);
    const wImagStep = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wReal = 1;
      let wImag = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const evenIndex = i + k;
        const oddIndex = i + k + half;
        const oddReal = real[oddIndex] * wReal - imag[oddIndex] * wImag;
        const oddImag = real[oddIndex] * wImag + imag[oddIndex] * wReal;
        real[oddIndex] = real[evenIndex] - oddReal;
        imag[oddIndex] = imag[evenIndex] - oddImag;
        real[evenIndex] += oddReal;
        imag[evenIndex] += oddImag;
        const nextWReal = wReal * wRealStep - wImag * wImagStep;
        wImag = wReal * wImagStep + wImag * wRealStep;
        wReal = nextWReal;
      }
    }
  }
}

/** In-place inverse FFT (includes the 1/N normalization). */
export function ifftInPlace(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  // Conjugate → forward FFT → conjugate → scale.
  for (let i = 0; i < n; i++) imag[i] = -imag[i];
  fftInPlace(real, imag);
  for (let i = 0; i < n; i++) {
    real[i] /= n;
    imag[i] = -imag[i] / n;
  }
}
