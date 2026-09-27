// mulberry32 on a single uint32 held in SimState, so drift randomness is
// seedable (tests) and survives structuredClone (undo snapshots).
export function nextRandom(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Pure hash for generators keyed by (seed, index) — no state involved.
export function hash2(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

// A tiny stateful stream seeded from hash2, for generators that need
// several draws per layer.
export function streamFrom(seed: number, index: number): () => number {
  const s = { rng: hash2(seed, index) }
  return () => nextRandom(s)
}
