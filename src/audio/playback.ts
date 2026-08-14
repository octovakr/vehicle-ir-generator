/**
 * Local audio preview playback (renderer only — uses WebAudio).
 *
 * Playback is deliberately isolated from the acoustic engine and DSP code:
 * it consumes plain Float32Array sample buffers and knows nothing about how
 * they were produced (rule 12).
 */

let sharedContext: AudioContext | null = null;
let activeSource: AudioBufferSourceNode | null = null;
let activeToken = 0;

function getContext(): AudioContext {
  if (!sharedContext) sharedContext = new AudioContext();
  return sharedContext;
}

/**
 * Play a mono buffer. Any previously playing preview is stopped first.
 * Returns a stop function; `onEnded` fires when playback finishes or is stopped.
 */
export function playSamples(
  samples: Float32Array,
  sampleRateHz: number,
  onEnded?: () => void,
): () => void {
  stopPlayback();
  const context = getContext();
  if (context.state === 'suspended') void context.resume();

  const buffer = context.createBuffer(1, samples.length, sampleRateHz);
  buffer.getChannelData(0).set(samples);

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);

  const token = ++activeToken;
  source.onended = () => {
    if (token === activeToken) {
      activeSource = null;
      onEnded?.();
    }
  };
  source.start();
  activeSource = source;
  return () => {
    if (token === activeToken) stopPlayback();
  };
}

export function stopPlayback(): void {
  if (activeSource) {
    try {
      activeSource.stop();
    } catch {
      // Already stopped — nothing to do.
    }
    activeSource = null;
  }
}
