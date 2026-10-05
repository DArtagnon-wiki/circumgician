import type { ScriptStep } from '../../sim/headless'
import type { Expect, Line } from './lines'

// Lines for the levels built bead by bead (see shape.test.ts). A line is a list of blows, each one
// [slot, x, y]: cast the layer in hand at that spot, kick in what it needs, detonate it. Every
// level here names the boss each blow strikes by where it is cast (a piece links to the nearest
// boss whose layer it fits). A wrong line is the intended one with one more blow put in at an
// index: a rune struck at a layer it fits now and should not take. Where a fuse burns a piece
// that is slow to fill (`gather`), the motes it needs are first moved to where it is cast.
export type Blow = [slot: number, x: number, y: number]

interface Shaped {
  gather?: true
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
      [0, 116, 456], [1, 300, 428], [2, 116, 456], [1, 116, 456], [3, 300, 428],
    ],
    wrong: [
      { name: 'rune 1, 4 damage, strikes the 5-hp 5-gon of boss 2, blow 1', expect: 'not-won', at: 0, blow: [0, 300, 428] },
      { name: 'rune 3, 4 damage, strikes the 5-hp 5-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [2, 300, 428] },
      { name: 'rune 2, 4 damage, strikes the 4-hp 5-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [1, 116, 456] },
      { name: 'rune 2, 3 damage, strikes the 3-hp 3-gon of boss 2, blow 4', expect: 'not-won', at: 3, blow: [1, 300, 428] },
    ],
  },
  'patience': {
    intended: [
      [0, 286, 442], [1, 286, 442], [2, 114, 442], [3, 286, 442], [4, 286, 442], [5, 114, 442],
    ],
    wrong: [
      { name: 'rune 1, 4 damage, strikes the 5-hp 5-gon of boss 1, blow 1', expect: 'not-won', at: 0, blow: [0, 114, 442] },
      { name: 'rune 3, 4 damage, strikes the 4-hp 5-gon of boss 2, blow 1', expect: 'not-won', at: 0, blow: [2, 286, 442] },
      { name: 'rune 5, 3 damage, strikes the 5-hp 3-gon of boss 1, blow 5', expect: 'not-won', at: 4, blow: [4, 114, 442] },
      { name: 'rune 6, 3 damage, strikes the 3-hp 3-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [5, 286, 442] },
    ],
  },
  'crowded-circle': {
    intended: [
      [0, 286, 442], [1, 286, 442], [2, 114, 442], [1, 114, 442], [2, 114, 442], [3, 114, 442], [4, 286, 442],
    ],
    wrong: [
      { name: 'rune 3, 4 damage, strikes the 5-hp 4-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [2, 286, 442] },
      { name: 'rune 3, 4 damage, strikes the 6-hp 5-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [2, 286, 442] },
      { name: 'rune 4, 5 damage, strikes the 6-hp 5-gon of boss 2, blow 6', expect: 'not-won', at: 5, blow: [3, 286, 442] },
      { name: 'rune 5, 5 damage, strikes the 5-hp 5-gon of boss 1, blow 6', expect: 'not-won', at: 5, blow: [4, 114, 442] },
    ],
  },
  'the-sacrifice': {
    intended: [
      [0, 286, 470], [1, 114, 442], [2, 114, 442], [3, 286, 470], [4, 114, 442], [2, 114, 442], [5, 286, 470], [5, 114, 442],
    ],
    wrong: [
      { name: 'rune 1, 5 damage, strikes the 6-hp 3-gon of boss 1, blow 1', expect: 'not-won', at: 0, blow: [0, 114, 442] },
      { name: 'rune 5, 3 damage, strikes the 4-hp 5-gon of boss 2, blow 4', expect: 'not-won', at: 3, blow: [4, 286, 470] },
      { name: 'rune 5, 3 damage, strikes the 4-hp 5-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [4, 286, 470] },
      { name: 'rune 6, 4 damage, strikes the 5-hp 5-gon of boss 1, blow 7', expect: 'not-won', at: 6, blow: [5, 114, 442] },
    ],
  },
  'the-wildcard': {
    intended: [
      [0, 286, 442], [1, 286, 442], [2, 114, 466], [0, 286, 442], [3, 286, 442], [4, 114, 466], [3, 286, 442], [5, 286, 442],
      [2, 114, 466],
    ],
    wrong: [
      { name: 'rune 2, 5 damage, strikes the 6-hp 3-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [1, 114, 466] },
      { name: 'rune 1, 4 damage, strikes the 4-hp 4-gon of boss 1, blow 4', expect: 'not-won', at: 3, blow: [0, 114, 466] },
      { name: 'rune 3, 3 damage, strikes the 5-hp 6-gon of boss 2, blow 8', expect: 'not-won', at: 7, blow: [2, 286, 442] },
      { name: 'rune 6, 3 damage, strikes the 3-hp 6-gon of boss 1, blow 8', expect: 'not-won', at: 7, blow: [5, 114, 466] },
    ],
  },
  'the-price': {
    intended: [
      [0, 286, 442], [1, 286, 442], [2, 114, 458], [0, 286, 442], [3, 114, 458], [4, 114, 458], [5, 286, 442], [2, 114, 458],
      [5, 114, 458], [2, 286, 442],
    ],
    wrong: [
      { name: 'rune 3, 5 damage, strikes the 6-hp 5-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [2, 286, 442] },
      { name: 'rune 4, 3 damage, strikes the 4-hp 5-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [3, 286, 442] },
      { name: 'rune 6, 4 damage, strikes the 6-hp 5-gon of boss 1, blow 6', expect: 'not-won', at: 5, blow: [5, 114, 458] },
      { name: 'rune 6, 5 damage, strikes the 6-hp 4-gon of boss 2, blow 9', expect: 'not-won', at: 8, blow: [5, 286, 442] },
    ],
  },
  'circumgician': {
    intended: [
      [0, 286, 442], [0, 114, 470], [0, 114, 470], [0, 286, 442], [1, 286, 442], [2, 286, 442], [3, 114, 470], [4, 286, 442],
      [2, 286, 442], [5, 286, 442], [4, 114, 470], [1, 286, 442],
    ],
    wrong: [
      { name: 'rune 1, 3 damage, strikes the 5-hp 3-gon of boss 1, blow 4', expect: 'not-won', at: 3, blow: [0, 114, 470] },
      { name: 'rune 5, 3 damage, strikes the 6-hp 5-gon of boss 2, blow 6', expect: 'not-won', at: 5, blow: [4, 286, 442] },
      { name: 'rune 2, 4 damage, strikes the 5-hp 6-gon of boss 1, blow 10', expect: 'not-won', at: 9, blow: [1, 114, 470] },
      { name: 'rune 2, 4 damage, strikes the 5-hp 6-gon of boss 1, blow 11', expect: 'not-won', at: 10, blow: [1, 114, 470] },
    ],
  },
  'the-crux': {
    intended: [
      [0, 114, 432], [1, 286, 432], [2, 198, 432], [0, 286, 432], [3, 198, 432], [4, 114, 432], [5, 286, 432], [2, 114, 432],
      [0, 114, 432], [4, 114, 432], [2, 198, 432], [0, 114, 432], [5, 114, 432], [3, 198, 432], [1, 286, 432],
    ],
    wrong: [
      { name: 'rune 2, 4 damage, strikes the 6-hp 5-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [1, 198, 432] },
      { name: 'rune 3, 4 damage, strikes the 4-hp 4-gon of boss 2, blow 8', expect: 'not-won', at: 7, blow: [2, 198, 432] },
      { name: 'rune 5, 3 damage, strikes the 4-hp 4-gon of boss 2, blow 10', expect: 'not-won', at: 9, blow: [4, 198, 432] },
      { name: 'rune 4, 3 damage, strikes the 5-hp 6-gon of boss 3, blow 14', expect: 'not-won', at: 13, blow: [3, 286, 432] },
    ],
  },
  'frostbite': {
    intended: [
      [0, 122, 458], [1, 122, 458], [2, 278, 450], [2, 122, 458], [3, 278, 450], [4, 122, 458], [5, 278, 450], [2, 278, 450],
      [5, 122, 458],
    ],
    wrong: [
      { name: 'rune 2, 4 damage, strikes the 5-hp 5-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [1, 278, 450] },
      { name: 'rune 5, 6 damage, strikes the 7-hp 3-gon of boss 2, blow 6', expect: 'lost', at: 5, blow: [4, 278, 450] },
      { name: 'rune 6, 3 damage, strikes the 3-hp 3-gon of boss 1, blow 7', expect: 'lost', at: 6, blow: [5, 122, 458] },
      { name: 'rune 6, 3 damage, strikes the 4-hp 3-gon of boss 2, blow 8', expect: 'not-won', at: 7, blow: [5, 278, 450] },
    ],
  },
  'the-rescue': {
    intended: [
      [0, 278, 466], [1, 122, 450], [2, 278, 466], [3, 122, 450], [2, 122, 450], [0, 122, 450], [4, 278, 466], [3, 122, 450],
      [5, 122, 450], [2, 278, 466],
    ],
    wrong: [
      { name: 'rune 3, 4 damage, strikes the 5-hp 4-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [2, 122, 450] },
      { name: 'rune 1, 4 damage, strikes the 5-hp 3-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [0, 278, 466] },
      { name: 'rune 4, 3 damage, strikes the 3-hp 5-gon of boss 2, blow 8', expect: 'not-won', at: 7, blow: [3, 278, 466] },
      { name: 'rune 3, 3 damage, strikes the 6-hp 5-gon of boss 1, blow 9', expect: 'not-won', at: 8, blow: [2, 122, 450] },
    ],
  },
  'two-winters': {
    intended: [
      [0, 114, 470], [1, 114, 470], [2, 286, 442], [3, 114, 470], [2, 114, 470], [4, 286, 442], [5, 286, 442], [3, 114, 470],
      [0, 114, 470], [3, 114, 470], [4, 114, 470], [2, 286, 442],
    ],
    wrong: [
      { name: 'rune 2, 5 damage, strikes the 6-hp 6-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [1, 286, 442] },
      { name: 'rune 5, 4 damage, strikes the 6-hp 4-gon of boss 1, blow 6', expect: 'not-won', at: 5, blow: [4, 114, 470] },
      { name: 'rune 6, 3 damage, strikes the 6-hp 4-gon of boss 1, blow 7', expect: 'not-won', at: 6, blow: [5, 114, 470] },
      { name: 'rune 5, 4 damage, strikes the 6-hp 3-gon of boss 2, blow 11', expect: 'not-won', at: 10, blow: [4, 286, 442] },
    ],
  },
  'deep-winter': {
    intended: [
      [0, 278, 450], [1, 278, 450], [2, 122, 466], [2, 278, 450], [1, 278, 450], [3, 278, 450], [4, 122, 466], [2, 122, 466],
      [5, 122, 466], [2, 278, 450], [5, 122, 466], [5, 122, 466], [0, 278, 450],
    ],
    wrong: [
      { name: 'rune 2, 4 damage, strikes the 5-hp 4-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [1, 122, 466] },
      { name: 'rune 4, 3 damage, strikes the 4-hp 3-gon of boss 1, blow 6', expect: 'not-won', at: 5, blow: [3, 122, 466] },
      { name: 'rune 3, 3 damage, strikes the 5-hp 6-gon of boss 1, blow 9', expect: 'not-won', at: 8, blow: [2, 122, 466] },
      { name: 'rune 1, 4 damage, strikes the 6-hp 3-gon of boss 1, blow 12', expect: 'not-won', at: 11, blow: [0, 122, 466] },
    ],
  },
  'kindling': {
    gather: true,
    intended: [
      [0, 286, 442], [1, 286, 442], [2, 114, 462], [0, 286, 442], [3, 286, 442], [2, 114, 462], [4, 114, 462],
    ],
    wrong: [
      { name: 'rune 2, 4 damage, strikes the 5-hp 6-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [1, 114, 462] },
      { name: 'rune 4, 5 damage, strikes the 6-hp 3-gon of boss 1, blow 5', expect: 'not-won', at: 4, blow: [3, 114, 462] },
      { name: 'rune 3, 5 damage, strikes the 5-hp 3-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [2, 286, 442] },
      { name: 'rune 5, 5 damage, strikes the 5-hp 3-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [4, 286, 442] },
    ],
  },
  'short-fuse': {
    gather: true,
    intended: [
      [0, 286, 442], [1, 114, 462], [2, 286, 442], [0, 114, 462], [3, 286, 442], [4, 114, 462], [0, 114, 462], [5, 114, 462],
      [2, 286, 442],
    ],
    wrong: [
      { name: 'rune 3, 5 damage, strikes the 6-hp 6-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [2, 114, 462] },
      { name: 'rune 5, 4 damage, strikes the 6-hp 4-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [4, 286, 442] },
      { name: 'rune 1, 4 damage, strikes the 6-hp 3-gon of boss 2, blow 7', expect: 'not-won', at: 6, blow: [0, 286, 442] },
      { name: 'rune 6, 5 damage, strikes the 6-hp 3-gon of boss 2, blow 8', expect: 'not-won', at: 7, blow: [5, 286, 442] },
    ],
  },
  'firebreak': {
    gather: true,
    intended: [
      [0, 286, 442], [1, 114, 462], [2, 286, 442], [0, 286, 442], [3, 114, 462], [4, 114, 462], [0, 286, 442], [2, 114, 462],
      [5, 286, 442], [2, 114, 462],
    ],
    wrong: [
      { name: 'rune 3, 3 damage, strikes the 4-hp 5-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [2, 114, 462] },
      { name: 'rune 4, 5 damage, strikes the 6-hp 6-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [3, 286, 442] },
      { name: 'rune 5, 3 damage, strikes the 6-hp 6-gon of boss 2, blow 6', expect: 'not-won', at: 5, blow: [4, 286, 442] },
      { name: 'rune 3, 3 damage, strikes the 5-hp 3-gon of boss 2, blow 9', expect: 'not-won', at: 8, blow: [2, 286, 442] },
    ],
  },
  'backdraft': {
    gather: true,
    intended: [
      [0, 100, 456], [1, 300, 456], [2, 300, 456], [3, 300, 456], [3, 100, 456], [2, 300, 456], [3, 100, 456], [4, 100, 456],
      [1, 300, 456], [5, 300, 456], [2, 100, 456], [4, 100, 456],
    ],
    wrong: [
      { name: 'rune 3, 4 damage, strikes the 5-hp 4-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [2, 300, 456] },
      { name: 'rune 3, 3 damage, strikes the 3-hp 4-gon of boss 1, blow 6', expect: 'not-won', at: 5, blow: [2, 100, 456] },
      { name: 'rune 3, 4 damage, strikes the 5-hp 5-gon of boss 2, blow 10', expect: 'not-won', at: 9, blow: [2, 300, 456] },
      { name: 'rune 5, 3 damage, strikes the 4-hp 5-gon of boss 1, blow 11', expect: 'not-won', at: 10, blow: [4, 100, 456] },
    ],
  },
  'wildfire': {
    gather: true,
    intended: [
      [0, 114, 462], [1, 114, 462], [2, 286, 442], [2, 114, 462], [3, 114, 462], [4, 114, 462], [5, 286, 442], [1, 114, 462],
      [1, 286, 442], [2, 114, 462], [1, 286, 442], [2, 286, 442], [1, 114, 462],
    ],
    wrong: [
      { name: 'rune 2, 3 damage, strikes the 3-hp 6-gon of boss 2, blow 2', expect: 'lost', at: 1, blow: [1, 286, 442] },
      { name: 'rune 5, 4 damage, strikes the 5-hp 5-gon of boss 2, blow 6', expect: 'not-won', at: 5, blow: [4, 286, 442] },
      { name: 'rune 2, 3 damage, strikes the 5-hp 5-gon of boss 1, blow 9', expect: 'lost', at: 8, blow: [1, 114, 462] },
      { name: 'rune 2, 4 damage, strikes the 5-hp 4-gon of boss 2, blow 12', expect: 'not-won', at: 11, blow: [1, 286, 442] },
    ],
  },
  'phoenix': {
    gather: true,
    intended: [
      [0, 114, 462], [1, 114, 462], [2, 286, 442], [1, 114, 462], [0, 286, 442], [3, 114, 462], [4, 286, 442], [2, 114, 462],
      [2, 286, 442], [3, 286, 442], [5, 114, 462], [3, 114, 462], [1, 114, 462], [3, 286, 442], [4, 114, 462],
    ],
    wrong: [
      { name: 'rune 3, 5 damage, strikes the 6-hp 6-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [2, 114, 462] },
      { name: 'rune 5, 5 damage, strikes the 6-hp 4-gon of boss 1, blow 6', expect: 'lost', at: 5, blow: [4, 114, 462] },
      { name: 'rune 4, 4 damage, strikes the 6-hp 5-gon of boss 1, blow 10', expect: 'lost', at: 9, blow: [3, 114, 462] },
      { name: 'rune 4, 3 damage, strikes the 4-hp 6-gon of boss 1, blow 14', expect: 'not-won', at: 13, blow: [3, 114, 462] },
    ],
  },
}

const cast = ([slot, x, y]: Blow, gather: boolean): ScriptStep[] => [...(gather ? [{ gather: slot, at: { x, y } }] : []), { place: slot, at: { x, y } }, { feed: slot }, { tap: slot }]

export function shapedLines(): Record<string, Line[]> {
  return Object.fromEntries(
    Object.entries(SHAPED).map(([id, s]) => {
      const steps = (blows: Blow[]) => blows.flatMap((b) => cast(b, !!s.gather))
      return [
        id,
        [
          { name: 'intended', expect: 'won' as Expect, steps: steps(s.intended) },
          ...s.wrong.map((w) => ({ name: w.name, expect: w.expect, steps: steps([...s.intended.slice(0, w.at), w.blow, ...s.intended.slice(w.at)]) })),
        ],
      ]
    }),
  )
}
