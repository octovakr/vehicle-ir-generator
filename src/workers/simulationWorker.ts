import type { ImpulseResponse } from '../acoustic/types';
import { generateImpulseResponse } from '../acoustic/impulseResponse';
import { validateSimulationConfig } from '../acoustic/validation';
import { convolve, mixSignals } from '../dsp/convolution';
import type { SimulationRequest, SimulationWorkerMessage } from './messages';

/**
 * Simulation Web Worker.
 *
 * Runs the full pipeline off the UI thread so the desktop UI stays
 * responsive during long simulations (rule 26):
 *
 *   1. validate config
 *   2. IR[source][mic] via the Image Source Method
 *   3. y_m(t) = Σ_i x_i(t) * h_{i,m}(t)   (per-microphone rendering)
 *
 * The worker only imports the pure acoustic/DSP modules — no UI code.
 */

function post(message: SimulationWorkerMessage, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(message, transfer);
}

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const request = event.data;
  if (request.type !== 'run') return;

  try {
    const { config, sourceSignals } = request;

    const errors = validateSimulationConfig(config);
    if (errors.length > 0) {
      post({ type: 'error', error: errors.join('\n') });
      return;
    }

    const enabledSources = config.sources.filter((s) => s.enabled);
    const enabledMicrophones = config.microphones.filter((m) => m.enabled);
    const signalBySource = new Map(sourceSignals.map((s) => [s.sourceId, s.samples]));

    const pairCount = enabledSources.length * enabledMicrophones.length;
    // IR generation ≈ half the work, convolution the other half (rough split
    // used purely for progress display).
    let completedPairs = 0;

    const impulseResponses: ImpulseResponse[] = [];
    for (const source of enabledSources) {
      for (const microphone of enabledMicrophones) {
        impulseResponses.push(generateImpulseResponse(config, source, microphone));
        completedPairs++;
        post({
          type: 'progress',
          percent: (completedPairs / pairCount) * 50,
          message: `Computing IR ${completedPairs}/${pairCount} (${source.label} → ${microphone.label})`,
        });
      }
    }

    const microphoneSignals: Array<{ microphoneId: string; samples: Float32Array }> = [];
    let convolved = 0;
    for (const microphone of enabledMicrophones) {
      const perSource: Float32Array[] = [];
      for (const source of enabledSources) {
        const dry = signalBySource.get(source.id);
        if (!dry) continue;
        const ir = impulseResponses.find(
          (candidate) =>
            candidate.sourceId === source.id && candidate.microphoneId === microphone.id,
        )!;
        perSource.push(convolve(dry, ir.samples));
        convolved++;
        post({
          type: 'progress',
          percent: 50 + (convolved / pairCount) * 50,
          message: `Convolving ${convolved}/${pairCount}`,
        });
      }
      microphoneSignals.push({ microphoneId: microphone.id, samples: mixSignals(perSource) });
    }

    const mixedInput = mixSignals(
      enabledSources
        .map((s) => signalBySource.get(s.id))
        .filter((s): s is Float32Array => s !== undefined),
    );

    const transferables: Transferable[] = [
      mixedInput.buffer,
      ...impulseResponses.map((ir) => ir.samples.buffer),
      ...microphoneSignals.map((m) => m.samples.buffer),
    ];
    post({ type: 'done', impulseResponses, mixedInput, microphoneSignals }, transferables);
  } catch (error) {
    post({
      type: 'error',
      error: error instanceof Error ? error.message : 'Simulation failed unexpectedly.',
    });
  }
};
