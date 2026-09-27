import { DRIFT_SPEED, EJECT_TIME, REACH, TRAVEL_TIME } from './constants'
import { dist, nodePositions, outerLayer } from './geometry'
import { nextRandom } from './rng'
import type { SimBus } from './events'
import type { Mote, Rune, SimState, Vec2 } from './types'

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const easeIn = (t: number) => t * t
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)

function pickWander(state: SimState, mote: Mote): Vec2 {
  const a = nextRandom(state) * Math.PI * 2
  const r = Math.sqrt(nextRandom(state)) * mote.tether
  return { x: mote.home.x + Math.cos(a) * r, y: mote.home.y + Math.sin(a) * r }
}

// Tethered drift, claimed-mote travel, held-mote tracking and burst settling.
export function updateMotion(state: SimState, bus: SimBus, dt: number): void {
  const runes = new Map(state.runes.map((r) => [r.id, r]))
  const nodeCache = new Map<string, Vec2[]>()
  const nodesOf = (rune: Rune) => {
    let n = nodeCache.get(rune.id)
    if (!n) nodeCache.set(rune.id, (n = nodePositions(rune, state.time)))
    return n
  }

  for (const mote of state.motes) {
    switch (mote.state) {
      case 'free': {
        const d = dist(mote.pos, mote.wander)
        const step = DRIFT_SPEED * dt
        if (d <= step) {
          mote.pos = { ...mote.wander }
          mote.wander = pickWander(state, mote)
        } else {
          mote.pos = lerp(mote.pos, mote.wander, step / d)
        }
        break
      }
      case 'traveling': {
        const rune = runes.get(mote.runeId!)!
        const target = nodesOf(rune)[mote.node!]
        mote.t = Math.min(1, (mote.t ?? 0) + dt / TRAVEL_TIME)
        mote.pos = lerp(mote.travelFrom!, target, easeIn(mote.t))
        if (mote.t >= 1) {
          mote.state = 'held'
          mote.pos = { ...target }
          bus.emit('mote:held', { mote, rune, node: mote.node! })
          if (rune.state === 'charging' && rune.held.every((id) => id !== null && state.motes.find((m) => m.id === id)?.state === 'held')) {
            rune.state = 'full'
            bus.emit('rune:full', { rune })
          }
        }
        break
      }
      case 'held': {
        const rune = runes.get(mote.runeId!)!
        mote.pos = { ...nodesOf(rune)[mote.node!] }
        break
      }
      case 'ejecting': {
        mote.t = Math.min(1, (mote.t ?? 0) + dt / EJECT_TIME)
        mote.pos = lerp(mote.ejectFrom!, mote.home, easeOut(mote.t))
        if (mote.t >= 1) {
          mote.state = 'free'
          mote.pos = { ...mote.home }
          mote.wander = { ...mote.home }
          delete mote.t
          delete mote.ejectFrom
        }
        break
      }
    }
  }
}

// Each free mote within reach of a hungry node whose catch it satisfies is
// claimed by the nearest such node. Motes are resolved in pool order, and a
// claimed node is no longer hungry, so contention is deterministic per tick.
export function updateCatching(state: SimState, bus: SimBus): void {
  const hungry: { rune: Rune; node: number; pos: Vec2; catch: string }[] = []
  for (const rune of state.runes) {
    if (rune.state !== 'charging') continue
    const layer = outerLayer(rune)!
    const positions = nodePositions(rune, state.time)
    rune.held.forEach((id, i) => {
      if (id === null) hungry.push({ rune, node: i, pos: positions[i], catch: layer.nodes[i].catch })
    })
  }
  if (!hungry.length) return

  for (const mote of state.motes) {
    if (mote.state !== 'free') continue
    let best: (typeof hungry)[number] | null = null
    let bestD = REACH
    for (const h of hungry) {
      if (h.rune.held[h.node] !== null) continue
      if (mote.color !== 'generic' && mote.color !== h.catch) continue
      const d = dist(mote.pos, h.pos)
      if (d <= bestD) {
        bestD = d
        best = h
      }
    }
    if (!best) continue
    best.rune.held[best.node] = mote.id
    mote.state = 'traveling'
    mote.runeId = best.rune.id
    mote.node = best.node
    mote.travelFrom = { ...mote.pos }
    mote.t = 0
    bus.emit('mote:claimed', { mote, rune: best.rune, node: best.node })
  }
}
