import { describe, expect, it } from 'vitest'
import { PACK } from './pack'
import { profileLevel } from '../../sim/solver'

// Design gates, checked with the economy solver (src/sim/solver.ts; see
// `npm run analyze-levels` for the full profiles).
describe('pack decision profiles', () => {
  for (const level of PACK) {
    it(`${level.id}: winnable in the solver's model`, () => {
      expect(profileLevel(level).winnable).toBe(true)
    })
  }
})
