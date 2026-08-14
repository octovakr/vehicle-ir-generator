/**
 * Minimal WAV (RIFF) encoder.
 *
 * IRs are exported as 32-bit IEEE float mono WAV so that no quantization is
 * applied to the impulse response (lossless for the internal Float32
 * representation, directly loadable by numpy/scipy/librosa/soundfile).
 * Rendered audio uses 16-bit PCM, which is sufficient for preview signals.
 */

export function encodeWavFloat32(samples: Float32Array, sampleRateHz: number): ArrayBuffer {
  const headerBytes = 44;
  const dataBytes = samples.length * 4;
  const buffer = new ArrayBuffer(headerBytes + dataBytes);
  const view = new DataView(buffer);
  writeWavHeader(view, {
    audioFormat: 3, // IEEE float
    bitsPerSample: 32,
    sampleRateHz,
    channelCount: 1,
    dataBytes,
  });
  let offset = headerBytes;
  for (let i = 0; i < samples.length; i++) {
    view.setFloat32(offset, samples[i], true);
    offset += 4;
  }
  return buffer;
}

export function encodeWavPcm16(samples: Float32Array, sampleRateHz: number): ArrayBuffer {
  const headerBytes = 44;
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(headerBytes + dataBytes);
  const view = new DataView(buffer);
  writeWavHeader(view, {
    audioFormat: 1, // PCM
    bitsPerSample: 16,
    sampleRateHz,
    channelCount: 1,
    dataBytes,
  });
  let offset = headerBytes;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, Math.round(clamped * 32767), true);
    offset += 2;
  }
  return buffer;
}

interface WavHeaderParams {
  audioFormat: 1 | 3;
  bitsPerSample: number;
  sampleRateHz: number;
  channelCount: number;
  dataBytes: number;
}

function writeWavHeader(view: DataView, params: WavHeaderParams): void {
  const { audioFormat, bitsPerSample, sampleRateHz, channelCount, dataBytes } = params;
  const blockAlign = (channelCount * bitsPerSample) / 8;
  const byteRate = sampleRateHz * blockAlign;

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, audioFormat, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRateHz, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}
