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
