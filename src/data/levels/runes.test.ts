import { describe, expect, it } from 'vitest'
import { DEBUG_PACK, PACK } from './pack'
import { LINES } from './lines'
import { deadLayers } from '../../sim/dead'

// Every rune layer has to be good for something: hit an obstacle, latch on,
// wait in stasis, or be a move the level cannot be won without. A rune that
// can never do any of these is a rune to puzzle over for nothing (see
// sim/dead.ts). Decoys are fine, and wanted, but a decoy has to be able to
// hit something and cost the level a little.
//
// A level with a fuse is exempt: its top layers are there to be dug through
// and burned. And one older level still carries a layer to rework.
const KNOWN: Record<string, string[]> = {
  'the-long-winter': ['1.2'], // four blue bowls striking a triangle while none is ever on top to strike
}

describe('runes', () => {
  // The pack, then any debug-pack level that ships lines of its own (pilots).
  for (const level of [...PACK, ...DEBUG_PACK.filter((l) => LINES[l.id])]) {
    if (level.fuse !== undefined) continue
    it(`${level.id}: no layer is dead`, () => {
      const dead = deadLayers(level).map((d) => `${d.rune}.${d.layer}`)
      expect(dead, level.id).toEqual(KNOWN[level.id] ?? [])
    }, 60_000)
  }
})
