import { KICK_GAIN, MOTE_FRICTION, REACH } from './constants'
import { dist, outerLayer } from './geometry'
import { colorsCanCover } from './progress'
import { Sim, type SimOptions } from './Sim'
import { nextRandom } from './rng'
import type { Move } from './solver'
import type { LevelData, Mote, Piece, RuneLayerSpec, SimStatus, Vec2 } from './types'

export type ScriptStep =
  | { place: number; at: Vec2 } // cast the layer in that hand slot at a field position
  | { tap: number; layer?: number } // wait for a piece from that slot (the oldest, or that stack layer) to fill, then detonate it
  | { wait: number } // seconds
  | { flick: number; toward: Vec2 } // kick the level's nth mote so it coasts to a point
  | { feed: number; layer?: number } // kick the free motes a charging piece from that slot can use into it, nearest first, until it fills
  | { gather: number; at: Vec2; layer?: number } // before a cast: bring the motes that slot's layer (in hand, or that stack layer) needs to a spot, wild motes kept out

export interface RunResult {
  status: SimStatus
  time: number
  sim: Sim
  moves: Move[] // what happened, as solver moves
  error?: string // a step could not be performed (illegal placement, never filled)
}

const DT = 1 / 30

// The run in the solver's terms (solver.ts): a fill when a piece becomes
// full, a fire at each detonation. Obstacles and ice are numbered apart,
// each in the order the sim holds them (ice in the order it formed).
function recordMoves(sim: Sim): Move[] {
  const moves: Move[] = []
  sim.bus.on('piece:full', ({ piece }) => moves.push({ kind: 'fill', rune: piece.slot, layer: piece.depth }))
  sim.bus.on('piece:detonated', ({ piece, info }) => {
    const hit = sim.state.obstacles.find((o) => o.id === info.obstacleId)
    const kin = sim.state.obstacles.filter((o) => !o.frozen === !hit?.frozen)
    const target = hit ? kin.indexOf(hit) : null
    moves.push({ kind: 'fire', rune: piece.slot, layer: piece.depth, target, ...(hit?.frozen ? { ice: true } : {}) })
  })
  return moves
}

function runeInSlot(sim: Sim, slot: number) {
  return sim.state.runes.find((r) => r.slot === slot)
}

function pieceFrom(sim: Sim, slot: number, layer?: number) {
  return sim.state.pieces.find((p) => p.slot === slot && (layer === undefined || p.depth === layer))
}

// False once the piece has left the field (burst, frozen or burned).
const onField = (sim: Sim, piece: Piece) => sim.state.pieces.includes(piece)

// A kicked mote coasts speed / MOTE_FRICTION, and a tap d away kicks at
// KICK_GAIN * d, so tap that far behind it (kicks are clamped, so a far
// target is only approached).
function kickTo(sim: Sim, mote: Mote, to: Vec2): void {
  const dx = to.x - mote.pos.x
  const dy = to.y - mote.pos.y
  const d = Math.hypot(dx, dy) || 1
  const back = (d * MOTE_FRICTION) / KICK_GAIN
  sim.kick(mote.id, { x: mote.pos.x - (dx / d) * back, y: mote.pos.y - (dy / d) * back })
}

// Kicks the nearest resting free mote the piece can still hold at its
// center; one reaching the catch ring is drawn to a node. False if none.
function feedOne(sim: Sim, piece: Piece): boolean {
  const want = new Set<string>(piece.layer.nodes.filter((_, i) => piece.held[i] === null).map((n) => n.catch))
  let best: Mote | null = null
  for (const m of sim.state.motes) {
    if (m.state !== 'free' || m.vel || (m.color !== 'generic' && !want.has(m.color))) continue
    if (!best || dist(m.pos, piece.pos) < dist(best.pos, piece.pos)) best = m
  }
  if (best) kickTo(sim, best, piece.pos)
  return !!best
}

const GATHER_TIMEOUT = 30
const GATHER_TOLERANCE = 4 // px of margin inside the ring's inner edge

