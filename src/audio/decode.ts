/**
 * Local audio file decoding (renderer only — uses WebAudio).
 *
 * All internal processing uses mono Float32 at the simulation sample rate.
 * Decoding, downmixing and resampling are explicit steps here; nothing else
 * in the pipeline silently changes sample rates (rule 11).
 */

export interface DecodedAudio {
  samples: Float32Array;
  sampleRateHz: number;
  fileName: string;
  /** Sample rate of the original file before explicit resampling, Hz. */
  originalSampleRateHz: number;
  originalChannelCount: number;
}

/**
 * Decode a local audio file (WAV/MP3/FLAC/OGG/… — anything the platform codec
 * supports), downmix to mono by channel averaging, and explicitly resample to
 * `targetSampleRateHz` using an OfflineAudioContext.
 *
 * Throws a human-readable Error for malformed/unsupported files.
 */
export async function decodeAudioFile(
  data: ArrayBuffer,
  fileName: string,
  targetSampleRateHz: number,
): Promise<DecodedAudio> {
  const probeContext = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await probeContext.decodeAudioData(data.slice(0));
  } catch {
    throw new Error(
      `"${fileName}" could not be decoded. Please choose a valid WAV/MP3/FLAC/OGG audio file.`,
    );
  } finally {
    void probeContext.close();
  }

  if (decoded.length === 0) {
    throw new Error(`"${fileName}" contains no audio samples.`);
  }

  // Explicit mono downmix: average all channels.
  const mono = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const channelData = decoded.getChannelData(channel);
    for (let i = 0; i < channelData.length; i++) mono[i] += channelData[i];
  }
  const channelScale = 1 / decoded.numberOfChannels;
  for (let i = 0; i < mono.length; i++) mono[i] *= channelScale;

  let samples: Float32Array = mono;
  if (decoded.sampleRate !== targetSampleRateHz) {
    samples = await resample(mono, decoded.sampleRate, targetSampleRateHz);
  }

  return {
    samples,
    sampleRateHz: targetSampleRateHz,
    fileName,
    originalSampleRateHz: decoded.sampleRate,
    originalChannelCount: decoded.numberOfChannels,
  };
}

/** Explicit resampling via OfflineAudioContext (platform-quality sinc resampler). */
async function resample(
  samples: Float32Array,
  fromRateHz: number,
  toRateHz: number,
): Promise<Float32Array> {
  const outputLength = Math.ceil((samples.length * toRateHz) / fromRateHz);
  const offline = new OfflineAudioContext(1, outputLength, toRateHz);
  const buffer = offline.createBuffer(1, samples.length, fromRateHz);
  buffer.getChannelData(0).set(samples);
  const bufferSource = offline.createBufferSource();
  bufferSource.buffer = buffer;
  bufferSource.connect(offline.destination);
  bufferSource.start();
  const rendered = await offline.startRendering();
  return new Float32Array(rendered.getChannelData(0));
}
