import type { ScriptStep } from '../../sim/headless'
import { shapedLines } from './lines.shaped'

// Each curated level ships with its intended solution (must win for every
// drift seed, wasting no blow) and at least one plausible wrong line (must
// not win), checked in solutions.test.ts; the intended line is also what
// `npm run analyze-levels` measures tension along. Keep these in sync when
// tuning levels in the editor.
export type Expect = 'won' | 'lost' | 'not-won'
export interface Line {
  name: string
  steps: ScriptStep[]
  expect: Expect
}

const at = (x: number, y: number) => ({ x, y })
const place = (slot: number, p: { x: number; y: number }): ScriptStep => ({ place: slot, at: p })
const tap = (slot: number): ScriptStep => ({ tap: slot })
const feed = (slot: number, layer?: number): ScriptStep => (layer === undefined ? { feed: slot } : { feed: slot, layer })
const tapLayer = (slot: number, layer: number): ScriptStep => ({ tap: slot, layer })
// Cast the layer in hand at a spot, kick in the motes it needs, detonate it.
const cast = (slot: number, p: { x: number; y: number }): ScriptStep[] => [place(slot, p), feed(slot), tap(slot)]

type Spot = { x: number; y: number }

// Levels 12 and 17 (the two with blocks of ice, cool palette) keep the lines they were
// made with: each lays its two starting colors out in its own formation, and the runes
// that use them are cast left and right while feeding kicks the motes over. A frozen
// rune's ice sits bottom-left, far from the boss, so a blow cast top-right links to
// the boss and one cast beside the ice links to the ice.
const LEFT = at(100, 440)
const RIGHT = at(300, 440)
const casts = (...pairs: [number, Spot][]): ScriptStep[] => pairs.flatMap(([slot, p]) => cast(slot, p))
const PERIDOT_IN_ICE = { well: at(200, 540), ice: at(185, 632) }
const peridotToCrux = casts([0, LEFT], [1, RIGHT], [2, LEFT], [3, RIGHT], [4, PERIDOT_IN_ICE.well])
const WINTER = { frozen: at(84, 656), chip: at(190, 640), boss: at(316, 392), left: at(100, 392) }
const LONG = { chip: at(84, 550), ice: at(300, 622), mid: at(200, 580), aside: at(200, 392) } // aside: where the empty jade square waits
const longWinterToCrux = casts([4, WINTER.frozen], [0, LEFT], [1, RIGHT], [1, LEFT], [2, RIGHT], [2, RIGHT], [2, LEFT], [3, RIGHT], [3, LONG.chip])
const castLayer = (slot: number, p: Spot, layer: number): ScriptStep[] => [place(slot, p), feed(slot, layer), tapLayer(slot, layer)]

export const LINES: Record<string, Line[]> = {
  // Levels 1-3 are calm: plenty of every color, nothing that loses for good.
  'coins-ace': [
    { name: 'intended', expect: 'won', steps: [...cast(0, at(120, 470)), ...cast(1, at(280, 590))] },
    // Recoverable by kicking motes into the rings, so only "not won" untouched.
    { name: 'both runes off their motes', expect: 'not-won', steps: [place(0, at(300, 420)), place(1, at(110, 630))] },
  ],
  // The blue square fills at once and waits, unlinked, until the pentagon's
  // blow breaks the triangle. A spare blue layer forgives an early tap.
  'coins-2': [
    {
      name: 'intended',
      expect: 'won',
      steps: [place(0, at(130, 480)), place(1, at(280, 560)), feed(0), tap(0), feed(1), tap(1), ...cast(0, at(130, 480))],
    },
    { name: 'blue tapped with nothing to hit', expect: 'not-won', steps: [...cast(1, at(280, 560))] },
  ],
  // Where you drop picks the triangle a blow strikes: match 5, 4 and 3 to the
  // strengths. A spare blue triangle forgives a mis-aim.
  'coins-3': [
    { name: 'intended', expect: 'won', steps: [...cast(0, at(290, 430)), ...cast(1, at(110, 480)), ...cast(2, at(160, 610)), ...cast(3, at(290, 430))] },
    { name: 'the pentagon to the left', expect: 'not-won', steps: [...cast(0, at(110, 470))] },
  ],

  // Levels 4-11 and 13-16 and 18-23 are built bead by bead; their lines are in lines.shaped.ts.
  'amber-in-ice': [
    { name: 'intended', expect: 'won', steps: [...peridotToCrux, ...casts([5, PERIDOT_IN_ICE.ice], [0, PERIDOT_IN_ICE.well])] },
    { name: 'a tourmaline triangle first', expect: 'lost', steps: [...peridotToCrux, ...cast(2, PERIDOT_IN_ICE.well)] },
  ],
  'the-long-winter': [
    { name: 'intended', expect: 'won', steps: [...longWinterToCrux, ...cast(5, WINTER.boss), place(1, LONG.aside), ...castLayer(1, LONG.ice, 3), ...casts([5, WINTER.frozen], [4, RIGHT], [3, LEFT], [4, LONG.mid])] },
    { name: 'a lapis square at the boss', expect: 'lost', steps: [...longWinterToCrux, ...cast(0, WINTER.boss)] },
    { name: 'breaking the turquoise ice first', expect: 'not-won', steps: [...longWinterToCrux, place(1, LONG.aside), ...castLayer(1, LONG.ice, 3)] },
    { name: 'a lapis square finishing the rescue', expect: 'not-won', steps: [...longWinterToCrux, ...cast(1, LONG.chip)] },
  ],
}

