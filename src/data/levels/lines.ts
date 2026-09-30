import type { ScriptStep } from '../../sim/headless'

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

// Levels 5-10: each rune cast on its color's pool, an emoji drawn in motes
// (even slots on the first, odd on the second); the maker of the crux
// batch, the crux and the clean-up at a well.
type Spot = { x: number; y: number }
const LAYOUT: Record<string, { pools: [Spot, Spot]; well: Spot }> = {
  patience: { pools: [at(110, 440), at(290, 440)], well: at(200, 590) },
  'crowded-circle': { pools: [at(100, 630), at(300, 630)], well: at(200, 475) },
  'the-sacrifice': { pools: [at(100, 420), at(100, 630)], well: at(260, 530) },
  'the-wildcard': { pools: [at(300, 420), at(300, 630)], well: at(140, 530) },
  'the-price': { pools: [at(110, 420), at(290, 640)], well: at(220, 520) },
  circumgician: { pools: [at(100, 640), at(300, 640)], well: at(200, 470) },
}
const toCrux = (id: string, slots: number[], maker: number): ScriptStep[] => [
  ...slots.flatMap((slot) => cast(slot, LAYOUT[id].pools[slot % 2])),
  ...cast(maker, LAYOUT[id].well),
]
const atWell = (id: string, ...slots: number[]): ScriptStep[] => slots.flatMap((slot) => cast(slot, LAYOUT[id].well))
// Hungry Circle: everything at one pool.
const HUNGRY = at(200, 520)
const hungryToCrux: ScriptStep[] = [...cast(0, HUNGRY), ...cast(1, HUNGRY), ...cast(0, HUNGRY), ...cast(1, HUNGRY)]

// The Crux: satellites A, B, C around the well P, where D and E dig in, the
// hexagons rise and the clean-up runs.
const P = at(200, 525)
const PA = at(100, 400)
const PB = at(300, 400)
const PC = at(200, 650)
const toTheCrux: ScriptStep[] = [
  ...[
    [0, PA],
    [1, PB],
    [2, PC],
    [3, P],
  ].flatMap(([slot, p]) => [place(slot as number, p as { x: number; y: number }), tap(slot as number)]),
  place(4, P),
  feed(4), // the fifth triangle's motes were pushed off the ring by the fourth: kick them in
  tap(4),
  place(0, PA),
  tap(0),
  place(1, PB),
  tap(1),
  place(3, PC),
  tap(3),
  place(2, P),
  tap(2), // six amber
]

// Levels 12-17 (ice and frost, the cool palette): each lays its two
// starting colors out in its own formation, and the runes that use them are
// cast left and right while feeding kicks the motes over. A frozen rune's
// ice sits bottom-left, far from the boss, so a blow cast top-right links to
// the boss and one cast beside the ice links to the ice.
const LEFT = at(100, 440)
const RIGHT = at(300, 440)
const casts = (...pairs: [number, Spot][]): ScriptStep[] => pairs.flatMap(([slot, p]) => cast(slot, p))
const PERIDOT_IN_ICE = { well: at(200, 540), ice: at(185, 632) }
const peridotToCrux = casts([0, LEFT], [1, RIGHT], [2, LEFT], [3, RIGHT], [4, PERIDOT_IN_ICE.well])
const FROSTBITE = at(200, 570)
const frostbiteToCrux = casts([0, LEFT], [1, RIGHT], [2, LEFT], [3, RIGHT], [2, LEFT], [3, FROSTBITE]) // the lapis triangle freezes, the tourmaline hexagon thaws it
const RESCUE = { frozen: at(200, 590), chip: at(200, 410) }
const rescueToCrux = casts([0, LEFT], [1, RIGHT], [2, LEFT], [3, RIGHT], [4, RESCUE.frozen], [5, RESCUE.chip])
const WINTER = { frozen: at(84, 656), chip: at(190, 640), boss: at(316, 392), left: at(100, 392) }
const twoWintersToCrux = casts([4, WINTER.frozen], [2, LEFT], [3, RIGHT], [3, LEFT], [0, WINTER.left], [1, RIGHT], [1, WINTER.chip])
const deepWinterToCrux = casts([4, WINTER.frozen], [0, LEFT], [1, RIGHT], [1, LEFT], [2, RIGHT], [2, LEFT], [3, RIGHT], [3, WINTER.chip])
const LONG = { chip: at(84, 550), ice: at(300, 622), mid: at(200, 580), aside: at(200, 392) } // aside: where the empty jade square waits
const longWinterToCrux = casts([4, WINTER.frozen], [0, LEFT], [1, RIGHT], [1, LEFT], [2, RIGHT], [2, RIGHT], [2, LEFT], [3, RIGHT], [3, LONG.chip])