// Moving motes before casting, the way a careful player works: the motes
// the layer needs are clumped where it will be cast (it takes whatever of
// its colors lands inside it at once, so it fills before a fuse can burn
// it), and wild motes within reach of its ring are moved clear, so none is
// spent by accident. Nothing is cast; returns why the layer could not be
// read, if it could not.
function gather(sim: Sim, slot: number, to: Vec2, layer?: number): string | null {
  const rune = runeInSlot(sim, slot)
  const k = layer ?? rune?.index ?? 0
  const spec = rune?.layers[k]
  if (!rune || !spec || k >= rune.layers.length - 1) return `slot ${slot} has no layer${layer === undefined ? '' : ` ${layer}`} to gather for`
  const need = new Map<string, number>()
  for (const n of spec.nodes) need.set(n.catch, (need.get(n.catch) ?? 0) + 1)
  const inside = (m: Mote) => dist(m.pos, to) < spec.radius - REACH - GATHER_TOLERANCE
  const clear = spec.radius + REACH * 2 // a wild mote this far out is beyond the ring's reach
  const start = sim.state.time
  while (sim.state.time - start < GATHER_TIMEOUT) {
    if (sim.state.motes.some((m) => m.vel || m.state === 'traveling')) {
      sim.step(DT)
      continue
    }
    const free = sim.state.motes.filter((m) => m.state === 'free')
    let next: [Mote, Vec2] | null = null
    const wild = free.find((m) => m.color === 'generic' && dist(m.pos, to) < clear)
    if (wild) {
      const d = dist(wild.pos, to) || 1
      next = [wild, { x: to.x + ((wild.pos.x - to.x) / d) * (clear + REACH), y: to.y + ((wild.pos.y - to.y) / d) * (clear + REACH) }]
    } else {
      for (const [color, count] of need) {
        const mine = free.filter((m) => m.color === color)
        if (mine.filter(inside).length >= count) continue
        const m = mine.filter((c) => !inside(c)).sort((a, b) => dist(a.pos, to) - dist(b.pos, to))[0]
        if (m) {
          next = [m, to]
          break
        }
      }
    }
    if (!next) return null
    kickTo(sim, next[0], next[1])
    sim.step(DT)
  }
  return null
}

// Plays a fixed sequence of actions, then lets the board settle until the
// sim decides (or `settle` seconds pass). Drift randomness comes from `seed`.
export function runScript(level: LevelData, steps: ScriptStep[], opts: SimOptions & { fillTimeout?: number; settle?: number } = {}): RunResult {
  const sim = new Sim(level, opts)
  const moves = recordMoves(sim)
  const fillTimeout = opts.fillTimeout ?? 30
  const fail = (error: string): RunResult => ({ status: sim.state.status, time: sim.state.time, sim, moves, error })

  for (const step of steps) {
    if (sim.state.status !== 'playing') break
    if ('wait' in step) {
      for (let t = 0; t < step.wait; t += DT) sim.step(DT)
    } else if ('flick' in step) {
      const mote = sim.state.motes.find((m) => m.id === `mote-${step.flick}`)
      if (!mote || mote.state !== 'free') return fail(`mote ${step.flick} cannot be flicked`)
      kickTo(sim, mote, step.toward)
    } else if ('gather' in step) {
      const error = gather(sim, step.gather, step.at, step.layer)
      if (error) return fail(error)
    } else if ('feed' in step) {
      const piece = pieceFrom(sim, step.feed, step.layer)
      if (!piece) return fail(`no piece on the field from slot ${step.feed}${step.layer === undefined ? '' : ` layer ${step.layer}`} to feed`)
      const start = sim.state.time
      while (piece.state === 'charging' && onField(sim, piece) && sim.state.status === 'playing' && sim.state.time - start < fillTimeout) {
        if (!sim.state.motes.some((m) => m.vel || m.state === 'traveling')) feedOne(sim, piece)
        sim.step(DT)
      }
    } else if ('place' in step) {
      const rune = runeInSlot(sim, step.place)
      if (!rune || !sim.place(rune.id, step.at)) return fail(`cannot place slot ${step.place} at ${step.at.x},${step.at.y}`)
    } else {
      const piece = pieceFrom(sim, step.tap, step.layer)
      if (!piece) return fail(`no piece on the field from slot ${step.tap}${step.layer === undefined ? '' : ` layer ${step.layer}`}`)
      const start = sim.state.time
      while (piece.state === 'charging' && onField(sim, piece) && sim.state.status === 'playing' && sim.state.time - start < fillTimeout) sim.step(DT)
      if (sim.state.status !== 'playing') break
      if (!onField(sim, piece)) return fail(`slot ${step.tap}'s piece burned before it burst`)
      if (piece.state !== 'full') return fail(`slot ${step.tap}'s piece did not fill`)
      sim.detonate(piece.id)
    }
  }
  const settleEnd = sim.state.time + (opts.settle ?? 20)
  while (sim.state.status === 'playing' && sim.state.time < settleEnd) sim.step(DT)
  return { status: sim.state.status, time: sim.state.time, sim, moves }
}

