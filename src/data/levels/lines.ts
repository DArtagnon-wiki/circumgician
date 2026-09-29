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
const wait = (seconds: number): ScriptStep => ({ wait: seconds })
const flick = (mote: number, toward: { x: number; y: number }): ScriptStep => ({ flick: mote, toward })
const feed = (slot: number, layer?: number): ScriptStep => (layer === undefined ? { feed: slot } : { feed: slot, layer })
const tapLayer = (slot: number, layer: number): ScriptStep => ({ tap: slot, layer })

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

export const LINES: Record<string, Line[]> = {
  'first-threads': [
    { name: 'intended', expect: 'won', steps: [place(0, at(120, 470)), tap(0), place(1, at(280, 590)), tap(1)] },
    // Recoverable by kicking motes into the rings, so only "not won" untouched.
    { name: 'both runes off their motes', expect: 'not-won', steps: [place(0, at(300, 420)), place(1, at(110, 630))] },
  ],
  'changing-colors': [
    { name: 'intended', expect: 'won', steps: [place(0, at(130, 480)), place(1, at(280, 560)), tap(0), tap(1), place(0, at(130, 480)), tap(0)] },
    { name: 'blue detonated before the triangle falls', expect: 'lost', steps: [place(1, at(280, 560)), tap(1)] },
  ],
  // Aim is where you drop: left of the pools strikes the seven, right the
  // five. Only 5 = 5 and 4 + 3 = 7 waste nothing.
  'the-weighing': [
    { name: 'intended', expect: 'won', steps: [place(0, at(218, 410)), tap(0), place(1, at(182, 520)), tap(1), place(2, at(182, 630)), tap(2)] },
    { name: 'small blows first', expect: 'won', steps: [place(2, at(182, 630)), tap(2), place(1, at(182, 520)), tap(1), place(0, at(218, 410)), tap(0)] },
    { name: 'greedy: the five into the seven', expect: 'lost', steps: [place(0, at(182, 410)), tap(0), place(1, at(218, 520)), tap(1), place(2, at(218, 630)), tap(2)] },
    { name: 'every rune dropped dead center', expect: 'lost', steps: [place(0, at(200, 410)), tap(0), place(1, at(200, 520)), tap(1)] },
  ],
  'the-hungry-circle': [
    { name: 'intended', expect: 'won', steps: [place(0, at(140, 500)), tap(0), place(1, at(140, 500)), tap(1)] },
    { name: 'big rune first steals the space', expect: 'not-won', steps: [place(1, at(140, 500)), place(0, at(290, 510))] },
    { name: 'annihilator on the reds', expect: 'not-won', steps: [place(2, at(140, 500)), tap(2)] },
  ],
  // The six-blow rune is ready at once, linked to the three. Hold it until
  // the square breaks into the six (the ghost shows its strength).
  patience: [
    { name: 'intended', expect: 'won', steps: [place(1, at(140, 610)), place(0, at(110, 440)), tap(0), tap(1), place(2, at(110, 440)), tap(2)] },
    { name: 'the big blow at once', expect: 'lost', steps: [place(1, at(140, 610)), tap(1)] },
    {
      name: 'the small blow takes the six first',
      expect: 'lost',
      steps: [place(1, at(140, 610)), place(0, at(110, 440)), tap(0), place(2, at(110, 440)), tap(2), tap(1)],
    },
  ],
  'crowded-circle': [
    {
      name: 'intended',
      expect: 'won',
      steps: [place(0, at(120, 450)), tap(0), place(1, at(186, 516)), tap(1), place(0, at(120, 450)), tap(0), place(1, at(186, 576)), tap(1)],
    },
    { name: 're-placing R1 early swallows the gold', expect: 'not-won', steps: [place(0, at(120, 450)), tap(0), place(0, at(120, 450)), place(1, at(186, 516))] },
  ],
  // Only slot 2 makes the gold the bridge needs, and it has nothing to hit
  // yet: fire it anyway. The linked decoy spends the reds on a perfect hit.
  'the-sacrifice': [
    { name: 'intended', expect: 'won', steps: [place(2, at(200, 500)), tap(2), place(1, at(200, 500)), tap(1), place(2, at(200, 500)), tap(2)] },
    { name: 'the linked rune takes the reds', expect: 'lost', steps: [place(0, at(200, 500)), tap(0), place(0, at(200, 500)), tap(0)] },
  ],
  // The generic is the only violet there will ever be. The blue the square
  // waits for lands in its empty bowl once the triangle bursts.
  'the-wildcard': [
    { name: 'intended', expect: 'won', steps: [place(0, at(200, 430)), place(1, at(200, 536)), tap(1), tap(0), place(2, at(200, 430)), tap(2)] },
    {
      name: 'the wildcard flicked in for the blue',
      expect: 'lost',
      steps: [place(0, at(200, 430)), wait(2), flick(6, at(228.3, 401.7)), tap(0), place(1, at(200, 536)), tap(1)],
    },
  ],
  // Every blow has a price: each phase runs on the color the last one made,
  // red (two to spare) > gold (exact) > blue (two to spare) > teal (exact).
  // The ash triangle clears the square cleanly with reds, and so starves
  // the square rune that turns reds into gold; the loss shows only after
  // the blues and teals are spent.
  'the-price': [
    { name: 'intended', expect: 'won', steps: [place(0, at(200, 505)), tap(0), place(1, at(200, 505)), tap(1), place(2, at(200, 505)), tap(2), place(3, at(200, 505)), tap(3)] },
    {
      name: 'the clean one-shot',
      expect: 'lost',
      steps: [place(4, at(200, 505)), tap(4), place(2, at(200, 505)), tap(2), place(3, at(200, 505)), tap(3)],
    },
  ],
  circumgician: [
    {
      name: 'intended',
      expect: 'won',
      steps: [
        place(0, at(200, 520)),
        place(2, at(110, 430)),
        tap(0),
        tap(2),
        place(2, at(110, 430)),
        tap(2),
        place(1, at(200, 520)),
        tap(1),
        place(0, at(200, 520)),
        tap(0),
        place(1, at(200, 520)),
        tap(1),
        place(0, at(200, 520)),
        tap(0),
      ],
    },
    { name: 'chain rune Y first', expect: 'not-won', steps: [place(1, at(200, 520)), place(0, at(300, 420))] },
    {
      name: 'side rune finished too late',
      expect: 'not-won',
      steps: [place(0, at(200, 520)), place(2, at(110, 430)), tap(0), tap(2), place(1, at(200, 520)), place(2, at(110, 430))],
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
}

// The line a level is designed to be played along.
export const intendedLine = (id: string): Line | undefined => LINES[id]?.find((line) => line.name === 'intended')