// Levels 24-29: nulls, a pair, borrowed cups, a shield, a void, and all of
// them at once. Rubies start on the left, sapphires on the right, each pool
// drawn as a picture (see the level files); the later stages are made at a
// well below. A level's spots are where its two pools sit.
const POOLS = {
  'hollow-bowls': { ruby: at(105, 435), sapphire: at(295, 495) },
  'two-hands': { ruby: at(100, 470), sapphire: at(300, 470) },
  'borrowed-light': { ruby: at(110, 450), sapphire: at(290, 480) },
  'the-aegis': { ruby: at(105, 440), sapphire: at(295, 490) },
  'the-ashen-key': { ruby: at(150, 455), sapphire: at(250, 455) },
  'the-crown': { ruby: at(110, 500), sapphire: at(295, 445) },
}
const spots = (id: keyof typeof POOLS) => ({ ...POOLS[id], well: at(200, 600), left: at(100, 605), right: at(300, 605), hollowWell: at(200, 590) })
const HB = spots('hollow-bowls')
const TH = spots('two-hands')
const BL = spots('borrowed-light')
const AE = spots('the-aegis')
const AK = spots('the-ashen-key')
const CR = spots('the-crown')
const hollowToCrux = [...cast(0, HB.ruby), ...cast(1, HB.sapphire), ...cast(2, HB.ruby), ...cast(3, HB.sapphire), ...cast(4, HB.hollowWell)]
const twoHandsToCrux = [...cast(0, TH.ruby), ...cast(1, TH.sapphire), ...cast(2, TH.ruby), ...cast(3, TH.sapphire), ...cast(4, TH.well), ...cast(3, TH.well)]
const borrowedToCrux = [...cast(0, BL.ruby), ...cast(1, BL.sapphire), ...cast(2, BL.ruby), ...cast(3, BL.sapphire), ...cast(4, BL.well), ...cast(3, BL.right)]
const aegisToCrux = [...cast(0, AE.ruby), ...cast(1, AE.sapphire), ...cast(2, AE.ruby), ...cast(3, AE.sapphire), ...cast(2, AE.well), ...cast(4, AE.well), ...cast(4, AE.well)]
// The jade triangle cast at the shielded boss latches on and pulls.
const aegisPull = [place(5, AE.well), feed(5)]
// The Crown's amber squares go into stasis side by side and burst as a pair.
const crownToCrux = [...cast(0, CR.ruby), ...cast(1, CR.sapphire), place(2, CR.ruby), feed(2), place(3, CR.sapphire), feed(3), tap(2), ...cast(2, CR.well), ...cast(4, CR.well), ...cast(4, CR.right), ...cast(4, CR.well), ...cast(4, CR.well)]
const crownPull = [place(5, CR.well), feed(5)]
const ashenToCrux = [...cast(0, AK.ruby), ...cast(1, AK.sapphire), ...cast(2, AK.ruby), ...cast(3, AK.sapphire), ...cast(2, AK.well), ...cast(4, AK.well), ...cast(4, AK.right), ...cast(4, AK.well)]
Object.assign(LINES, {
  'staves-4': [
    { name: 'intended', expect: 'won', steps: [...hollowToCrux, ...cast(5, HB.hollowWell), ...cast(0, HB.hollowWell)] },
    { name: 'the amethyst triangle takes the nulls', expect: 'not-won', steps: [...hollowToCrux, ...cast(0, HB.hollowWell)] },
  ],
  'staves-5': [
    { name: 'intended', expect: 'won', steps: [...twoHandsToCrux, place(5, TH.left), feed(5), place(2, TH.right), feed(2), tap(5)] },
    { name: 'the triangle that turns red and sapphire into amber, first', expect: 'not-won', steps: [...cast(0, TH.ruby), ...cast(1, TH.sapphire), ...cast(0, TH.ruby), ...twoHandsToCrux.slice(6), place(5, TH.left), feed(5), place(2, TH.right), feed(2), tap(5)] },
    { name: 'a jade decoy for the square', expect: 'not-won', steps: [...twoHandsToCrux, ...cast(3, TH.right)] },
  ],
  'staves-6': [
    { name: 'intended', expect: 'won', steps: [...borrowedToCrux, ...cast(5, BL.left), ...cast(3, BL.sapphire), ...cast(5, BL.ruby)] },
    { name: 'the finisher first', expect: 'not-won', steps: [...borrowedToCrux, ...cast(3, BL.left)] },
  ],
  'staves-7': [
    { name: 'intended', expect: 'won', steps: [...aegisToCrux, ...aegisPull, ...cast(3, AE.left), ...castLayer(5, AE.right, 1), tapLayer(5, 0)] },
    { name: 'the sapphire triangle takes the pentagon its blues', expect: 'not-won', steps: [...cast(0, AE.ruby), ...cast(0, AE.sapphire), ...cast(1, AE.sapphire)] },
    { name: 'a jade decoy', expect: 'not-won', steps: [...aegisToCrux, ...cast(4, AE.well)] },
    { name: 'the second striker first', expect: 'not-won', steps: [...aegisToCrux, ...aegisPull, ...castLayer(5, AE.right, 1), ...cast(3, AE.left)] },
  ],
  'staves-8': [
    { name: 'intended', expect: 'won', steps: [...ashenToCrux, ...cast(5, AK.well), ...cast(3, AK.well), ...cast(5, AK.well)] },
    { name: 'the amber square that gives back ruby, first', expect: 'not-won', steps: [...cast(0, AK.ruby), ...cast(1, AK.sapphire), ...cast(0, AK.ruby), ...ashenToCrux.slice(6), ...cast(5, AK.well), ...cast(3, AK.well), ...cast(5, AK.well)] },
    { name: 'an amber square burns the void', expect: 'not-won', steps: [...ashenToCrux, ...cast(1, AK.well), ...cast(5, AK.well)] },
  ],
  'staves-9': [
    { name: 'intended', expect: 'won', steps: [...crownToCrux, ...crownPull, ...cast(3, CR.left), ...castLayer(5, CR.right, 1), tapLayer(5, 0)] },
    { name: 'the ruby triangle takes the pentagon its reds', expect: 'not-won', steps: [...cast(0, CR.ruby), ...cast(0, CR.ruby), ...crownToCrux.slice(3)] },
    { name: 'the striker first: its ash cup takes a jade', expect: 'not-won', steps: [...crownToCrux, place(3, CR.left), feed(3), ...crownPull, tap(3)] },
    { name: 'the second striker first', expect: 'not-won', steps: [...crownToCrux, ...crownPull, ...castLayer(5, CR.right, 1), ...cast(3, CR.left)] },
  ],
} satisfies Record<string, Line[]>)

