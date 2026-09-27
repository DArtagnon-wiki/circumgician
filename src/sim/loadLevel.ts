import { DEFAULT_TETHER } from './constants'
import type { LevelData, SimState } from './types'

// Build the initial runtime state for a level. `seed` drives drift only.
export function loadLevel(level: LevelData, seed = 1): SimState {
  const clone = structuredClone(level)
  let n = 0
  const id = (prefix: string) => `${prefix}-${n++}`
  return {
    levelId: level.id,
    field: clone.field,
    blockers: clone.blockers,
    motes: clone.motes.map((m) => {
      const home = { x: m.x, y: m.y }
      return {
        id: id('mote'),
        color: m.color,
        home,
        tether: m.tether ?? DEFAULT_TETHER,
        pos: { ...home },
        wander: { ...home },
        state: 'free' as const,
      }
    }),
    // Endless stacks carry a per-entity seed; generators extend them on demand.
    obstacles: clone.obstacles.map((o, i) => ({
      id: id('obstacle'),
      pos: { x: o.x, y: o.y },
      layers: o.layers,
      index: 0,
      hp: o.layers[0]?.hp ?? 0,
      cleared: false,
      ...(clone.endless ? { endlessSeed: (clone.endless.seed * 31 + 1000 + i) >>> 0 } : {}),
    })),
    runes: clone.hand.map((r, slot) => ({
      id: id('rune'),
      layers: r.layers,
      index: 0,
      insight: r.insight ?? 'full',
      state: 'idle' as const,
      slot,
      held: [],
      linkedObstacleId: null,
      ...(clone.endless ? { endlessSeed: (clone.endless.seed * 31 + slot) >>> 0 } : {}),
    })),
    time: 0,
    rng: seed >>> 0 || 1,
    nextId: n,
    status: 'playing',
    score: 0,
    broken: 0,
  }
}
