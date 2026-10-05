import type { ScriptStep } from '../../sim/headless'
import type { Expect, Line } from './lines'

// Lines for the levels built bead by bead (see shape.test.ts). A line is a list of blows, each one
// [slot, x, y]: cast the layer in hand at that spot, kick in what it needs, detonate it. Every
// level here names the boss each blow strikes by where it is cast (a piece links to the nearest
// boss whose layer it fits). A wrong line is the intended one with one more blow put in at an
// index: a rune struck at a layer it fits now and should not take.
export type Blow = [slot: number, x: number, y: number]

interface Shaped {
  intended: Blow[]
  wrong: { name: string; expect: Expect; at: number; blow: Blow }[]
}

export const SHAPED: Record<string, Shaped> = {
  'the-long-stair': {
    intended: [
      [0, 290, 410], [1, 110, 410], [0, 200, 410], [1, 110, 410], [2, 200, 410], [0, 110, 410], [0, 290, 410], [3, 110, 410],
      [0, 200, 410], [4, 200, 410], [2, 110, 410], [4, 200, 410], [0, 200, 410], [4, 110, 410], [2, 200, 410], [2, 200, 410],
      [2, 200, 410], [0, 200, 410], [4, 110, 410], [4, 200, 410], [2, 200, 410], [4, 110, 410], [0, 200, 410], [4, 290, 410],
      [2, 290, 410], [0, 110, 410], [4, 200, 410], [0, 290, 410], [2, 110, 410], [4, 110, 410], [2, 200, 410], [4, 200, 410],
      [5, 290, 410], [1, 110, 410], [1, 200, 410],
    ],
    wrong: [
      { name: 'rune 3, 5 damage, strikes the 6-hp 5-gon of boss 1, blow 5', expect: 'not-won', at: 4, blow: [2, 110, 410] },
      { name: 'rune 5, 4 damage, strikes the 4-hp 4-gon of boss 1, blow 12', expect: 'not-won', at: 11, blow: [4, 110, 410] },
      { name: 'rune 3, 3 damage, strikes the 4-hp 5-gon of boss 1, blow 17', expect: 'not-won', at: 16, blow: [2, 110, 410] },
      { name: 'rune 3, 3 damage, strikes the 4-hp 4-gon of boss 2, blow 25', expect: 'not-won', at: 24, blow: [2, 200, 410] },
      { name: 'rune 6, 3 damage, strikes the 5-hp 3-gon of boss 1, blow 33', expect: 'not-won', at: 32, blow: [5, 110, 410] },
    ],
  },
  'the-hungry-circle': {
    intended: [
      [0, 128, 450], [1, 304, 406], [2, 128, 450], [2, 128, 450], [3, 304, 406],
    ],
    wrong: [
      { name: 'rune 1, 4 damage, strikes the 5-hp 5-gon of boss 2, blow 1', expect: 'not-won', at: 0, blow: [0, 304, 406] },
      { name: 'rune 3, 4 damage, strikes the 5-hp 5-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [2, 304, 406] },
      { name: 'rune 2, 4 damage, strikes the 4-hp 5-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [1, 128, 450] },
      { name: 'rune 3, 4 damage, strikes the 4-hp 5-gon of boss 2, blow 3', expect: 'not-won', at: 2, blow: [2, 304, 406] },
    ],
  },
  'patience': {
    intended: [
      [0, 96, 442], [1, 96, 442], [1, 304, 442], [2, 96, 442], [0, 96, 442], [3, 304, 442],
    ],
    wrong: [
      { name: 'rune 2, 5 damage, strikes the 5-hp 5-gon of boss 2, blow 1', expect: 'not-won', at: 0, blow: [1, 304, 442] },
      { name: 'rune 4, 4 damage, strikes the 5-hp 5-gon of boss 1, blow 5', expect: 'not-won', at: 4, blow: [3, 96, 442] },
      { name: 'rune 1, 4 damage, strikes the 4-hp 5-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [0, 304, 442] },
    ],
  },
  'crowded-circle': {
    intended: [
      [0, 304, 450], [0, 96, 450], [0, 304, 450], [1, 96, 450], [0, 304, 450], [0, 96, 450], [2, 304, 450],
    ],
    wrong: [
      { name: 'rune 2, 5 damage, strikes the 5-hp 5-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [1, 96, 450] },
      { name: 'rune 1, 5 damage, strikes the 6-hp 5-gon of boss 1, blow 3', expect: 'not-won', at: 2, blow: [0, 96, 450] },
      { name: 'rune 1, 3 damage, strikes the 4-hp 5-gon of boss 2, blow 6', expect: 'not-won', at: 5, blow: [0, 304, 450] },
      { name: 'rune 3, 3 damage, strikes the 3-hp 5-gon of boss 1, blow 6', expect: 'not-won', at: 5, blow: [2, 96, 450] },
    ],
  },
  'the-sacrifice': {
    intended: [
      [0, 284, 450], [1, 96, 406], [2, 284, 450], [0, 96, 406], [3, 284, 450], [2, 284, 450], [4, 284, 450], [0, 96, 406],
    ],
    wrong: [
      { name: 'rune 5, 4 damage, strikes the 5-hp 3-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [4, 96, 406] },
      { name: 'rune 1, 3 damage, strikes the 4-hp 3-gon of boss 2, blow 4', expect: 'lost', at: 3, blow: [0, 284, 450] },
      { name: 'rune 1, 3 damage, strikes the 4-hp 3-gon of boss 2, blow 7', expect: 'not-won', at: 6, blow: [0, 284, 450] },
      { name: 'rune 5, 3 damage, strikes the 3-hp 3-gon of boss 1, blow 7', expect: 'not-won', at: 6, blow: [4, 96, 406] },
    ],
  },
  'the-wildcard': {
    intended: [
      [0, 304, 406], [1, 304, 406], [1, 100, 450], [1, 304, 406], [0, 304, 406], [1, 100, 450], [1, 100, 450], [0, 100, 450],
      [1, 304, 406],
    ],
    wrong: [
      { name: 'rune 2, 5 damage, strikes the 6-hp 6-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [1, 100, 450] },
      { name: 'rune 2, 3 damage, strikes the 6-hp 6-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [1, 304, 406] },
      { name: 'rune 2, 3 damage, strikes the 4-hp 6-gon of boss 2, blow 6', expect: 'not-won', at: 5, blow: [1, 304, 406] },
      { name: 'rune 2, 4 damage, strikes the 6-hp 6-gon of boss 1, blow 8', expect: 'not-won', at: 7, blow: [1, 100, 450] },
    ],
  },
  'the-price': {
    intended: [
      [0, 116, 450], [1, 304, 406], [0, 116, 450], [0, 304, 406], [2, 304, 406], [1, 304, 406], [3, 116, 450], [4, 304, 406],
      [5, 304, 406], [1, 116, 450],
    ],
    wrong: [
      { name: 'rune 1, 5 damage, strikes the 6-hp 5-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [0, 304, 406] },
      { name: 'rune 2, 3 damage, strikes the 3-hp 5-gon of boss 1, blow 5', expect: 'not-won', at: 4, blow: [1, 116, 450] },
      { name: 'rune 5, 5 damage, strikes the 5-hp 4-gon of boss 2, blow 7', expect: 'not-won', at: 6, blow: [4, 304, 406] },
      { name: 'rune 6, 3 damage, strikes the 5-hp 3-gon of boss 1, blow 9', expect: 'not-won', at: 8, blow: [5, 116, 450] },
    ],
  },
}

const cast = ([slot, x, y]: Blow): ScriptStep[] => [{ place: slot, at: { x, y } }, { feed: slot }, { tap: slot }]

export function shapedLines(): Record<string, Line[]> {
  return Object.fromEntries(
    Object.entries(SHAPED).map(([id, s]) => [
      id,
      [
        { name: 'intended', expect: 'won' as Expect, steps: s.intended.flatMap(cast) },
        ...s.wrong.map((w) => ({ name: w.name, expect: w.expect, steps: [...s.intended.slice(0, w.at), w.blow, ...s.intended.slice(w.at)].flatMap(cast) })),
      ],
    ]),
  )
}
