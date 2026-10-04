import { describe, expect, it } from 'vitest'
import { DEBUG_PACK, PACK } from './pack'
import { LINES } from './lines'
import { decoyLayers, deadLayers } from '../../sim/dead'

// Every rune layer has to be good for something: hit an obstacle, latch on,
// wait in stasis, or be a move the level cannot be won without. A rune that
// can never do any of these is a rune to puzzle over for nothing (see
// sim/dead.ts).
//
// And better still, no decoys: a layer that no winning line fires is a rune
// that only exists to cause a failure. What should tempt is the order of the
// real runes: a rune that can strike a layer now (a four-damage layer on five
// hp) and should hold off, because the one that fits (five damage) is not
// ready yet, and it will be wanted later for a layer of four hp or less.
// Levels that are free of decoys stay so; the rest are the old ones, listed
// by what is left to rework.
//
// A level with a fuse is exempt: its top layers are there to be dug through
// and burned.
const DEAD: Record<string, string[]> = {
  'the-long-winter': ['1.2'], // four blue bowls striking a triangle while none is ever on top to strike
}
const FREE = new Set(['first-threads', 'changing-colors', 'the-weighing', 'hollow-bowls', 'borrowed-light', 'hollow-bowls-v2'])

describe('runes', () => {
  // The pack, then any debug-pack level that ships lines of its own (pilots).
  for (const level of [...PACK, ...DEBUG_PACK.filter((l) => LINES[l.id])]) {
    if (level.fuse !== undefined) continue
    it(`${level.id}: no layer is dead`, () => {
      const dead = deadLayers(level).map((d) => `${d.rune}.${d.layer}`)
      expect(dead, level.id).toEqual(DEAD[level.id] ?? [])
    }, 60_000)
    if (FREE.has(level.id)) {
      it(`${level.id}: no decoys, every layer is on a winning line`, () => {
        expect(decoyLayers(level), level.id).toEqual([])
      }, 60_000)
    }
  }
})