// Levels 18-23 (fire, the warm palette): a cast piece burns unless it is
// filled and burst in time, so each rune is cast where its color was drawn
// and fed at once. A layer to burn is cast aside, well away from the batch
// it could catch, and left to burn; the layer under it is then in hand.
const castLayer = (slot: number, p: Spot, layer: number): ScriptStep[] => [place(slot, p), feed(slot, layer), tapLayer(slot, layer)]
// Or the careful way: first move the motes it needs to where its bowls will
// land (wild motes kept clear), so it fills the moment it is cast.
const gather = (slot: number, p: Spot, layer?: number): ScriptStep => (layer === undefined ? { gather: slot, at: p } : { gather: slot, at: p, layer })
const ready = (slot: number, p: Spot, layer?: number): ScriptStep[] => [gather(slot, p), ...(layer === undefined ? cast(slot, p) : castLayer(slot, p, layer))]
const FIRE = {
  left: at(100, 440),
  right: at(300, 440),
  mid: at(150, 470), // left of centre: a triangle's blow goes to the left obstacle
  well: at(200, 580), // where the batch is made
  boss: at(290, 590), // nearer the boss than the left obstacle
  leftWell: at(110, 590),
  aside: at(78, 390), // somewhere to let a layer burn
  aside2: at(200, 388),
}
const kindlingToCrux = casts([0, FIRE.left], [1, FIRE.right], [0, FIRE.left], [1, FIRE.right], [2, FIRE.well])
const shortFuseToCrux = casts([0, FIRE.left], [1, FIRE.right], [2, FIRE.left], [3, FIRE.right], [0, FIRE.left], [4, FIRE.well])
const firebreakToCrux = casts([0, FIRE.left], [1, FIRE.right], [1, FIRE.left], [2, FIRE.right], [0, FIRE.left], [3, FIRE.well])
// Where rose quartz trickles in (Backdraft, Phoenix), a mote at a time, it
// is gathered at the well before the hexagon is cast there.
const backdraftToCrux = [...casts([0, FIRE.left], [1, FIRE.right], [0, FIRE.left], [1, FIRE.right], [0, FIRE.left], [1, FIRE.right]), ...ready(2, FIRE.well)]
const FRONT = { left: at(110, 612), right: at(290, 612) } // Wildfire's garnet is the fire front along the bottom
const wildfireToCrux = casts([0, FRONT.left], [1, FIRE.mid], [0, FRONT.right], [1, FIRE.right], [0, FRONT.right], [1, FIRE.right], [0, FRONT.left], [2, FIRE.well])
const phoenixToCrux = [...casts([0, FIRE.left], [1, FIRE.mid], [0, FIRE.left], [1, FIRE.right], [0, FIRE.left], [1, FIRE.right], [0, FIRE.left], [1, FIRE.right]), ...ready(2, FIRE.well)]
const burnAside = (slot: number, ...spots: Spot[]): ScriptStep[] => spots.map((p) => place(slot, p))

