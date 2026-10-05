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
  'the-hungry-circle': { cruxes: 1, holdOff: 3 },
  'patience': { cruxes: 1, holdOff: 4 },
  'crowded-circle': { cruxes: 1, holdOff: 8 },
  'the-sacrifice': { cruxes: 2, holdOff: 5 },
  'the-wildcard': { cruxes: 2, holdOff: 6 },
  'the-price': { cruxes: 2, holdOff: 8 },
  'circumgician': { cruxes: 2, holdOff: 12 },
  'the-crux': { cruxes: 3, holdOff: 13 },
  'frostbite': { cruxes: 2, holdOff: 5 },
  'the-rescue': { cruxes: 2, holdOff: 7 },
  'two-winters': { cruxes: 2, holdOff: 10 },
  'deep-winter': { cruxes: 3, holdOff: 10 },
  'kindling': { cruxes: 1, holdOff: 6 },
  'short-fuse': { cruxes: 2, holdOff: 5 },
  'firebreak': { cruxes: 2, holdOff: 3 },
  'backdraft': { cruxes: 2, holdOff: 10 },
  'wildfire': { cruxes: 3, holdOff: 9 },
  'phoenix': { cruxes: 3, holdOff: 6 },
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
