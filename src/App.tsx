import React from 'react';
import { StoreProvider, useStore } from './state/store';
import { ControlPanel } from './ui/ControlPanel';
import { Viewport3D } from './ui/Viewport3D';
import { ResultView } from './ui/ResultView';
import { useGenerate } from './ui/useGenerate';

export default function App(): React.JSX.Element {
  return (
    <StoreProvider>
      <AppLayout />
    </StoreProvider>
  );
}

function AppLayout(): React.JSX.Element {
  const { state, dispatch } = useStore();
  const generate = useGenerate();

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          Vehicle IR Simulator<span>Image Source Method · rectangular cabin</span>
        </div>
        <div className="view-tabs">
          <button
            className={`view-tab ${state.view === 'scene' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'view/set', view: 'scene' })}
          >
            Scene View
          </button>
          <button
            className={`view-tab ${state.view === 'result' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'view/set', view: 'result' })}
            disabled={!state.result}
            title={state.result ? undefined : 'Run Generate first'}
          >
            Result View
          </button>
        </div>
        <div className="header-spacer" />
      </header>

      <div className="app-body">
        <ControlPanel onGenerate={generate} />
        <main className="main-area">
          {state.lastError && (
            <div className="error-banner">
              <span>{state.lastError}</span>
              <button onClick={() => dispatch({ type: 'error/clear' })} title="Dismiss">
                ✕
              </button>
            </div>
          )}
          {/* Both views stay mounted-aware of the same config; switching views
              never loses the current simulation configuration (rule 19). */}
          {state.view === 'scene' ? <Viewport3D config={state.config} /> : <ResultView />}
        </main>
      </div>
    </div>
  );
}