// A competent (not optimal) player for tuning endless: taps linked full
// pieces, recycles unlinked ones after a wait (or before their fuse runs
// out), and casts a rune only where its catch ring covers enough matching
// motes to fill it, preferring spots that link.
export function runCompetent(level: LevelData, seed: number, maxSeconds = 600, opts: SimOptions = {}): RunResult {
  const sim = new Sim(level, { seed, ...opts })
  const moves = recordMoves(sim)
  const s = () => sim.state
  let cooldown = 0
  let idleWait = 0
  const fullSince = new Map<string, number>()
  while (s().status === 'playing' && s().time < maxSeconds) {
    sim.step(DT)
    cooldown -= DT
    if (cooldown > 0) continue
    cooldown = 0.9
    for (const p of s().pieces) if (p.state === 'full' && !fullSince.has(p.id)) fullSince.set(p.id, s().time)
    const full = s().pieces.filter((p) => p.state === 'full')
    const linked = full.find((p) => p.linkedObstacleId)
    const due = (p: Piece) => Math.min(p.freezeAt ?? Infinity, p.burnAt ?? Infinity) - s().time < 2
    const stale = full.find((p) => s().time - (fullSince.get(p.id) ?? 0) > 4 || due(p))
    const toTap = linked ?? stale
    if (toTap) {
      fullSince.delete(toTap.id)
      sim.detonate(toTap.id)
      continue
    }
    let best: { id: string; at: Vec2; score: number } | null = null
    let partial: { id: string; at: Vec2; score: number } | null = null
    for (const rune of s().runes) {
      const layer = outerLayer(rune)
      if (rune.state !== 'idle' || !layer) continue
      const f = s().field
      for (let y = f.y + layer.radius; y <= f.y + f.h - layer.radius; y += 12) {
        for (let x = f.x + layer.radius; x <= f.x + f.w - layer.radius; x += 12) {
          const at = { x, y }
          if (!sim.canPlace(rune.id, at)) continue
          const need = new Map<string, number>()
          for (const n of layer.nodes) need.set(n.catch, (need.get(n.catch) ?? 0) + 1)
          let got = 0
          for (const m of s().motes) {
            if (m.state !== 'free') continue
            const d = Math.hypot(m.home.x - x, m.home.y - y)
            if (Math.abs(d - layer.radius) > 8 + m.tether * 0.8) continue
            const c = m.color === 'generic' ? [...need.keys()].find((k) => (need.get(k) ?? 0) > 0) : m.color
            if (c && (need.get(c) ?? 0) > 0) {
              need.set(c, need.get(c)! - 1)
              got++
            }
          }
          const score = got + (sim.previewLink(rune.id, at) ? 5 : 0)
          if (got < layer.sides) {
            if (got > 0 && (!partial || score > partial.score)) partial = { id: rune.id, at, score }
            continue
          }
          if (!best || score > best.score) best = { id: rune.id, at, score }
        }
      }
    }
    const busy = s().pieces.some((p) => p.state === 'full') || s().motes.some((m) => m.state === 'traveling' || m.state === 'ejecting')
    const fallback = !busy && idleWait > 8 && !s().pieces.some((p) => p.state === 'charging') ? fallbackCast(sim) : null
    if (best) {
      sim.place(best.id, best.at)
      idleWait = 0
    } else if (!busy && (idleWait += 0.9) > 4 && partial) {
      // Nothing better to do: gamble on the best partial spot, as a person would.
      sim.place(partial.id, partial.at)
      idleWait = 0
    } else if (fallback) {
      sim.place(fallback.id, fallback.at)
      idleWait = 0
    } else {
      // Nudge a mote a charging piece still needs (kicks go in random directions).
      for (const piece of s().pieces) {
        if (piece.state !== 'charging') continue
        const layer = piece.layer
        const want = new Set(layer.nodes.filter((_, i) => piece.held[i] === null).map((n) => n.catch as string))
        const band = (m: { home: Vec2 }) => Math.abs(Math.hypot(m.home.x - piece.pos.x, m.home.y - piece.pos.y) - layer.radius)
        const candidates = s().motes.filter((m) => m.state === 'free' && !m.vel && (want.has(m.color) || m.color === 'generic') && band(m) > 10)
        if (!candidates.length) continue
        candidates.sort((a, b) => band(a) - band(b))
        // Aim: tap on the far side so the mote coasts toward the nearest ring
        // point. Coast ~ speed / friction = KICK_GAIN * offset / 3, so an
        // offset of gap * 3 / 9 roughly lands it on the ring.
        const m = candidates[0]
        const cx = piece.pos.x
        const cy = piece.pos.y
        const d = Math.hypot(m.pos.x - cx, m.pos.y - cy) || 1
        const ring = { x: cx + ((m.pos.x - cx) / d) * layer.radius, y: cy + ((m.pos.y - cy) / d) * layer.radius }
        const gap = Math.hypot(ring.x - m.pos.x, ring.y - m.pos.y) || 1
        const offset = Math.min(26, (gap * 3) / 9)
        sim.kick(m.id, { x: m.pos.x - ((ring.x - m.pos.x) / gap) * offset, y: m.pos.y - ((ring.y - m.pos.y) / gap) * offset })
        break
      }
    }
  }
  return { status: s().status, time: s().time, sim, moves }
}

