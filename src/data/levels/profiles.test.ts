import { describe, expect, it } from 'vitest'
import { PACK } from './pack'
import { intendedLine } from './lines'
import { runScript } from '../../sim/headless'
import { profileLevel, tensionAlong, tensionBands } from '../../sim/solver'

// The pack's tension progression, checked with the economy solver (see
// `npm run analyze-levels`). Every level can be won without waste and takes
// more blows than the one before (a blow is a fill and a detonation: two
// moves). The first three stay calm along their intended line. From the
// fourth on, each has a crux at the given blow: whatever path led there,
// every winning line is tense (.9+) with at least half its moves losing,
// and after it only clean-up (.35 at most on any line). The crux starts at
// the last blow and moves back toward two thirds; everything else has
// motes to spare. The ice and frost levels start a second arc (`arc`): back
// to the sixth level's length, building to the eleventh's; so do the fire
// levels, and the levels of nulls, pairs and borrowed cups. Where a level
// has other moves besides fills and detonations (a pair's two pieces
// latching on, say), `moves` is its shortest win in moves.
const PROGRESSION: Record<string, { blows: number; crux?: number; arc?: true; moves?: number }> = {
  'first-threads': { blows: 2 },
  'changing-colors': { blows: 3 },
  'the-weighing': { blows: 4 },
  'the-hungry-circle': { blows: 5, crux: 5 },
  patience: { blows: 6, crux: 5 },
  'crowded-circle': { blows: 7, crux: 6 },
  'the-sacrifice': { blows: 8, crux: 6 },
  'the-wildcard': { blows: 9, crux: 7 },
  'the-price': { blows: 10, crux: 7 },
  circumgician: { blows: 12, crux: 8 },
  'the-crux': { blows: 15, crux: 10 },
  'amber-in-ice': { blows: 7, crux: 6, arc: true },
  frostbite: { blows: 9, crux: 7 },
  'the-rescue': { blows: 10, crux: 7 },
  'two-winters': { blows: 12, crux: 8 },
  'deep-winter': { blows: 13, crux: 9 },
  'the-long-winter': { blows: 15, crux: 10 },
  kindling: { blows: 7, crux: 6, arc: true },
  'short-fuse': { blows: 9, crux: 7 },
  firebreak: { blows: 10, crux: 7 },
  backdraft: { blows: 12, crux: 8 },
  wildfire: { blows: 13, crux: 9 },
  phoenix: { blows: 15, crux: 10 },
  'hollow-bowls': { blows: 7, crux: 6, arc: true },
  'two-hands': { blows: 8, crux: 7, moves: 17 },
  'borrowed-light': { blows: 9, crux: 7 },
  'the-aegis': { blows: 10, crux: 8 },
  'the-ashen-key': { blows: 11, crux: 9 },
}

describe('pack tension progression', () => {
  it('every level has a place in it; within an arc each is longer, and its crux no nearer the end, than the last', () => {
    const steps = PACK.map((l) => PROGRESSION[l.id])
    steps.forEach((step, i) => expect(step, PACK[i].id).toBeDefined())
    for (let i = 1; i < steps.length; i++) {
      if (steps[i].arc) continue
      expect(steps[i].blows, PACK[i].id).toBeGreaterThan(steps[i - 1].blows)
      const after = (s: { blows: number; crux?: number }) => (s.crux === undefined ? -1 : s.blows - s.crux)
      expect(after(steps[i]), PACK[i].id).toBeGreaterThanOrEqual(after(steps[i - 1]))
    }
  })

  for (const level of PACK) {
    const step = PROGRESSION[level.id]
    if (!step) continue
    it(`${level.id}: ${step.blows} blows${step.crux ? `, crux at blow ${step.crux}` : ', calm'}`, () => {
      const p = profileLevel(level)
      expect(p.winnable).toBe(true)
      expect(p.cleanest).toBe(0)
      const { bands, fewestMoves } = tensionBands(level)
      expect(fewestMoves).toBe(step.moves ?? 2 * step.blows)
      const run = runScript(level, intendedLine(level.id)!.steps, { seed: 1 })
      const beats = tensionAlong(level, run.moves)!.map((b) => b.tension.tension)
      if (step.crux === undefined) {
        for (const t of beats) expect(t).toBeLessThanOrEqual(0.35)
        return
      }
      const depth = 2 * (step.crux - 1) // after the blows before it, before its fill
      const crux = bands.find((b) => b.depth === depth)!
      expect(crux.min, 'the calmest line at the crux').toBeGreaterThanOrEqual(0.9)
      expect(crux.minPeril, 'moves that lose at the crux').toBeGreaterThanOrEqual(0.5)
      for (const b of bands) {
        if (b.depth < depth) expect(b.min, `move ${b.depth} comes before the crux`).toBeLessThan(0.9)
        if (b.depth >= depth + 2) expect(b.max, `move ${b.depth} is clean-up`).toBeLessThanOrEqual(0.35)
      }
      for (const t of beats.slice(0, step.crux - 1)) expect(t, 'building up to the crux').toBeLessThanOrEqual(0.5)
    }, 60_000)
  }
})
