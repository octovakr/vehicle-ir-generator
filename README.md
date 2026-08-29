# Vehicle IR Simulator

A **local desktop application** that generates synthetic vehicle-interior impulse responses (IRs)
using the **Image Source Method (ISM)**, for speech-enhancement dataset augmentation.

Everything runs locally: acoustic simulation, audio decoding, convolution, visualization and
export. No server, no network dependency, no account.

## Features (MVP)

- Rectangular cabin enclosure, or named vehicles (2026 IONIQ 5 / 2026 Tucson) whose cabin
  dimensions and interior objects (seats, dashboard, console, …) are derived from published
  specification sheets
- 1–6 speech sources (Zone 1–4 seating presets, freely editable x/y/z, gain, enable/disable)
- Multiple microphones with mounting choice (`free`, rear-view mirror, ceiling, dashboard,
  A-pillar, door, wall). Free-field stays a point receiver; mounted mics add a finite circular
  rigid-baffle reflection (documented approximation)
- Optional seated occupants (up to 4): AABB body boxes with clothing absorption β, path
  attenuation and first-order face reflections via the same interior-object model as seats
- Per-surface materials (glass, leather, fabric, carpet, … or custom β), where β is the
  broadband **energy absorption coefficient** (0 ≤ β ≤ 1)
- Environment: temperature and relative humidity → speed of sound (documented approximation)
- ISM solver (Allen & Berkley formulation) with configurable maximum reflection order
- One IR per (source, microphone) pair: `IR[source_i][microphone_j]`
- Rendering: `y_m(t) = Σ_i x_i(t) * h_{i,m}(t)` via FFT convolution in a Web Worker
- Deterministic seeded "robotic speech" test signals, or local WAV/MP3/FLAC/OGG files
- 3D scene view (rotate / zoom / pan) and result view with time / frequency plots
- IR export as 32-bit float WAV + JSON metadata (reproducibility-first)

## Getting started

```bash
npm install

# Desktop app (Vite dev server + Electron window)
npm run dev:app

# Renderer only in a browser (development convenience)
npm run dev

# Unit tests (acoustic engine + DSP)
npm test

# Type check + production build
npm run build
npm start          # build then launch the packaged-style Electron app
```

## Architecture

```
src/
  acoustic/    Pure acoustic engine — no UI imports, independently testable
    types.ts             Canonical data model (SimulationConfig, IR, …)
    constants.ts         Centralized defaults, named constants
    environment.ts       Speed of sound c(T, RH) — single source of truth
    materials.ts         Material presets (energy absorption β)
    vehicleModels.ts     Named vehicle profiles → cabin + interior objects
    interiorGeometry.ts  Object path attenuation + first-order face reflections
    occupants.ts         Seated-occupant AABB geometry (clothing β)
    microphoneMounting.ts Local rigid-baffle model for mounted microphones
    imageSourceSolver.ts ISM: image enumeration, delays, amplitudes
    impulseResponse.ts   Contributions → discrete-time h[n] + metadata
    validation.ts        Human-readable config validation
  dsp/         FFT, FFT convolution, Welch magnitude spectrum
  audio/       Seeded speech generator, WAV encoder, decoding, playback
  platform/    Native filesystem abstraction (Electron bridge / browser fallback)
  state/       Central store (SimulationConfig is the single source of truth)
  workers/     Simulation Web Worker (keeps the UI responsive)
  ui/          React components: 3D viewport, control center, result view
electron/      Main process + preload (window, native open/save dialogs)
```

Key rule: **UI ≠ 3D renderer ≠ acoustic simulator ≠ audio engine.** They communicate through
the data structures in `src/acoustic/types.ts` only.

## Physical model summary

| Aspect | Status |
| --- | --- |
| Image-source geometry, propagation distance/delay | Physically modeled |
| Speed of sound from temperature & humidity | Approximation (documented linear model) |
| Spherical spreading 1/d | Physically modeled (re 1 m) |
| Surface absorption (broadband β, r = √(1−β)) | Approximation (angle/frequency independent) |
| Named-vehicle cabins & interior AABBs | Approximation (spec-sheet + researched class-typical sizes) |
| Interior-object path loss & 1st-order face reflections | Approximation (no diffraction / higher-order object images) |
| Seated occupants (AABB body + clothing β) | Approximation (not a body mesh or measured insertion loss) |
| Microphone mounting / rigid-baffle effects | Approximation (finite circular baffle + ka high-pass; not CAD/BEM/directivity) |
| Air absorption, diffraction, scattering, CAD geometry | Future work |

## IR output format

- `ir_<source>_<microphone>.wav` — mono, 32-bit IEEE float, at the configured sample rate
- `ir_<source>_<microphone>.json` — full metadata: vehicle dimensions, positions, per-surface β,
  environment, speed of sound, sample rate, IR duration, max reflection order, seed,
  simulator version, image-source count
