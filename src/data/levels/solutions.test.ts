import { describe, expect, it } from 'vitest'
import { PACK } from './pack'
import { LINES } from './lines'
import { runCareless, runScript } from '../../sim/headless'
import { economyWon, moveLabel, replay } from '../../sim/solver'

// Every curated level's scripted lines (lines.ts) in the real sim, over
// several drift seeds.
const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]

describe('curated pack solutions', () => {
  it('every pack level has scripted lines', () => {
    for (const level of PACK) expect(LINES[level.id], level.id).toBeDefined()
  })

  for (const level of PACK) {
    for (const line of LINES[level.id] ?? []) {
      it(`${level.id}: ${line.name} -> ${line.expect}`, () => {
        for (const seed of SEEDS) {
          const res = runScript(level, line.steps, { seed })
          const label = `${level.id} / ${line.name} / seed ${seed}${res.error ? ` (${res.error})` : ''}`
          if (line.expect === 'won') {
            expect(res.error, label).toBeUndefined()
            expect(res.status, label).toBe('won')
            if (line.name === 'intended') expect(res.sim.state.stats.wasted, label).toBe(0)
          } else if (line.expect === 'lost') {
            expect(res.status, label).toBe('lost')
          } else {
            expect(res.status, label).not.toBe('won')
          }
        }
      }, 120_000)
    }
  }

  // The solver (src/sim/solver.ts) abstracts geometry away; it must still
  // agree with the real sim about every intended line.
  for (const level of PACK) {
    const intended = LINES[level.id]?.find((line) => line.expect === 'won')
    if (!intended) continue
    it(`${level.id}: the intended line also wins in the solver's model`, () => {
      const run = runScript(level, intended.steps, { seed: 1 })
      const end = replay(level, run.moves)
      const log = run.moves.map(moveLabel).join(', ')
      expect(end, log).not.toBeNull()
      expect(economyWon(level, end!), log).toBe(true)
    }, 30_000)
  }

  // Careless play should almost always fail (level 1 is the gentle exception).
  for (const level of PACK.slice(1)) {
    it(`${level.id}: careless play rarely wins`, () => {
      let wins = 0
      for (let seed = 1; seed <= 20; seed++) if (runCareless(level, seed, 180).status === 'won') wins++
      expect(wins).toBeLessThanOrEqual(2)
    }, 30_000)
  }
})
