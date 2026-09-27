import { Sim, type SimOptions } from './Sim'
import { nextRandom } from './rng'
import type { LevelData, SimStatus, Vec2 } from './types'

export type ScriptStep =
  | { place: number; at: Vec2 } // hand slot -> field position
  | { tap: number } // wait for that slot's rune to fill, then detonate it
  | { wait: number } // seconds

export interface RunResult {
  status: SimStatus
  time: number
  sim: Sim
  error?: string // a step could not be performed (illegal placement, never filled)
}

const DT = 1 / 30

function runeInSlot(sim: Sim, slot: number) {
  return sim.state.runes.find((r) => r.slot === slot)
}

// Plays a fixed sequence of actions, then lets the board settle until the
// sim decides (or `settle` seconds pass). Drift randomness comes from `seed`.
export function runScript(level: LevelData, steps: ScriptStep[], opts: SimOptions & { fillTimeout?: number; settle?: number } = {}): RunResult {
  const sim = new Sim(level, opts)
  const fillTimeout = opts.fillTimeout ?? 30
  const fail = (error: string): RunResult => ({ status: sim.state.status, time: sim.state.time, sim, error })

  for (const step of steps) {
    if (sim.state.status !== 'playing') break
    if ('wait' in step) {
      for (let t = 0; t < step.wait; t += DT) sim.step(DT)
    } else if ('place' in step) {
      const rune = runeInSlot(sim, step.place)
      if (!rune || !sim.place(rune.id, step.at)) return fail(`cannot place slot ${step.place} at ${step.at.x},${step.at.y}`)
    } else {
      const rune = runeInSlot(sim, step.tap)
      if (!rune) return fail(`no rune in slot ${step.tap}`)
      const start = sim.state.time
      while (rune.state === 'charging' && sim.state.status === 'playing' && sim.state.time - start < fillTimeout) sim.step(DT)
      if (sim.state.status !== 'playing') break
      // Re-resolve: undo-free runs keep object identity, but be safe.
      const live = sim.rune(rune.id)!
      if (live.state !== 'full') return fail(`slot ${step.tap} did not fill (state ${live.state})`)
      sim.detonate(live.id)
    }
  }
  const settleEnd = sim.state.time + (opts.settle ?? 20)
  while (sim.state.status === 'playing' && sim.state.time < settleEnd) sim.step(DT)
  return { status: sim.state.status, time: sim.state.time, sim }
}

// A competent (not optimal) player for tuning endless: taps linked full
// runes, recycles unlinked ones after a wait, and places a rune only where
// its catch ring covers enough matching motes to fill it, preferring spots
// that link.
export function runCompetent(level: LevelData, seed: number, maxSeconds = 600, opts: SimOptions = {}): RunResult {
  const sim = new Sim(level, { seed, ...opts })
  const s = () => sim.state
  let cooldown = 0
  let idleWait = 0
  const fullSince = new Map<string, number>()
  while (s().status === 'playing' && s().time < maxSeconds) {
    sim.step(DT)
    cooldown -= DT
    if (cooldown > 0) continue
    cooldown = 0.9
    for (const r of s().runes) if (r.state === 'full' && !fullSince.has(r.id)) fullSince.set(r.id, s().time)
    const full = s().runes.filter((r) => r.state === 'full')
    const linked = full.find((r) => r.linkedObstacleId)
    const stale = full.find((r) => s().time - (fullSince.get(r.id) ?? 0) > 4)
    const toTap = linked ?? stale
    if (toTap) {
      fullSince.delete(toTap.id)
      sim.detonate(toTap.id)
      continue
    }
    let best: { id: string; at: Vec2; score: number } | null = null
    let partial: { id: string; at: Vec2; score: number } | null = null
    for (const rune of s().runes) {
      if (rune.state !== 'idle') continue
      const layer = rune.layers[rune.index]
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
    const busy = s().runes.some((r) => r.state === 'full') || s().motes.some((m) => m.state === 'traveling' || m.state === 'ejecting')
    if (best) {
      sim.place(best.id, best.at)
      idleWait = 0
    } else if (!busy && (idleWait += 0.9) > 4 && partial) {
      // Nothing better to do: gamble on the best partial spot, as a person would.
      sim.place(partial.id, partial.at)
      idleWait = 0
    } else {
      // Nudge a mote a charging rune still needs (kicks go in random directions).
      for (const rune of s().runes) {
        if (rune.state !== 'charging' || !rune.pos) continue
        const layer = rune.layers[rune.index]
        const want = new Set(layer.nodes.filter((_, i) => rune.held[i] === null).map((n) => n.catch as string))
        const band = (m: { home: Vec2 }) => Math.abs(Math.hypot(m.home.x - rune.pos!.x, m.home.y - rune.pos!.y) - layer.radius)
        const candidates = s().motes.filter((m) => m.state === 'free' && !m.vel && (want.has(m.color) || m.color === 'generic') && band(m) > 10)
        if (!candidates.length) continue
        candidates.sort((a, b) => band(a) - band(b))
        sim.kick(candidates[0].id)
        break
      }
    }
  }
  return { status: s().status, time: s().time, sim }
}

// A careless player: at human pace, taps any full rune, otherwise drops a
// random idle rune at a random legal spot. Ignores color, links and order.
export function runCareless(level: LevelData, seed: number, maxSeconds = 240): RunResult {
  const sim = new Sim(level, { seed })
  const agent = { rng: (seed * 7919) >>> 0 || 1 }
  let cooldown = 0
  while (sim.state.status === 'playing' && sim.state.time < maxSeconds) {
    sim.step(DT)
    cooldown -= DT
    if (cooldown > 0) continue
    cooldown = 1 + nextRandom(agent)
    const full = sim.state.runes.find((r) => r.state === 'full')
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
  return { status: sim.state.status, time: sim.state.time, sim }
}
