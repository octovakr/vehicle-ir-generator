import type { ImpulseResponse, SimulationConfig } from '../acoustic/types';

/**
 * Message contracts between the UI thread and the simulation Web Worker.
 * Sample buffers are moved with transferable ArrayBuffers to avoid copies.
 */

export interface SimulationRequest {
  type: 'run';
  config: SimulationConfig;
  /** Dry source signals (gain already applied), one per enabled source. */
  sourceSignals: Array<{ sourceId: string; samples: Float32Array }>;
}

export type SimulationWorkerMessage =
  | { type: 'progress'; percent: number; message: string }
  | {
      type: 'done';
      impulseResponses: ImpulseResponse[];
      mixedInput: Float32Array;
      microphoneSignals: Array<{ microphoneId: string; samples: Float32Array }>;
    }
  | { type: 'error'; error: string };
