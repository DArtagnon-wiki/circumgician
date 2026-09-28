import { describe, expect, it } from 'vitest'
import { PACK } from './pack'
import { intendedLine } from './lines'
import { runScript } from '../../sim/headless'
import { profileLevel, tensionAlong } from '../../sim/solver'
import { tensionShape } from '../../sim/solverReport'

// Design gates, checked with the economy solver (src/sim/solver.ts; see
// `npm run analyze-levels` for the full profiles). Every level can be
// cleared without wasting a blow. A dilemma level has exactly the winning
// plans it was built around, and a tempting move that loses, where the
// game does not say so until at least two moves later.
const DILEMMAS: Record<string, { plans: number }> = {
  'the-weighing': { plans: 1 },
  patience: { plans: 1 },
  'the-sacrifice': { plans: 1 },
  'the-wildcard': { plans: 1 },
  'the-price': { plans: 1 },
  circumgician: { plans: 1 },
}

// Levels built around a tension arc (see Tension in solver.ts): along the
// intended line, tension must release at least this often before the win.
const ARCS: Record<string, { releases: number }> = {
  'the-price': { releases: 1 },
}

describe('pack decision profiles', () => {
  for (const level of PACK) {
    const gate = DILEMMAS[level.id]
    it(`${level.id}: winnable without waste${gate ? ', with a hidden trap' : ''}`, () => {
      const p = profileLevel(level)
      expect(p.winnable).toBe(true)
      expect(p.cleanest).toBe(0)
      if (!gate) return
      expect(p.plans).toHaveLength(gate.plans)
      expect(p.traps.some((t) => t.revealedAfter >= 2)).toBe(true)
    })
  }

  for (const [id, arc] of Object.entries(ARCS)) {
    it(`${id}: tension ebbs and flows along the intended line`, () => {
      const level = PACK.find((l) => l.id === id)!
      const run = runScript(level, intendedLine(id)!.steps, { seed: 1 })
      const points = tensionAlong(level, run.moves)!
      expect(tensionShape(points).releases).toBeGreaterThanOrEqual(arc.releases)
    })
  }
})