export const LINES: Record<string, Line[]> = {
  // Levels 1-3 are calm: plenty of every color, nothing that loses for good.
  'first-threads': [
    { name: 'intended', expect: 'won', steps: [...cast(0, at(120, 470)), ...cast(1, at(280, 590))] },
    // Recoverable by kicking motes into the rings, so only "not won" untouched.
    { name: 'both runes off their motes', expect: 'not-won', steps: [place(0, at(300, 420)), place(1, at(110, 630))] },
  ],
  // The blue square fills at once and waits, unlinked, until the pentagon's
  // blow breaks the triangle. A spare blue layer forgives an early tap.
  'changing-colors': [
    {
      name: 'intended',
      expect: 'won',
      steps: [place(0, at(130, 480)), place(1, at(280, 560)), feed(0), tap(0), feed(1), tap(1), ...cast(0, at(130, 480))],
    },
    { name: 'blue tapped with nothing to hit', expect: 'not-won', steps: [...cast(1, at(280, 560))] },
  ],
  // Where you drop picks the triangle a blow strikes: match 5, 4 and 3 to the
  // strengths. A spare blue triangle forgives a mis-aim.
  'the-weighing': [
    { name: 'intended', expect: 'won', steps: [...cast(0, at(290, 430)), ...cast(1, at(110, 480)), ...cast(2, at(160, 610)), ...cast(3, at(290, 430))] },
    { name: 'the pentagon to the left', expect: 'not-won', steps: [...cast(0, at(110, 470))] },
  ],
  // From level 4 on, a crux: a batch made exactly (every line meets it), a
  // rune that needs all of it, and tempting runes that would take some. It
  // starts at the end and moves back toward two thirds as levels grow.
  // Hungry Circle, crux at the last blow: the pentagon makes exactly four gold,
  // the square needs all four, the hungry triangle would eat three.
  'the-hungry-circle': [
    { name: 'intended', expect: 'won', steps: [...hungryToCrux, ...cast(2, HUNGRY)] },
    { name: 'the hungry triangle first', expect: 'lost', steps: [...hungryToCrux, ...cast(3, HUNGRY)] },
  ],
  // Patience, crux at blow 5 of 6: the big gold hexagon needs all six; two
  // quicker gold runes are linked to its square right now.
  patience: [
    { name: 'intended', expect: 'won', steps: [...toCrux('patience', [0, 1, 0], 1), ...atWell('patience', 2, 2)] },
    { name: 'a quick gold rune first', expect: 'lost', steps: [...toCrux('patience', [0, 1, 0], 1), ...atWell('patience', 3)] },
  ],
  // Crowded Circle, crux at blow 6 of 7: amethyst from two squares, six gold,
  // and a hand crowded with smaller gold runes linked to the hexagon's layer.
  'crowded-circle': [
    { name: 'intended', expect: 'won', steps: [...toCrux('crowded-circle', [0, 1, 2, 3], 0), ...atWell('crowded-circle', 1, 2)] },
    { name: 'a crowding gold square first', expect: 'lost', steps: [...toCrux('crowded-circle', [0, 1, 2, 3], 0), ...atWell('crowded-circle', 3)] },
  ],
  // The Sacrifice, crux at blow 6 of 8 (amber and jade pools): the only way to
  // the sapphire the ending needs is a ruby hexagon with nothing to hit; two
  // ruby runes offer perfect, linked blows that spend the rubies instead.
  'the-sacrifice': [
    { name: 'intended', expect: 'won', steps: [...toCrux('the-sacrifice', [0, 1, 2, 3], 0), ...atWell('the-sacrifice', 1, 2, 3)] },
    { name: 'the perfect blow instead', expect: 'lost', steps: [...toCrux('the-sacrifice', [0, 1, 2, 3], 0), ...atWell('the-sacrifice', 4)] },
  ],
  // The Wildcard, crux at blow 7 of 9 (jade and ruby pools): five amber and one
  // wildcard, and the hexagon needs all six; a triangle with an amethyst bowl
  // (no amethyst exists yet) wants the wildcard.
  'the-wildcard': [
    { name: 'intended', expect: 'won', steps: [...toCrux('the-wildcard', [0, 1, 2, 3, 4], 0), ...atWell('the-wildcard', 1, 2, 3)] },
    { name: 'a gold square first', expect: 'lost', steps: [...toCrux('the-wildcard', [0, 1, 2, 3, 4], 0), ...atWell('the-wildcard', 5)] },
    // Its amber bowl may take the wildcard before its amethyst bowl can: jammed either way.
    {
      name: 'the wildcard in the triangle',
      expect: 'not-won',
      steps: [...toCrux('the-wildcard', [0, 1, 2, 3, 4], 0), place(4, LAYOUT['the-wildcard'].well), feed(4)],
    },
  ],
  // The Price, crux at blow 7 of 10 (sapphire and amber pools): most blows burn
  // a mote, twenty dwindle; the ash hexagon offers the same perfect blow as the
  // jade one and burns the rubies the ending needs.
  'the-price': [
    { name: 'intended', expect: 'won', steps: [...toCrux('the-price', [0, 1, 2, 3, 4], 0), ...atWell('the-price', 1, 2, 4, 3)] },
    { name: 'the ash hexagon', expect: 'lost', steps: [...toCrux('the-price', [0, 1, 2, 3, 4], 0), ...atWell('the-price', 5)] },
  ],
  // Circumgician, crux at blow 8 of 12 (ruby and jade pools): four gating
  // triangles in any order, five amber and a wildcard, the ash hexagon and the
  // wildcard thief at once.
  circumgician: [
    { name: 'intended', expect: 'won', steps: [...toCrux('circumgician', [0, 1, 2, 3, 2, 3], 0), ...atWell('circumgician', 1, 2, 3, 0, 2)] },
    { name: 'the ash hexagon', expect: 'lost', steps: [...toCrux('circumgician', [0, 1, 2, 3, 2, 3], 0), ...atWell('circumgician', 4)] },
    {
      name: 'the wildcard in the triangle',
      expect: 'not-won',
      steps: [...toCrux('circumgician', [0, 1, 2, 3, 2, 3], 0), place(5, LAYOUT.circumgician.well), feed(5)],
    },
  ],
  // 20 motes, 30 moves in every winning line. Act 1 turns ruby and jade into
  // amethyst, act 2 spends it on the right obstacle's squares, and blow 9
  // makes exactly six amber. The crux (move 18 of 30, every line passes
  // through it): the big hexagon needs all six, while two amber squares in
  // hand could each strike something now. Its six sapphire then feed the
  // clean-up, where nothing can go wrong.
  'the-crux': [
    {
      name: 'intended',
      expect: 'won',
      steps: [
        ...toTheCrux,
        place(4, P),
        tap(4), // the crux: all six amber into the hexagon
        ...[1, 1, 2].flatMap((slot) => [place(slot, P), feed(slot), tap(slot)]),
        place(0, at(78, 672)), // dig past the amber square, empty
        place(0, P),
        feed(0, 3),
        tapLayer(0, 3),
        place(3, at(322, 672)),
        place(3, P),
        feed(3, 3),
        tapLayer(3, 3),
      ],
    },
    { name: 'an amber square first', expect: 'lost', steps: [...toTheCrux, place(0, P), feed(0), tap(0)] },
  ],
  'amber-in-ice': [
    { name: 'intended', expect: 'won', steps: [...peridotToCrux, ...casts([5, PERIDOT_IN_ICE.ice], [0, PERIDOT_IN_ICE.well])] },
    { name: 'a tourmaline triangle first', expect: 'lost', steps: [...peridotToCrux, ...cast(2, PERIDOT_IN_ICE.well)] },
  ],
  frostbite: [
    { name: 'intended', expect: 'won', steps: [...frostbiteToCrux, ...casts([4, FROSTBITE], [0, LEFT], [1, RIGHT])] },
    { name: 'the turquoise triangle', expect: 'lost', steps: [...frostbiteToCrux, ...cast(5, FROSTBITE)] },
  ],
  'the-rescue': [
    { name: 'intended', expect: 'won', steps: [...rescueToCrux, ...casts([3, RESCUE.chip], [4, RESCUE.frozen], [0, LEFT], [1, RIGHT])] },
    { name: 'the kunzite triangle at the boss', expect: 'lost', steps: [...rescueToCrux, ...cast(2, RESCUE.chip)] },
  ],
  'two-winters': [
    { name: 'intended', expect: 'won', steps: [...twoWintersToCrux, ...casts([5, WINTER.boss], [5, WINTER.frozen], [4, RIGHT], [0, LEFT], [1, WINTER.chip])] },
    { name: 'a lapis triangle at the boss', expect: 'lost', steps: [...twoWintersToCrux, ...cast(2, WINTER.boss)] },
    { name: 'a lapis triangle finishing the rescue', expect: 'not-won', steps: [...twoWintersToCrux, ...cast(3, WINTER.chip)] },
  ],
  'deep-winter': [
    { name: 'intended', expect: 'won', steps: [...deepWinterToCrux, ...casts([5, WINTER.boss], [5, WINTER.frozen], [4, RIGHT], [3, LEFT], [4, at(200, 560)])] },
    { name: 'a peridot triangle at the boss', expect: 'lost', steps: [...deepWinterToCrux, ...cast(0, WINTER.boss)] },
    { name: 'a peridot triangle finishing the rescue', expect: 'not-won', steps: [...deepWinterToCrux, ...cast(1, WINTER.chip)] },
  ],
  'the-long-winter': [
    { name: 'intended', expect: 'won', steps: [...longWinterToCrux, ...cast(5, WINTER.boss), place(1, LONG.aside), ...castLayer(1, LONG.ice, 3), ...casts([5, WINTER.frozen], [4, RIGHT], [3, LEFT], [4, LONG.mid])] },
    { name: 'a lapis square at the boss', expect: 'lost', steps: [...longWinterToCrux, ...cast(0, WINTER.boss)] },
    { name: 'breaking the turquoise ice first', expect: 'not-won', steps: [...longWinterToCrux, place(1, LONG.aside), ...castLayer(1, LONG.ice, 3)] },
    { name: 'a lapis square finishing the rescue', expect: 'not-won', steps: [...longWinterToCrux, ...cast(1, LONG.chip)] },
  ],
  kindling: [
    { name: 'intended', expect: 'won', steps: [...kindlingToCrux, ...burnAside(3, FIRE.aside), ...castLayer(3, FIRE.well, 1), ...cast(4, FIRE.well)] },
    { name: 'the decoy garnet triangle', expect: 'not-won', steps: [...kindlingToCrux, ...cast(3, FIRE.well)] },
  ],
  'short-fuse': [
    { name: 'intended', expect: 'won', steps: [...shortFuseToCrux, ...burnAside(5, FIRE.aside, FIRE.aside2), ...castLayer(5, FIRE.well, 2), ...cast(0, FIRE.well), ...cast(1, FIRE.right)] },
    { name: 'the decoy garnet triangle', expect: 'not-won', steps: [...shortFuseToCrux, ...cast(5, FIRE.well)] },
    { name: 'burning one, then the decoy garnet square', expect: 'not-won', steps: [...shortFuseToCrux, ...burnAside(5, FIRE.aside), ...castLayer(5, FIRE.well, 1)] },
  ],
  firebreak: [
    { name: 'intended', expect: 'won', steps: [...firebreakToCrux, ...cast(4, FIRE.boss), ...cast(0, FIRE.leftWell), ...burnAside(5, FIRE.aside), ...castLayer(5, FIRE.well, 1), ...castLayer(5, FIRE.well, 2)] },
    { name: 'the carnelian triangle', expect: 'not-won', steps: [...firebreakToCrux, ...cast(5, FIRE.well)] },
    { name: 'burning the rose quartz square for the other hexagon', expect: 'not-won', steps: [...firebreakToCrux, ...burnAside(0, FIRE.aside), ...castLayer(0, FIRE.boss, 3)] },
  ],
  backdraft: [
    { name: 'intended', expect: 'won', steps: [...backdraftToCrux, ...burnAside(3, FIRE.aside), ...ready(3, FIRE.boss, 1), ...ready(0, FIRE.leftWell), ...ready(4, FIRE.well), ...ready(5, FIRE.well), ...cast(4, FIRE.right)] },
    { name: 'the citrine square', expect: 'not-won', steps: [...backdraftToCrux, ...cast(1, FIRE.boss)] },
    { name: 'burning the rose quartz square', expect: 'not-won', steps: [...backdraftToCrux, ...burnAside(0, FIRE.aside), ...castLayer(0, FIRE.boss, 4)] },
    { name: 'the decoy citrine triangle', expect: 'not-won', steps: [...backdraftToCrux, ...cast(3, FIRE.boss)] },
  ],
  wildfire: [
    { name: 'intended', expect: 'won', steps: [...wildfireToCrux, ...burnAside(3, FIRE.aside, FIRE.aside2), ...castLayer(3, FIRE.boss, 2), ...cast(0, FIRE.leftWell), ...cast(4, FIRE.well), ...cast(5, FIRE.well), ...cast(4, FIRE.right)] },
    { name: 'the spinel square', expect: 'not-won', steps: [...wildfireToCrux, ...cast(1, FIRE.boss)] },
    { name: 'burning the garnet square', expect: 'not-won', steps: [...wildfireToCrux, ...burnAside(0, FIRE.aside), ...castLayer(0, FIRE.boss, 5)] },
    { name: 'burning one, then the decoy spinel square', expect: 'not-won', steps: [...wildfireToCrux, ...burnAside(3, FIRE.aside), ...castLayer(3, FIRE.boss, 1)] },
  ],
  phoenix: [
    { name: 'intended', expect: 'won', steps: [...phoenixToCrux, ...burnAside(3, FIRE.aside, FIRE.aside2), ...ready(3, FIRE.boss, 2), ...ready(0, FIRE.leftWell), ...ready(4, FIRE.well), ...ready(5, FIRE.well), ...cast(4, FIRE.right), ...cast(5, FIRE.left)] },
    { name: 'the rose quartz square', expect: 'not-won', steps: [...phoenixToCrux, ...cast(1, FIRE.boss)] },
    { name: 'burning the spinel square', expect: 'not-won', steps: [...phoenixToCrux, ...burnAside(0, FIRE.aside), ...castLayer(0, FIRE.boss, 5)] },
    { name: 'burning one, then the decoy rose quartz square', expect: 'not-won', steps: [...phoenixToCrux, ...burnAside(3, FIRE.aside), ...castLayer(3, FIRE.boss, 1)] },
  ],
}

