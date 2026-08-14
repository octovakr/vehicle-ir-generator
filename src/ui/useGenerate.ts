import { useCallback, useRef } from 'react';
import { validateSimulationConfig } from '../acoustic/validation';
import { resolveSourceSignal } from '../state/sourceSignals';
import { useStore } from '../state/store';
import type { SimulationRequest, SimulationWorkerMessage } from '../workers/messages';

/**
 * Orchestrates the Generate workflow:
 *
 *   validate → resolve dry source signals (decode/synthesize on the UI
 *   thread, since WebAudio decoding is unavailable in workers) → hand the
 *   config + signals to the simulation worker → collect progress/result.
 *
 * The heavy math (ISM + convolution) runs entirely in the Web Worker so the
 * UI stays responsive.
 */
export function useGenerate(): () => void {
  const { state, dispatch } = useStore();
  const workerRef = useRef<Worker | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  return useCallback(() => {
    const { config, sourceFileAudio } = stateRef.current;

    const errors = validateSimulationConfig(config);
    if (errors.length > 0) {
      dispatch({ type: 'generation/failure', error: errors.join('\n') });
      return;
    }

    dispatch({ type: 'generation/start' });

    void (async () => {
      try {
        const enabledSources = config.sources.filter((s) => s.enabled);
        dispatch({
          type: 'generation/progress',
          percent: 0,
          message: 'Preparing source signals…',
        });

        const sourceSignals = await Promise.all(
          enabledSources.map(async (source) => ({
            sourceId: source.id,
            samples: await resolveSourceSignal(
              source,
              sourceFileAudio[source.id],
              config.simulation.sampleRateHz,
              (decoded) =>
                dispatch({
                  type: 'sourceAudio/set',
                  sourceId: source.id,
                  audio: { ...sourceFileAudio[source.id], decoded },
                }),
            ),
          })),
        );

        workerRef.current?.terminate();
        const worker = new Worker(new URL('../workers/simulationWorker.ts', import.meta.url), {
          type: 'module',
        });
        workerRef.current = worker;

        worker.onmessage = (event: MessageEvent<SimulationWorkerMessage>) => {
          const message = event.data;
          if (message.type === 'progress') {
            dispatch({
              type: 'generation/progress',
              percent: message.percent,
              message: message.message,
            });
          } else if (message.type === 'done') {
            dispatch({
              type: 'generation/success',
              result: {
                impulseResponses: message.impulseResponses,
                sourceSignals,
                mixedInput: message.mixedInput,
                microphoneSignals: message.microphoneSignals,
                sampleRateHz: config.simulation.sampleRateHz,
                configSnapshot: structuredClone(config),
              },
            });
            worker.terminate();
            workerRef.current = null;
          } else {
            dispatch({ type: 'generation/failure', error: message.error });
            worker.terminate();
            workerRef.current = null;
          }
        };
        worker.onerror = (event) => {
          dispatch({
            type: 'generation/failure',
            error: `Simulation worker failed: ${event.message}`,
          });
          worker.terminate();
          workerRef.current = null;
        };

        // Source signal buffers are NOT transferred: the UI keeps them for
        // the result view; the worker receives structured-clone copies.
        const request: SimulationRequest = { type: 'run', config, sourceSignals };
        worker.postMessage(request);
      } catch (error) {
        dispatch({
          type: 'generation/failure',
          error: error instanceof Error ? error.message : 'Failed to prepare source signals.',
        });
      }
    })();
  }, [dispatch]);
}