// Hollow Bowls, branching (a debug-pack pilot): no decoy runes; what tempts
// is the order of the real ones. Two ruby layers (4 and 5 damage) strike
// five-gons of 4 and 5 hp, a three-damage layer strikes a four-gon of 3 or
// 4 hp, and a rune that fits both is sometimes not ready for the one it
// should have. Two cruxes close it: the amber funnel that takes every amber,
// and the hollow amethyst rune that takes every null. Each blow is cast on
// the side of the boss it hits.
const BR = { left: at(110, 520), right: at(290, 520) }
const branchingOpening = [...cast(0, BR.right), ...cast(0, BR.left), ...cast(1, BR.left), ...cast(0, BR.right)]
const branchingMiddle = [...cast(2, BR.left), ...cast(1, BR.left), ...cast(1, BR.right)]
const branchingFinale = [...cast(3, BR.left), ...cast(3, BR.right), ...cast(0, BR.right)]
Object.assign(LINES, {
  'hollow-bowls-v2': [
    { name: 'intended', expect: 'won', steps: [...branchingOpening, ...branchingMiddle, ...branchingFinale] },
    { name: 'the four-damage ruby layer strikes the five-hp layer', expect: 'lost', steps: [...cast(0, BR.right), ...cast(0, BR.right), ...cast(1, BR.left), ...cast(0, BR.right), ...branchingMiddle, ...branchingFinale] },
    { name: 'the three-damage layer strikes the four-hp layer of the other boss', expect: 'lost', steps: [...cast(0, BR.right), ...cast(0, BR.left), ...cast(0, BR.right), ...cast(1, BR.right), ...branchingMiddle, ...branchingFinale] },
    { name: 'the pentagon takes the nulls', expect: 'not-won', steps: [...branchingOpening, ...branchingMiddle, ...cast(0, BR.right), ...branchingFinale] },
  ],
} satisfies Record<string, Line[]>)

// The levels built bead by bead keep their lines in lines.shaped.ts.
Object.assign(LINES, shapedLines())

// The line a level is designed to be played along.
export const intendedLine = (id: string): Line | undefined => LINES[id]?.find((line) => line.name === 'intended')
