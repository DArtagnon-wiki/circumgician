import { DRIFT_SPEED, EJECT_TIME, KICK_GAIN, KICK_MAX, KICK_MIN, MOTE_FRICTION, PUSH_BASE, PUSH_DEPTH, PUSH_INSET, REACH, SETTLE_SPEED, TRAVEL_TIME } from './constants'
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

// Rune bodies push uncaptured motes outward; kicked or pushed motes coast
// with friction, bounce off the field edge, and adopt their resting spot as
// home. Returns true when this mote is coasting (skip tether drift).
function applyPushAndCoast(state: SimState, mote: Mote, pushers: Rune[], dt: number): boolean {
  let ax = 0
  let ay = 0
  for (const rune of pushers) {
    const limit = outerLayer(rune)!.radius - PUSH_INSET
    const dx = mote.pos.x - rune.pos!.x
    const dy = mote.pos.y - rune.pos!.y
    const d = Math.hypot(dx, dy)
    if (d >= limit) continue
    let ux = dx / d
    let uy = dy / d
    if (!(d > 0.01)) {
      const a = nextRandom(state) * Math.PI * 2
      ux = Math.cos(a)
      uy = Math.sin(a)
    }
    const strength = PUSH_BASE + PUSH_DEPTH * (1 - d / limit)
    ax += ux * strength
    ay += uy * strength
  }
  const pushed = ax !== 0 || ay !== 0
  if (pushed) {
    const v = mote.vel ?? { x: 0, y: 0 }
    mote.vel = { x: v.x + ax * dt, y: v.y + ay * dt }
  }
  const v = mote.vel
  if (!v) return false

  let x = mote.pos.x + v.x * dt
  let y = mote.pos.y + v.y * dt
  const f = state.field
  if (x < f.x || x > f.x + f.w) {
    v.x = -v.x
    x = Math.max(f.x, Math.min(f.x + f.w, x))
  }
  if (y < f.y || y > f.y + f.h) {
    v.y = -v.y
    y = Math.max(f.y, Math.min(f.y + f.h, y))
  }
  mote.pos = { x, y }
  const decay = Math.exp(-MOTE_FRICTION * dt)
  v.x *= decay
  v.y *= decay
  if (!pushed && Math.hypot(v.x, v.y) < SETTLE_SPEED) {
    delete mote.vel
    mote.home = { ...mote.pos }
    mote.wander = { ...mote.pos }
  }
  return true
}

// The player's tap at `from` shoves the mote directly away from the touch:
// velocity = -KICK_GAIN * (from - mote), clamped to [KICK_MIN, KICK_MAX].
// A farther tap kicks harder; a dead-center tap has no direction, so it
// does nothing.
export function kickMote(mote: Mote, from: Vec2): boolean {
  if (mote.state !== 'free') return false
  const dx = mote.pos.x - from.x
  const dy = mote.pos.y - from.y
  const d = Math.hypot(dx, dy)
  if (d < 1) return false
  const speed = Math.max(KICK_MIN, Math.min(KICK_MAX, KICK_GAIN * d))
  const v = mote.vel ?? { x: 0, y: 0 }
  mote.vel = { x: v.x + (dx / d) * speed, y: v.y + (dy / d) * speed }
  return true
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

  const pushers = state.runes.filter((r) => r.pos && (r.state === 'charging' || r.state === 'full'))

  for (const mote of state.motes) {
    switch (mote.state) {
      case 'free': {
        if (applyPushAndCoast(state, mote, pushers, dt)) break
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
    delete mote.vel
    bus.emit('mote:claimed', { mote, rune: best.rune, node: best.node })
  }
}
