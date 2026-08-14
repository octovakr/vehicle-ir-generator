import type { SoundSourceConfig } from '../acoustic/types';
import { generateRoboticSpeech } from '../audio/generatedSpeech';
import { decodeAudioFile } from '../audio/decode';
import type { SourceFileAudio } from './store';

/**
 * Resolve the dry (anechoic) signal of a source at the requested sample rate.
 *
 * - Generated sources are synthesized deterministically from their seed.
 * - File sources are decoded from the stored raw bytes; the decode result is
 *   cached per sample rate by the caller via `onDecoded`.
 *
 * The source gain is applied here so the engine/worker receives final dry
 * signals. Throws human-readable errors (e.g. missing file audio).
 */
export async function resolveSourceSignal(
  source: SoundSourceConfig,
  fileAudio: SourceFileAudio | undefined,
  sampleRateHz: number,
  onDecoded?: (decoded: { sampleRateHz: number; samples: Float32Array }) => void,
): Promise<Float32Array> {
  let dry: Float32Array;

  if (source.audio.kind === 'generated') {
    dry = generateRoboticSpeech(source.audio.seed, source.audio.durationSeconds, sampleRateHz);
  } else {
    if (!fileAudio) {
      throw new Error(`Source "${source.label}" has no audio file loaded.`);
    }
    if (fileAudio.decoded && fileAudio.decoded.sampleRateHz === sampleRateHz) {
      dry = fileAudio.decoded.samples;
    } else {
      const decoded = await decodeAudioFile(fileAudio.rawData, fileAudio.fileName, sampleRateHz);
      onDecoded?.({ sampleRateHz, samples: decoded.samples });
      dry = decoded.samples;
    }
  }

  if (source.gain === 1) return dry.slice();
  const scaled = new Float32Array(dry.length);
  for (let i = 0; i < dry.length; i++) scaled[i] = dry[i] * source.gain;
  return scaled;
}
