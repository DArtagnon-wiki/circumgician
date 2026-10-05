import { describe, expect, it } from 'vitest'
import { PACK } from './pack'
import { intendedLine } from './lines'
import { runScript } from '../../sim/headless'
import { profileLevel, tensionAlong, tensionBands } from '../../sim/solver'

// The deck's progression, checked with the economy solver (see `npm run
// analyze-levels`). Every level can be won without waste, and within a
// section of the deck (a suit, or the Major Arcana: an `arc`) each takes
// more blows than the one before (a blow is a fill and a detonation: two
// moves). The first three Coins stay calm along their intended line. Most
// levels are `shaped`: built bead by bead, with several cruxes and no
// decoys, they are held to the shape of their graph (shape.test.ts) rather
// than to tension along one line. The hand-made ones (some of the Staves)
// have one crux at the given blow: whatever path led there, every winning
// line is tense (.9+) with at least half its moves losing, and after it only
// clean-up (.35 at most on any line); their crux moves no nearer the end
// from one to the next. Where a level has other moves besides fills and
// detonations (a pair's two pieces latching on, say), `moves` is its
// shortest win in moves. A level with a live decoy (a rune fillable from the
// start whose use quietly costs the level) builds up to its crux higher than
// .5: `buildUp` is how high.
const PROGRESSION: Record<string, { blows: number; crux?: number; arc?: true; moves?: number; buildUp?: number; shaped?: true }> = {
  'coins-ace': { blows: 2 },
  'coins-2': { blows: 3 },
  'coins-3': { blows: 4 },
  'coins-4': { blows: 5, shaped: true },
  'coins-5': { blows: 6, shaped: true },
  'coins-6': { blows: 7, shaped: true },
  'coins-7': { blows: 8, shaped: true },
  'coins-8': { blows: 9, shaped: true },
  'coins-9': { blows: 10, shaped: true },
  'coins-10': { blows: 11, shaped: true },
  'coins-page': { blows: 12, shaped: true },
  'coins-knight': { blows: 13, shaped: true },
  'coins-queen': { blows: 14, shaped: true },
  'coins-king': { blows: 15, shaped: true },
  'cups-ace': { blows: 4, arc: true, shaped: true },
  'cups-2': { blows: 5, shaped: true },
  'cups-3': { blows: 6, shaped: true },
  'cups-4': { blows: 7, shaped: true },
  'cups-5': { blows: 8, shaped: true },
  'cups-6': { blows: 9, shaped: true },
  'cups-7': { blows: 10, shaped: true },
  'cups-8': { blows: 11, shaped: true },
  'cups-9': { blows: 12, shaped: true },
  'cups-10': { blows: 13, shaped: true },
  'cups-page': { blows: 14, shaped: true },
  'cups-knight': { blows: 15, shaped: true },
  'cups-queen': { blows: 16, shaped: true },
  'cups-king': { blows: 17, shaped: true },
  'swords-ace': { blows: 4, arc: true, shaped: true },
  'swords-2': { blows: 5, shaped: true },
  'swords-3': { blows: 6, shaped: true },
  'swords-4': { blows: 7, shaped: true },
  'swords-5': { blows: 8, shaped: true },
  'swords-6': { blows: 9, shaped: true },
  'swords-7': { blows: 10, shaped: true },
  'swords-8': { blows: 11, shaped: true },
  'swords-9': { blows: 12, shaped: true },
  'swords-10': { blows: 13, shaped: true },
  'swords-page': { blows: 14, shaped: true },
  'swords-knight': { blows: 15, shaped: true },
  'swords-queen': { blows: 16, shaped: true },
  'swords-king': { blows: 17, shaped: true },
  'staves-ace': { blows: 4, arc: true, shaped: true },
  'staves-2': { blows: 5, shaped: true },
  'staves-3': { blows: 6, shaped: true },
  'staves-4': { blows: 7, crux: 6 },
  'staves-5': { blows: 8, crux: 7, moves: 17, buildUp: 0.8 },
  'staves-6': { blows: 9, crux: 7 },
  'staves-7': { blows: 10, crux: 8, buildUp: 0.8 },
  'staves-8': { blows: 11, crux: 9, buildUp: 0.8 },
  'staves-9': { blows: 12, crux: 10, moves: 25, buildUp: 0.8 },
}

describe('pack tension progression', () => {
  it('every level has a place in it; within an arc each is longer, and its crux no nearer the end, than the last', () => {
    const steps = PACK.map((l) => PROGRESSION[l.id])
    steps.forEach((step, i) => expect(step, PACK[i].id).toBeDefined())
    for (let i = 1; i < steps.length; i++) {
      if (steps[i].arc) continue
      expect(steps[i].blows, PACK[i].id).toBeGreaterThan(steps[i - 1].blows)
      if (steps[i].shaped || steps[i - 1].shaped) continue
      const after = (s: { blows: number; crux?: number }) => (s.crux === undefined ? -1 : s.blows - s.crux)
      expect(after(steps[i]), PACK[i].id).toBeGreaterThanOrEqual(after(steps[i - 1]))
    }
  })

  for (const level of PACK) {
    const step = PROGRESSION[level.id]
    if (!step) continue
    it(`${level.id}: ${step.blows} blows${step.shaped ? ', shaped' : step.crux ? `, crux at blow ${step.crux}` : ', calm'}`, () => {
      const p = profileLevel(level)
      expect(p.winnable).toBe(true)
      expect(p.cleanest).toBe(0)
      const { bands, fewestMoves } = tensionBands(level)
      expect(fewestMoves).toBe(step.moves ?? 2 * step.blows)
      if (step.shaped) return
      const run = runScript(level, intendedLine(level.id)!.steps, { seed: 1 })
      const points = tensionAlong(level, run.moves)!
      const beats = points.map((b) => b.tension.tension)
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
      // The build-up: the beats after at most crux - 2 blows (a pair's
      // burst is two).
      let blows = 0
      for (const b of points) {
        if (b.after?.kind === 'fire') blows += b.after.with ? 2 : 1
        if (blows > step.crux - 2) break
        expect(b.tension.tension, 'building up to the crux').toBeLessThanOrEqual(step.buildUp ?? 0.5)
      }
    }, 60_000)
  }
})
