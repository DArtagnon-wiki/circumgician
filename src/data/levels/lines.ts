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
  // The heptagon clears the square in one clean blow, but annihilates the
  // reds that, recycled, would have fed the pentagon's rune.
  'the-price': [
    {
      name: 'intended',
      expect: 'won',
      steps: [place(1, at(200, 505)), tap(1), place(2, at(200, 505)), tap(2), place(1, at(200, 505)), tap(1), place(3, at(200, 505)), tap(3)],
    },
    { name: 'the clean one-shot', expect: 'lost', steps: [place(0, at(200, 505)), tap(0), place(2, at(200, 505)), tap(2)] },
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
}

// The line a level is designed to be played along.
export const intendedLine = (id: string): Line | undefined => LINES[id]?.find((line) => line.name === 'intended')
