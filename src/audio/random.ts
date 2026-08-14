/**
 * Deterministic seeded PRNG (mulberry32).
 *
 * All randomized generation in the application (e.g. robotic test speech)
 * must go through a seeded generator so that SimulationConfig + randomSeed
 * reproduces identical output (rule 24). Never use Math.random() in the
 * engine or audio-generation code.
 */
export type RandomFn = () => number;

export function createSeededRandom(seed: number): RandomFn {
  let state = seed >>> 0;
  return function mulberry32(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
