import { DRIFT_SPEED, EJECT_TIME, KICK_GAIN, KICK_MAX, KICK_MIN, MOTE_FRICTION, PULL_ACCEL, PULL_RANGE, PUSH_BASE, PUSH_DEPTH, PUSH_INSET, REACH, SETTLE_SPEED, TRAVEL_TIME } from './constants'
import { dist, nodePositions } from './geometry'
import { nextRandom } from './rng'
import type { SimBus } from './events'
import type { Mote, Piece, SimState, Vec2 } from './types'

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const easeIn = (t: number) => t * t
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)

function pickWander(state: SimState, mote: Mote): Vec2 {
  const a = nextRandom(state) * Math.PI * 2
  const r = Math.sqrt(nextRandom(state)) * mote.tether
  return { x: mote.home.x + Math.cos(a) * r, y: mote.home.y + Math.sin(a) * r }
}

// Pieces on the field act on nearby free motes:
// - a mote the piece can still catch is pulled toward a nearby matching
//   hungry node, or (if the only match is across the body) pushed out onto
//   the ring, where that node sweeps by;
// - any other mote is pushed fully clear: past the catch ring plus its own
//   drift radius, so it can't hover inside the piece's outline or wander back.
// Kicked, pulled or pushed motes coast with friction, bounce off the field
// edge, and adopt their resting spot as home. Returns true while coasting.
function applyPushAndCoast(state: SimState, mote: Mote, pushers: Piece[], nodesOf: (p: Piece) => Vec2[], dt: number): boolean {
  let ax = 0
  let ay = 0
  const f = state.field
  for (const piece of pushers) {
    const layer = piece.layer
    const dx = mote.pos.x - piece.pos.x
    const dy = mote.pos.y - piece.pos.y
    const d = Math.hypot(dx, dy)

    let catchable = false
    let target: Vec2 | null = null
    let best = Infinity
    if (piece.state === 'charging') {
      nodesOf(piece).forEach((p, i) => {
        if (piece.held[i] !== null) return
        if (mote.color !== 'generic' && mote.color !== layer.nodes[i].catch) return
        catchable = true
        const dn = Math.hypot(p.x - mote.pos.x, p.y - mote.pos.y)
        if (dn < best) {
          best = dn
          target = p
        }
      })
    }

    let limit: number
    if (catchable) {
      limit = layer.radius - PUSH_INSET
      if (d >= limit) continue // on or near the ring: the node will sweep by
      // Only chase a nearby node; one across the body would drag the mote
      // through the interior and fling it out the far side.
      if (target && best <= layer.radius * PULL_RANGE) {
        const t: Vec2 = target
        const tx = t.x - mote.pos.x
        const ty = t.y - mote.pos.y
        const tl = Math.hypot(tx, ty) || 1
        ax += (tx / tl) * PULL_ACCEL
        ay += (ty / tl) * PULL_ACCEL
        continue
      }
    } else {
      limit = layer.radius + REACH + mote.tether
      if (d >= limit) continue
    }

    let ux = dx / d
    let uy = dy / d
    if (!(d > 0.01)) {
      const a = nextRandom(state) * Math.PI * 2
      ux = Math.cos(a)
      uy = Math.sin(a)
    }
    // Against a field wall, drop the part of the push that points into it,
    // so the mote slides along the wall instead of pinning there forever.
    if ((mote.pos.x <= f.x + 0.5 && ux < 0) || (mote.pos.x >= f.x + f.w - 0.5 && ux > 0)) ux = 0
    if ((mote.pos.y <= f.y + 0.5 && uy < 0) || (mote.pos.y >= f.y + f.h - 0.5 && uy > 0)) uy = 0
    if (ux === 0 && uy === 0) continue
    const strength = PUSH_BASE + PUSH_DEPTH * Math.max(0, 1 - d / limit)
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
  const pieces = new Map(state.pieces.map((p) => [p.id, p]))
  const nodeCache = new Map<string, Vec2[]>()
  const nodesOf = (piece: Piece) => {
    let n = nodeCache.get(piece.id)
    if (!n) nodeCache.set(piece.id, (n = nodePositions(piece, state.time)))
    return n
  }

  const pushers = state.pieces

  for (const mote of state.motes) {
    switch (mote.state) {
      case 'free': {
        if (applyPushAndCoast(state, mote, pushers, nodesOf, dt)) break
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
        const piece = pieces.get(mote.pieceId!)!
        const target = nodesOf(piece)[mote.node!]
        mote.t = Math.min(1, (mote.t ?? 0) + dt / TRAVEL_TIME)
        mote.pos = lerp(mote.travelFrom!, target, easeIn(mote.t))
        if (mote.t >= 1) {
          mote.state = 'held'
          mote.pos = { ...target }
          bus.emit('mote:held', { mote, piece, node: mote.node! })
          if (piece.state === 'charging' && piece.held.every((id) => id !== null && state.motes.find((m) => m.id === id)?.state === 'held')) {
            piece.state = 'full'
            bus.emit('piece:full', { piece })
          }
        }
        break
      }
      case 'held': {
        const piece = pieces.get(mote.pieceId!)!
        mote.pos = { ...nodesOf(piece)[mote.node!] }
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
  const hungry: { piece: Piece; node: number; pos: Vec2; catch: string }[] = []
  for (const piece of state.pieces) {
    if (piece.state !== 'charging') continue
    const positions = nodePositions(piece, state.time)
    piece.held.forEach((id, i) => {
      if (id === null) hungry.push({ piece, node: i, pos: positions[i], catch: piece.layer.nodes[i].catch })
    })
  }
  if (!hungry.length) return

  for (const mote of state.motes) {
    if (mote.state !== 'free') continue
    let best: (typeof hungry)[number] | null = null
    let bestD = REACH
    for (const h of hungry) {
      if (h.piece.held[h.node] !== null) continue
      if (mote.color !== 'generic' && mote.color !== h.catch) continue
      const d = dist(mote.pos, h.pos)
      if (d <= bestD) {
        bestD = d
        best = h
      }
    }
    if (!best) continue
    best.piece.held[best.node] = mote.id
    mote.state = 'traveling'
    mote.pieceId = best.piece.id
    mote.node = best.node
    mote.travelFrom = { ...mote.pos }
    mote.t = 0
    delete mote.vel
    bus.emit('mote:claimed', { mote, piece: best.piece, node: best.node })
  }
}
