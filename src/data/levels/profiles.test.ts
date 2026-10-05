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
// latching on, say), `moves` is its shortest win in moves. A level with a
// live decoy (a rune fillable from the start whose use quietly costs the
// level) builds up to its crux higher than .5: `buildUp` is how high. A
// `shaped` level is built bead by bead, with several cruxes and no decoys:
// tension along one line says little about it, so it is held to the shape of
// its graph instead (shape.test.ts).
const PROGRESSION: Record<string, { blows: number; crux?: number; arc?: true; moves?: number; buildUp?: number; shaped?: true }> = {
  'first-threads': { blows: 2 },
  'changing-colors': { blows: 3 },
  'the-weighing': { blows: 4 },
  'the-hungry-circle': { blows: 5, shaped: true },
  patience: { blows: 6, shaped: true },
  'crowded-circle': { blows: 7, shaped: true },
  'the-sacrifice': { blows: 8, shaped: true },
  'the-wildcard': { blows: 9, shaped: true },
  'the-price': { blows: 10, shaped: true },
  circumgician: { blows: 12, shaped: true },
  'the-crux': { blows: 15, shaped: true },
  'amber-in-ice': { blows: 7, crux: 6, arc: true },
  frostbite: { blows: 9, shaped: true },
  'the-rescue': { blows: 10, shaped: true },
  'two-winters': { blows: 12, shaped: true },
  'deep-winter': { blows: 13, shaped: true },
  'the-long-winter': { blows: 15, crux: 10 },
  kindling: { blows: 7, arc: true, shaped: true },
  'short-fuse': { blows: 9, shaped: true },
  firebreak: { blows: 10, shaped: true },
  backdraft: { blows: 12, shaped: true },
  wildfire: { blows: 13, shaped: true },
  phoenix: { blows: 15, shaped: true },
  'hollow-bowls': { blows: 7, crux: 6, arc: true },
  'two-hands': { blows: 8, crux: 7, moves: 17, buildUp: 0.8 },
  'borrowed-light': { blows: 9, crux: 7 },
  'the-aegis': { blows: 10, crux: 8, buildUp: 0.8 },
  'the-ashen-key': { blows: 11, crux: 9, buildUp: 0.8 },
  'the-crown': { blows: 12, crux: 10, moves: 25, buildUp: 0.8 },
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
