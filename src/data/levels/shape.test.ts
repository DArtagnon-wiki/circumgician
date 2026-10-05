import { describe, expect, it } from 'vitest'
import { DEBUG_PACK, PACK } from './pack'
import { levelShape, totalHoldOff } from '../../sim/shape'

// The graph of a level (see sim/shape.ts): it opens out, loses some branches, collapses into a
// crux, opens out again, and so on to the win. A crux is a stretch where at most two futures
// remain, and it is earned when wrong moves lose just before it. `holdOff` counts the states
// where a rune could strike a layer it fits and should wait, because the one that fits is not
// ready; `corridor` is the longest run of moves with one state and nothing to choose.
const SHAPE: Record<string, { cruxes: number; holdOff: number; corridor?: number }> = {
  'hollow-bowls-v2': { cruxes: 2, holdOff: 4 },
  // register.mjs: begin
  'the-long-stair': { cruxes: 8, holdOff: 45 },
  'coins-4': { cruxes: 1, holdOff: 3 },
  'coins-5': { cruxes: 1, holdOff: 4 },
  'coins-6': { cruxes: 1, holdOff: 8 },
  'coins-7': { cruxes: 2, holdOff: 5 },
  'coins-8': { cruxes: 2, holdOff: 6 },
  'coins-9': { cruxes: 2, holdOff: 8 },
  'coins-page': { cruxes: 2, holdOff: 12 },
  'coins-king': { cruxes: 3, holdOff: 13 },
  'cups-6': { cruxes: 2, holdOff: 5 },
  'cups-7': { cruxes: 2, holdOff: 7 },
  'cups-9': { cruxes: 2, holdOff: 10 },
  'cups-10': { cruxes: 3, holdOff: 10 },
  'swords-4': { cruxes: 1, holdOff: 6 },
  'swords-6': { cruxes: 2, holdOff: 5 },
  'swords-7': { cruxes: 2, holdOff: 3 },
  'swords-9': { cruxes: 2, holdOff: 10 },
  'swords-10': { cruxes: 3, holdOff: 9 },
  'swords-knight': { cruxes: 3, holdOff: 6 },
  'swords-queen': { cruxes: 3, holdOff: 20 },
  'swords-king': { cruxes: 4, holdOff: 14 },
  'cups-king': { cruxes: 4, holdOff: 28 },
  'cups-queen': { cruxes: 3, holdOff: 25 },
  'coins-queen': { cruxes: 3, holdOff: 11 },
  'cups-knight': { cruxes: 3, holdOff: 22 },
  'swords-page': { cruxes: 3, holdOff: 13 },
  'cups-page': { cruxes: 3, holdOff: 24 },
  'coins-knight': { cruxes: 3, holdOff: 6 },
  'coins-10': { cruxes: 2, holdOff: 11 },
  'cups-8': { cruxes: 2, holdOff: 11 },
  'swords-8': { cruxes: 2, holdOff: 8 },
  'cups-5': { cruxes: 2, holdOff: 4 },
  'swords-5': { cruxes: 2, holdOff: 2 },
  'swords-3': { cruxes: 1, holdOff: 3 },
  'cups-2': { cruxes: 1, holdOff: 2 },
  'cups-3': { cruxes: 1, holdOff: 3 },
  'cups-4': { cruxes: 1, holdOff: 5 },
  'swords-ace': { cruxes: 1, holdOff: 1 },
  'swords-2': { cruxes: 1, holdOff: 2 },
  'cups-ace': { cruxes: 1, holdOff: 1, corridor: 4 },
  'staves-ace': { cruxes: 1, holdOff: 2 },
  'staves-2': { cruxes: 1, holdOff: 4 },
  'staves-3': { cruxes: 1, holdOff: 5 },
  // register.mjs: end
}

describe('level shape', () => {
  for (const [id, want] of Object.entries(SHAPE)) {
    const level = [...PACK, ...DEBUG_PACK].find((l) => l.id === id)
    it(`${id}: ${want.cruxes} cruxes, ${want.holdOff}+ states that hold off`, () => {
      expect(level, id).toBeDefined()
      const shape = levelShape(level!)!
      expect(shape, 'winnable').not.toBeNull()
      expect(shape.pinches.filter((p) => p.earned).length, 'earned cruxes').toBeGreaterThanOrEqual(want.cruxes)
      expect(totalHoldOff(shape), 'states that hold off').toBeGreaterThanOrEqual(want.holdOff)
      expect(shape.corridor, 'longest forced run').toBeLessThanOrEqual(want.corridor ?? 3)
    }, 120_000)
  }
})
