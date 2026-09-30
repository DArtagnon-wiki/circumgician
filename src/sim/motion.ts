import { DRIFT_SPEED, EJECT_TIME, FLICK_MAX, KICK_GAIN, KICK_MAX, KICK_MIN, MOTE_FRICTION, PUSH_BASE, PUSH_DEPTH, REACH, SETTLE_SPEED, TRAVEL_TIME } from './constants'
import { dist, nodePositions } from './geometry'
import { nextRandom } from './rng'
import { addsPower, catchRank, isHue, takesAnyBowl } from '../model/Color'
import type { SimBus } from './events'
import type { Mote, Piece, SimState, Vec2 } from './types'

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const easeIn = (t: number) => t * t
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)

// Pushes that cancel down to less than this share of their summed size
// hold a mote in place.
const WEDGED = 0.25

// Ice: a disc every free mote is pushed out of.
interface Block {
  pos: Vec2
  radius: number
}

function pickWander(state: SimState, mote: Mote): Vec2 {
  const a = nextRandom(state) * Math.PI * 2
  const r = Math.sqrt(nextRandom(state)) * mote.tether
  return { x: mote.home.x + Math.cos(a) * r, y: mote.home.y + Math.sin(a) * r }
}

// Can this charging piece still take the mote (a hungry node of its color,
// or any hungry node for an opal, null or void)?
function canHold(piece: Piece, mote: Mote): boolean {
  return piece.held.some((id, i) => id === null && (takesAnyBowl(mote.color) || mote.color === piece.layer.nodes[i].catch))
}

