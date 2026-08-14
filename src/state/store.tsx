import React, { createContext, useContext, useMemo, useReducer } from 'react';
import type { ImpulseResponse, SimulationConfig } from '../acoustic/types';
import { createDefaultConfig } from './defaults';

/**
 * Central application store (rule 20).
 *
 * `config` is the single canonical SimulationConfig. UI components read it
 * from context and mutate it exclusively through dispatch actions — no
 * component keeps its own copy of simulation state.
 *
 * Loaded audio file bytes live in `sourceFileAudio` (keyed by source id),
 * separate from the config because the IR is independent of audio content.
 */

export interface SourceFileAudio {
  fileName: string;
  /** Raw file bytes; kept so audio can be re-decoded if the sample rate changes. */
  rawData: ArrayBuffer;
  /** Cache of the last decode, tagged with the sample rate it was decoded at. */
  decoded?: { sampleRateHz: number; samples: Float32Array };
}

export interface SimulationResult {
  /** IR[source][microphone] — one entry per enabled (source, mic) pair. */
  impulseResponses: ImpulseResponse[];
  /** Per-source dry signals (gain applied) used for this render. */
  sourceSignals: Array<{ sourceId: string; samples: Float32Array }>;
  /** Dry mix of all enabled source signals (before propagation). */
  mixedInput: Float32Array;
  /** Rendered reverberant signal per microphone: y_m = Σ_i x_i * h_{i,m}. */
  microphoneSignals: Array<{ microphoneId: string; samples: Float32Array }>;
  sampleRateHz: number;
  /** Config snapshot the result was generated from. */
  configSnapshot: SimulationConfig;
}

export type ViewMode = 'scene' | 'result';

export interface AppState {
  config: SimulationConfig;
  sourceFileAudio: Record<string, SourceFileAudio>;
  view: ViewMode;
  result: SimulationResult | null;
  isGenerating: boolean;
  generationProgress: { percent: number; message: string } | null;
  lastError: string | null;
}

export type AppAction =
  | { type: 'config/update'; update: (config: SimulationConfig) => SimulationConfig }
  | { type: 'sourceAudio/set'; sourceId: string; audio: SourceFileAudio }
  | { type: 'sourceAudio/remove'; sourceId: string }
  | { type: 'view/set'; view: ViewMode }
  | { type: 'generation/start' }
  | { type: 'generation/progress'; percent: number; message: string }
  | { type: 'generation/success'; result: SimulationResult }
  | { type: 'generation/failure'; error: string }
  | { type: 'error/clear' };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'config/update':
      return { ...state, config: action.update(state.config) };
    case 'sourceAudio/set':
      return {
        ...state,
        sourceFileAudio: { ...state.sourceFileAudio, [action.sourceId]: action.audio },
      };
    case 'sourceAudio/remove': {
      const next = { ...state.sourceFileAudio };
      delete next[action.sourceId];
      return { ...state, sourceFileAudio: next };
    }
    case 'view/set':
      return { ...state, view: action.view };
    case 'generation/start':
      return {
        ...state,
        isGenerating: true,
        generationProgress: { percent: 0, message: 'Starting…' },
        lastError: null,
      };
    case 'generation/progress':
      return {
        ...state,
        generationProgress: { percent: action.percent, message: action.message },
      };
    case 'generation/success':
      return {
        ...state,
        isGenerating: false,
        generationProgress: null,
        result: action.result,
        view: 'result',
      };
    case 'generation/failure':
      return {
        ...state,
        isGenerating: false,
        generationProgress: null,
        lastError: action.error,
      };
    case 'error/clear':
      return { ...state, lastError: null };
  }
}

function createInitialState(): AppState {
  return {
    config: createDefaultConfig(),
    sourceFileAudio: {},
    view: 'scene',
    result: null,
    isGenerating: false,
    generationProgress: null,
    lastError: null,
  };
}

interface StoreContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider');
  return context;
}
