import { KICK_GAIN, MOTE_FRICTION } from './constants'
import { outerLayer } from './geometry'
import { Sim, type SimOptions } from './Sim'
import { nextRandom } from './rng'
import type { Move } from './solver'
import type { LevelData, SimStatus, Vec2 } from './types'

export type ScriptStep =
  | { place: number; at: Vec2 } // cast the layer in that hand slot at a field position
  | { tap: number; layer?: number } // wait for a piece from that slot (the oldest, or that stack layer) to fill, then detonate it
  | { wait: number } // seconds
  | { flick: number; toward: Vec2 } // kick the level's nth mote so it coasts to a point

export interface RunResult {
  status: SimStatus
  time: number
  sim: Sim
  moves: Move[] // what happened, as solver moves
  error?: string // a step could not be performed (illegal placement, never filled)
}

const DT = 1 / 30

// The run in the solver's terms (solver.ts): a fill when a piece becomes
// full, a fire at each detonation.
function recordMoves(sim: Sim): Move[] {
  const moves: Move[] = []
  sim.bus.on('piece:full', ({ piece }) => moves.push({ kind: 'fill', rune: piece.slot, layer: piece.depth }))
  sim.bus.on('piece:detonated', ({ piece, info }) => {
    const target = info.obstacleId === null ? null : sim.state.obstacles.findIndex((o) => o.id === info.obstacleId)
    moves.push({ kind: 'fire', rune: piece.slot, layer: piece.depth, target })
  })
  return moves
}

function runeInSlot(sim: Sim, slot: number) {
  return sim.state.runes.find((r) => r.slot === slot)
}

function pieceFrom(sim: Sim, slot: number, layer?: number) {
  return sim.state.pieces.find((p) => p.slot === slot && (layer === undefined || p.depth === layer))
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
      // A kicked mote coasts speed / MOTE_FRICTION, and a tap d away
      // kicks at KICK_GAIN * d, so tap that far behind it.
      const mote = sim.state.motes.find((m) => m.id === `mote-${step.flick}`)
      if (!mote || mote.state !== 'free') return fail(`mote ${step.flick} cannot be flicked`)
      const dx = step.toward.x - mote.pos.x
      const dy = step.toward.y - mote.pos.y
      const d = Math.hypot(dx, dy) || 1
      const back = (d * MOTE_FRICTION) / KICK_GAIN
      sim.kick(mote.id, { x: mote.pos.x - (dx / d) * back, y: mote.pos.y - (dy / d) * back })
    } else if ('place' in step) {
      const rune = runeInSlot(sim, step.place)
      if (!rune || !sim.place(rune.id, step.at)) return fail(`cannot place slot ${step.place} at ${step.at.x},${step.at.y}`)
    } else {
      const piece = pieceFrom(sim, step.tap, step.layer)
      if (!piece) return fail(`no piece on the field from slot ${step.tap}${step.layer === undefined ? '' : ` layer ${step.layer}`}`)
      const start = sim.state.time
      while (piece.state === 'charging' && sim.state.status === 'playing' && sim.state.time - start < fillTimeout) sim.step(DT)
      if (sim.state.status !== 'playing') break
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
    const stale = full.find((p) => s().time - (fullSince.get(p.id) ?? 0) > 4 || (p.freezeAt !== undefined && p.freezeAt - s().time < 2))
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
    if (best) {
      sim.place(best.id, best.at)
      idleWait = 0
    } else if (!busy && (idleWait += 0.9) > 4 && partial) {
      // Nothing better to do: gamble on the best partial spot, as a person would.
      sim.place(partial.id, partial.at)
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
