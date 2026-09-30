import { DEFAULT_TETHER, ICE_RADIUS } from './constants'
import { iceSpots } from './geometry'
import type { Hue, LevelData, Mote, MoteColor, Obstacle, SimState, Vec2 } from './types'

// Build the initial runtime state for a level. `seed` drives drift only.
export function loadLevel(level: LevelData, seed = 1): SimState {
  const clone = structuredClone(level)
  let n = 0
  const id = (prefix: string) => `${prefix}-${n++}`
  const mote = (color: MoteColor, at: Vec2, tether = DEFAULT_TETHER): Mote => ({
    id: id('mote'),
    color,
    home: { ...at },
    tether,
    pos: { ...at },
    wander: { ...at },
    state: 'free',
  })
  const motes = clone.motes.map((m) => mote(m.color, { x: m.x, y: m.y }, m.tether))
  // Motes locked in the level's ice come after the free ones, so a level's
  // nth mote is still `mote-n`.
  const iceSpecs = clone.ice ?? []
  const locked = iceSpecs.map((ice) => {
    const spots = iceSpots({ x: ice.x, y: ice.y }, ice.sides, ice.radius ?? ICE_RADIUS)
    return (ice.motes ?? []).map((color, i) => ({ ...mote(color, spots[i]), state: 'frozen' as const }))
  })
  // Endless stacks carry a per-entity seed; generators extend them on demand.
  const obstacles: Obstacle[] = clone.obstacles.map((o, i) => ({
    id: id('obstacle'),
    pos: { x: o.x, y: o.y },
    layers: o.layers,
    index: 0,
    hp: o.layers[0]?.hp ?? 0,
    cleared: false,
    ...(o.look ? { look: o.look } : {}),
    ...(clone.endless ? { endlessSeed: (clone.endless.seed * 31 + 1000 + i) >>> 0 } : {}),
  }))
  // Ice follows the obstacles it never counts among.
  iceSpecs.forEach((ice, k) => {
    const hp = ice.hp ?? ice.sides
    const block: Obstacle = {
      id: id('ice'),
      pos: { x: ice.x, y: ice.y },
      layers: [{ sides: ice.sides, radius: ice.radius ?? ICE_RADIUS, hp }],
      index: 0,
      hp,
      cleared: false,
      frozen: { motes: locked[k].map((m) => m.id) },
    }
    for (const m of locked[k]) m.frozenIn = block.id
    obstacles.push(block)
  })
  const all = [...motes, ...locked.flat()]
  return {
    levelId: level.id,
    field: clone.field,
    blockers: clone.blockers,
    motes: all,
    obstacles,
    runes: clone.hand.map((r, slot) => ({
      id: id('rune'),
      layers: r.layers,
      index: 0,
      insight: r.insight ?? 'full',
      state: 'idle' as const,
      slot,
      ...(clone.endless ? { endlessSeed: (clone.endless.seed * 31 + slot) >>> 0 } : {}),
    })),
    pieces: [],
    time: 0,
    rng: seed >>> 0 || 1,
    nextId: n,
    status: 'playing',
    score: 0,
    broken: 0,
    stats: { detonations: 0, landed: 0, wasted: 0, unlinked: 0, destroyed: 0, burned: 0 },
    seenHues: [...new Set(all.map((m) => m.color).filter((c): c is Hue => c !== 'generic'))],
  }
}