// Levels 24-28: nulls, a pair, borrowed cups, a shield, a void. Rubies on
// the left, sapphires on the right, the later stages made at a well below.
const ARC = { ruby: at(100, 440), sapphire: at(300, 440), well: at(200, 600), left: at(100, 605), right: at(300, 605), hollowWell: at(200, 590) }
const hollowToCrux = [...cast(0, ARC.ruby), ...cast(1, ARC.sapphire), ...cast(2, ARC.ruby), ...cast(3, ARC.sapphire), ...cast(4, ARC.hollowWell)]
const twoHandsToCrux = [...cast(0, ARC.ruby), ...cast(1, ARC.sapphire), ...cast(2, ARC.ruby), ...cast(3, ARC.sapphire), ...cast(4, ARC.well), ...cast(3, ARC.well)]
const borrowedToCrux = [...cast(0, ARC.ruby), ...cast(1, ARC.sapphire), ...cast(2, ARC.ruby), ...cast(3, ARC.sapphire), ...cast(4, ARC.well), ...cast(3, ARC.right)]
const aegisToCrux = [...cast(0, ARC.ruby), ...cast(1, ARC.sapphire), ...cast(2, ARC.ruby), ...cast(3, ARC.sapphire), ...cast(2, ARC.well), ...cast(4, ARC.well), ...cast(4, ARC.well)]
// The jade triangle cast at the shielded boss latches on and pulls.
const aegisPull = [place(5, ARC.well), feed(5)]
const ashenToCrux = [...cast(0, ARC.ruby), ...cast(1, ARC.sapphire), ...cast(2, ARC.ruby), ...cast(3, ARC.sapphire), ...cast(2, ARC.well), ...cast(4, ARC.well), ...cast(4, ARC.right), ...cast(4, ARC.well)]
Object.assign(LINES, {
  'hollow-bowls': [
    { name: 'intended', expect: 'won', steps: [...hollowToCrux, ...cast(5, ARC.hollowWell), ...cast(0, ARC.hollowWell)] },
    { name: 'the amethyst triangle takes the nulls', expect: 'not-won', steps: [...hollowToCrux, ...cast(0, ARC.hollowWell)] },
  ],
  'two-hands': [
    { name: 'intended', expect: 'won', steps: [...twoHandsToCrux, place(5, ARC.left), feed(5), place(2, ARC.right), feed(2), tap(5)] },
    { name: 'a jade decoy for the pentagon', expect: 'not-won', steps: [...twoHandsToCrux, ...cast(0, ARC.left)] },
    { name: 'a jade decoy for the square', expect: 'not-won', steps: [...twoHandsToCrux, ...cast(1, ARC.right)] },
  ],
  'borrowed-light': [
    { name: 'intended', expect: 'won', steps: [...borrowedToCrux, ...cast(5, ARC.left), ...cast(3, ARC.sapphire), ...cast(5, ARC.ruby)] },
    { name: 'the finisher first', expect: 'not-won', steps: [...borrowedToCrux, ...cast(3, ARC.left)] },
  ],
  'the-aegis': [
    { name: 'intended', expect: 'won', steps: [...aegisToCrux, ...aegisPull, ...cast(3, ARC.left), ...castLayer(5, ARC.right, 1), tapLayer(5, 0)] },
    { name: 'a jade decoy', expect: 'not-won', steps: [...aegisToCrux, ...cast(0, ARC.well)] },
    { name: 'the second striker first', expect: 'not-won', steps: [...aegisToCrux, ...aegisPull, ...castLayer(5, ARC.right, 1), ...cast(3, ARC.left)] },
  ],
  'the-ashen-key': [
    { name: 'intended', expect: 'won', steps: [...ashenToCrux, ...cast(5, ARC.well), ...cast(3, ARC.well), ...cast(5, ARC.well)] },
    { name: 'an amber square burns the void', expect: 'not-won', steps: [...ashenToCrux, ...cast(0, ARC.well), ...cast(5, ARC.well)] },
  ],
} satisfies Record<string, Line[]>)

// The line a level is designed to be played along.
export const intendedLine = (id: string): Line | undefined => LINES[id]?.find((line) => line.name === 'intended')