// Pieces on the field act on nearby free motes. A mote a charging piece can
// still catch is left be: inside the piece it is drawn to a bowl at once,
// and on the ring it waits for one to sweep by (see updateCatching). Any
// other mote is pushed fully clear: past the catch ring plus its own drift
// radius, so it can't hover inside the piece's outline or wander back.
// Kicked or pushed motes coast with friction, bounce off the field edge,
// and adopt their resting spot as home. Returns true while coasting.
function applyPushAndCoast(state: SimState, mote: Mote, pushers: Piece[], blocks: Block[], dt: number): boolean {
  let ax = 0
  let ay = 0
  let effort = 0 // summed size of every push, before they cancel
  const f = state.field
  // Push the mote directly away from `center`, harder the deeper it sits
  // inside `limit` (d is its distance from the center).
  const pushAway = (center: Vec2, d: number, limit: number) => {
    let ux = (mote.pos.x - center.x) / d
    let uy = (mote.pos.y - center.y) / d
    if (!(d > 0.01)) {
      const a = nextRandom(state) * Math.PI * 2
      ux = Math.cos(a)
      uy = Math.sin(a)
    }
    // Against a field wall, drop the part of the push that points into it,
    // so the mote slides along the wall instead of pinning there forever.
    if ((mote.pos.x <= f.x + 0.5 && ux < 0) || (mote.pos.x >= f.x + f.w - 0.5 && ux > 0)) ux = 0
    if ((mote.pos.y <= f.y + 0.5 && uy < 0) || (mote.pos.y >= f.y + f.h - 0.5 && uy > 0)) uy = 0
    if (ux === 0 && uy === 0) return
    const strength = PUSH_BASE + PUSH_DEPTH * Math.max(0, 1 - d / limit)
    ax += ux * strength
    ay += uy * strength
    effort += Math.hypot(ux, uy) * strength
  }
  // Ice catches nothing: every free mote is pushed fully clear.
  for (const b of blocks) {
    const d = dist(mote.pos, b.pos)
    const limit = b.radius + REACH + mote.tether
    if (d < limit) pushAway(b.pos, d, limit)
  }
  for (const piece of pushers) {
    if (piece.state === 'charging' && canHold(piece, mote)) continue
    const d = dist(mote.pos, piece.pos)
    const limit = piece.layer.radius + REACH + mote.tether
    if (d < limit) pushAway(piece.pos, d, limit)
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
  // A mote at rest settles; so does one wedged where pushes cancel out
  // (say, between frozen pieces), rather than trembling there forever.
  const wedged = Math.hypot(ax, ay) < effort * WEDGED
  if ((!pushed || wedged) && Math.hypot(v.x, v.y) < SETTLE_SPEED) {
    delete mote.vel
    delete mote.kicked
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
  mote.kicked = true
  return true
}

// The player's swipe flicks the mote along it: a fresh velocity in the
// swipe's direction, its speed clamped to [KICK_MIN, FLICK_MAX].
export function flickMote(mote: Mote, vel: Vec2): boolean {
  if (mote.state !== 'free') return false
  const s = Math.hypot(vel.x, vel.y)
  if (s < 1) return false
  const speed = Math.max(KICK_MIN, Math.min(FLICK_MAX, s))
  mote.vel = { x: (vel.x / s) * speed, y: (vel.y / s) * speed }
  mote.kicked = true
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
  const blocks: Block[] = state.obstacles.filter((o) => o.frozen && !o.cleared).map((o) => ({ pos: o.pos, radius: o.layers[0].radius }))

  for (const mote of state.motes) {
    switch (mote.state) {
      case 'free': {
        if (applyPushAndCoast(state, mote, pushers, blocks, dt)) break
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
      case 'frozen':
        break // locked in ice until it breaks or thaws
      case 'ejecting': {
        // Progress below 0: freed from ice, waiting for its blow to land.
        mote.t = Math.min(1, (mote.t ?? 0) + dt / EJECT_TIME)
        mote.pos = lerp(mote.ejectFrom!, mote.home, easeOut(Math.max(0, mote.t)))
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

// Each free mote a hungry node can take is claimed by the nearest such node
// within reach (or, inside a rune or kicked into its ring, the nearest one
// at all). Bowls prefer their own color, then opal, null and void: motes are
// resolved in that order (pool order within each), and a null or void never
// takes a bowl that a real or opal mote in the same ring could fill, nor
// one of a color still out on the field while its rune has a hollow bowl
// (one of a color nowhere on the field) left to fill. Ash
// bowls, which destroy what they hold, are the exception, kept for voids:
// a void goes to an ash bowl before any other, and a mote that counts
// won't take an ash bowl while a void is in that rune's ring. A claimed
// node is no longer hungry, so contention is deterministic per tick.
export function updateCatching(state: SimState, bus: SimBus): void {
  type Hungry = { piece: Piece; node: number; pos: Vec2; catch: string; ash: boolean }
  const hungry: Hungry[] = []
  for (const piece of state.pieces) {
    if (piece.state !== 'charging') continue
    const positions = nodePositions(piece, state.time)
    piece.held.forEach((id, i) => {
      const node = piece.layer.nodes[i]
      if (id === null) hungry.push({ piece, node: i, pos: positions[i], catch: node.catch, ash: node.release === 'annihilating' })
    })
  }
  if (!hungry.length) return

  const free = state.motes.filter((m) => m.state === 'free').sort((a, b) => catchRank(a.color) - catchRank(b.color))
  const inRing = (m: Mote, h: Hungry) => dist(m.pos, h.piece.pos) <= h.piece.layer.radius + REACH
  // A bowl held back for a mote that counts, already in its rune's ring.
  const keptFor = (h: Hungry) => free.some((m) => m.state === 'free' && addsPower(m.color) && (m.color === 'generic' || m.color === h.catch) && inRing(m, h))
  // An ash bowl held back for a void in its rune's ring.
  const keptForVoid = (h: Hungry) => h.ash && free.some((m) => m.state === 'free' && m.color === 'void' && inRing(m, h))
  // Hollow bowls: no mote of their color is out on the field, so only a
  // blank (or opal) can fill them. A rune's blanks go to those first.
  const out = new Set<string>(free.filter((m) => isHue(m.color)).map((m) => m.color))
  const hollow = (h: Hungry) => !out.has(h.catch)
  const hollowLeft = (piece: Piece) => hungry.some((x) => x.piece === piece && x.piece.held[x.node] === null && hollow(x))
  for (const mote of free) {
    if (mote.state !== 'free') continue
    const voided = mote.color === 'void'
    const blank = !addsPower(mote.color)
    const fits = (h: Hungry) => {
      if (h.piece.held[h.node] !== null || !(takesAnyBowl(mote.color) || mote.color === h.catch)) return false
      if (voided && h.ash) return true
      if (blank && !hollow(h) && hollowLeft(h.piece)) return false
      return !(blank && keptFor(h)) && !(!voided && keptForVoid(h))
    }
    // Nearest first; a void takes an ash bowl before any other.
    const better = (h: Hungry, d: number, best: Hungry | null, bestD: number) => {
      if (voided && best && h.ash !== best.ash) return h.ash
      return d < bestD || (d === bestD && !best)
    }
    let best: Hungry | null = null
    let bestD = Infinity
    for (const h of hungry) {
      const d = dist(mote.pos, h.pos)
      if (d > REACH || !fits(h)) continue
      if (better(h, d, best, bestD)) {
        bestD = d
        best = h
      }
    }
    // A mote inside a rune doesn't wait for a node to sweep by, and nor does
    // a kicked one flying into its catch ring: the nearest hungry node that
    // can hold it draws it in at once, so nothing that lands inside is lost.
    if (!best) {
      bestD = Infinity
      for (const h of hungry) {
        if (!fits(h)) continue
        if (dist(mote.pos, h.piece.pos) > h.piece.layer.radius + (mote.kicked ? REACH : -REACH)) continue
        const d = dist(mote.pos, h.pos)
        if (better(h, d, best, bestD)) {
          bestD = d
          best = h
        }
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
    delete mote.kicked
    bus.emit('mote:claimed', { mote, piece: best.piece, node: best.node })
  }
}