// When nothing sits on a catch ring anywhere: cast a layer the free motes
// could fill at the legal spot closest to those motes (to kick them in),
// or else dig: cast a layer that cannot fill, as far from the motes as
// possible, to bring a deeper one that can into hand.
function fallbackCast(sim: Sim): { id: string; at: Vec2 } | null {
  const s = sim.state
  const free = s.motes.filter((m) => m.state === 'free')
  const spots = (layer: RuneLayerSpec) => {
    const out: Vec2[] = []
    const f = s.field
    for (let y = f.y + layer.radius; y <= f.y + f.h - layer.radius; y += 12) for (let x = f.x + layer.radius; x <= f.x + f.w - layer.radius; x += 12) out.push({ x, y })
    return out
  }
  const catchesOf = (layer: RuneLayerSpec) => layer.nodes.map((n) => n.catch as string)
  let near: { id: string; at: Vec2; d: number } | null = null
  let dig: { id: string; at: Vec2; d: number } | null = null
  for (const rune of s.runes) {
    const layer = outerLayer(rune)
    if (rune.state !== 'idle' || !layer) continue
    const catches = catchesOf(layer)
    if (colorsCanCover(s, catches)) {
      const wanted = free.filter((m) => m.color === 'generic' || catches.includes(m.color))
      if (!wanted.length) continue
      const cx = wanted.reduce((a, m) => a + m.pos.x, 0) / wanted.length
      const cy = wanted.reduce((a, m) => a + m.pos.y, 0) / wanted.length
      for (const at of spots(layer)) {
        const d = Math.hypot(at.x - cx, at.y - cy)
        if ((!near || d < near.d) && sim.canPlace(rune.id, at)) near = { id: rune.id, at, d }
      }
    } else if (!near) {
      const next = rune.layers[rune.index + 1]
      if (!next || rune.index + 2 >= rune.layers.length || !colorsCanCover(s, catchesOf(next))) continue
      for (const at of spots(layer)) {
        const d = Math.min(...free.map((m) => Math.hypot(at.x - m.pos.x, at.y - m.pos.y)))
        if ((!dig || d > dig.d) && sim.canPlace(rune.id, at)) dig = { id: rune.id, at, d }
      }
    }
  }
  return near ?? dig
}

// A careless player: at human pace, taps any full piece, otherwise casts a
// random rune at a random legal spot. Ignores color, links and order.
export function runCareless(level: LevelData, seed: number, maxSeconds = 240): RunResult {
  const sim = new Sim(level, { seed })
  const moves = recordMoves(sim)
  const agent = { rng: (seed * 7919) >>> 0 || 1 }
  let cooldown = 0
  while (sim.state.status === 'playing' && sim.state.time < maxSeconds) {
    sim.step(DT)
    cooldown -= DT
    if (cooldown > 0) continue
    cooldown = 1 + nextRandom(agent)
    const full = sim.state.pieces.find((p) => p.state === 'full')
    if (full) {
      sim.detonate(full.id)
      continue
    }
    const idle = sim.state.runes.filter((r) => r.state === 'idle')
    if (!idle.length) continue
    const rune = idle[Math.floor(nextRandom(agent) * idle.length)]
    const f = sim.state.field
    for (let tries = 0; tries < 25; tries++) {
      const at = { x: f.x + nextRandom(agent) * f.w, y: f.y + nextRandom(agent) * f.h }
      if (sim.place(rune.id, at)) break
    }
  }
  return { status: sim.state.status, time: sim.state.time, sim, moves }
}
