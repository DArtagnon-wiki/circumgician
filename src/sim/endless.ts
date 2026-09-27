import { streamFrom } from './rng'
import type { Hue, LevelData, NodeSpec, ObstacleLayerSpec, ReleaseColor, RuneLayerSpec, SimState } from './types'

// Endless mode: pure generators keyed by (entity seed, depth), so a run's
// stacks are fully determined by its seed and state stays snapshot-able.
// The ramp is slow: more sides, larger radii, new hues, higher HP.

export const ENDLESS_TUNING = {
  motes: 18,
  bossEvery: 4, // every Nth obstacle layer is a boss
  genericRelease: 0.06,
  primaryCatch: 0.8,
  keepColor: 0.5,
  tether: 18,
}

function huesAt(depth: number): Hue[] {
  const hues: Hue[] = ['red', 'blue', 'gold']
  if (depth >= 4) hues.push('teal')
  if (depth >= 8) hues.push('violet')
  return hues
}

const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]

const BASE_HUES: Hue[] = ['red', 'blue', 'gold']

// `seen` = hues that have existed in the pool. A new hue ramps in on the
// release side first; catches only ever ask for hues the player has had,
// so a color is always produced before anything consumes it.
export function runeLayerAt(seed: number, depth: number, seen: readonly Hue[] = BASE_HUES): RuneLayerSpec {
  const r = streamFrom(seed, depth)
  const maxSides = Math.min(6, 3 + Math.floor(depth / 4))
  const sides = 3 + Math.floor(r() * (maxSides - 2))
  const radius = Math.min(96, 34 + Math.floor(r() * 10) + depth * 2)
  const hues = huesAt(depth)
  let catchable = hues.filter((h) => seen.includes(h))
  if (!catchable.length) catchable = [...seen]
  if (!catchable.length) catchable = BASE_HUES
  // Mostly one catch color per layer, sometimes a second: keeps layers
  // fillable from a conserved pool while still demanding specific colors.
  const primary = pick(r, catchable)
  const secondary = pick(r, catchable)
  const nodes: NodeSpec[] = Array.from({ length: sides }, () => {
    const c = r() < ENDLESS_TUNING.primaryCatch ? primary : secondary
    const g = r()
    const release: ReleaseColor = g < ENDLESS_TUNING.genericRelease ? 'generic' : g < ENDLESS_TUNING.keepColor ? c : pick(r, hues)
    return { catch: c, release }
  })
  return { sides, radius, nodes }
}

export function obstacleLayerAt(seed: number, depth: number): ObstacleLayerSpec {
  const r = streamFrom(seed, depth)
  const boss = depth % ENDLESS_TUNING.bossEvery === ENDLESS_TUNING.bossEvery - 1
  const maxSides = Math.min(6, 3 + Math.floor(depth / 3))
  const sides = 3 + Math.floor(r() * (maxSides - 2))
  const hp = Math.round((3 + depth * 0.8 + r() * 2) * (boss ? 1.5 : 1))
  const radius = Math.min(44, 26 + depth) + (boss ? 8 : 0)
  return boss ? { sides, radius, hp, boss } : { sides, radius, hp }
}

// Keep three rune layers visible (outer/middle/center), and the current
// obstacle layer plus the next one (shown as the circumscribed outline).
// Called by the Sim after every layer advance.
export function ensureEndlessLayers(state: SimState): void {
  for (const rune of state.runes) {
    if (rune.endlessSeed === undefined) continue
    while (rune.layers.length < rune.index + 3) rune.layers.push(runeLayerAt(rune.endlessSeed, rune.layers.length, state.seenHues))
  }
  for (const o of state.obstacles) {
    if (o.endlessSeed === undefined) continue
    while (o.layers.length < o.index + 2) o.layers.push(obstacleLayerAt(o.endlessSeed, o.layers.length))
  }
}

export function endlessLevel(seed: number): LevelData {
  const r = streamFrom(seed, 9999)
  const field = { x: 30, y: 330, w: 340, h: 380 }
  const colors: Hue[] = ['red', 'blue', 'gold']
  // Clusters of one color on small arcs, so an early rune dropped on a
  // cluster's center can fill; the looser tether keeps the pool forgiving.
  const perCluster = 3
  const motes = Array.from({ length: ENDLESS_TUNING.motes / perCluster }, (_, k) => {
    const cx = field.x + 60 + r() * (field.w - 120)
    const cy = field.y + 60 + r() * (field.h - 120)
    const phase = r() * Math.PI * 2
    return Array.from({ length: perCluster }, (_, j) => {
      const a = phase + (j * 2 * Math.PI) / perCluster
      return { color: colors[k % 3], x: Math.round(cx + Math.cos(a) * 40), y: Math.round(cy + Math.sin(a) * 40), tether: ENDLESS_TUNING.tether }
    })
  }).flat()
  const obstacleSeed = (i: number) => (seed * 31 + 1000 + i) >>> 0 // matches loadLevel
  const runeSeed = (slot: number) => (seed * 31 + slot) >>> 0
  return {
    version: 1,
    id: 'endless',
    name: 'Endless',
    field,
    blockers: [],
    motes,
    obstacles: [
      { x: 80, y: 170, layers: [obstacleLayerAt(obstacleSeed(0), 0)] },
      { x: 200, y: 140, layers: [obstacleLayerAt(obstacleSeed(1), 0)] },
      { x: 320, y: 170, layers: [obstacleLayerAt(obstacleSeed(2), 0)] },
    ],
    hand: [0, 1, 2].map((slot) => ({ insight: 'none' as const, layers: [0, 1, 2].map((d) => runeLayerAt(runeSeed(slot), d)) })),
    goal: { type: 'clearAll' },
    endless: { seed },
  }
}
