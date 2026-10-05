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
  'coins-4': {
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
  'coins-5': {
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
  'coins-6': {
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
  'coins-7': {
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
  'coins-8': {
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
  'coins-9': {
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
  'coins-page': {
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
  'coins-king': {
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
  'cups-6': {
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
  'cups-7': {
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
  'cups-9': {
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
  'cups-10': {
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
  'swords-4': {
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
  'swords-6': {
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
  'swords-7': {
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
  'swords-9': {
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
  'swords-10': {
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
  'swords-knight': {
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
  'swords-queen': {
    gather: true,
    intended: [
      [0, 114, 442], [0, 114, 442], [1, 198, 442], [2, 286, 442], [1, 114, 442], [3, 114, 442], [0, 198, 442], [4, 286, 442],
      [1, 198, 442], [5, 286, 442], [0, 198, 442], [2, 114, 442], [1, 114, 442], [4, 286, 442], [5, 198, 442], [1, 114, 442],
    ],
    wrong: [
      { name: 'rune 2, 3 damage, strikes the 6-hp 5-gon of boss 3, blow 3', expect: 'not-won', at: 2, blow: [1, 286, 442] },
      { name: 'rune 1, 4 damage, strikes the 6-hp 3-gon of boss 1, blow 6', expect: 'not-won', at: 5, blow: [0, 114, 442] },
      { name: 'rune 1, 3 damage, strikes the 5-hp 4-gon of boss 1, blow 11', expect: 'not-won', at: 10, blow: [0, 114, 442] },
      { name: 'rune 6, 3 damage, strikes the 6-hp 4-gon of boss 1, blow 15', expect: 'not-won', at: 14, blow: [5, 114, 442] },
    ],
  },
  'swords-king': {
    gather: true,
    intended: [
      [0, 114, 442], [1, 198, 442], [2, 114, 442], [3, 286, 442], [2, 286, 442], [4, 114, 442], [1, 198, 442], [0, 114, 442],
      [5, 198, 442], [2, 114, 442], [4, 286, 442], [0, 198, 442], [5, 198, 442], [0, 114, 442], [5, 286, 442], [0, 198, 442],
      [4, 114, 442],
    ],
    wrong: [
      { name: 'rune 4, 3 damage, strikes the 3-hp 3-gon of boss 1, blow 4', expect: 'not-won', at: 3, blow: [3, 114, 442] },
      { name: 'rune 2, 3 damage, strikes the 3-hp 3-gon of boss 3, blow 7', expect: 'not-won', at: 6, blow: [1, 286, 442] },
      { name: 'rune 6, 3 damage, strikes the 6-hp 5-gon of boss 1, blow 13', expect: 'lost', at: 12, blow: [5, 114, 442] },
      { name: 'rune 5, 3 damage, strikes the 5-hp 4-gon of boss 2, blow 16', expect: 'not-won', at: 15, blow: [4, 198, 442] },
    ],
  },
  'cups-king': {
    intended: [
      [0, 198, 442], [1, 198, 442], [0, 114, 442], [2, 286, 442], [0, 198, 442], [3, 198, 442], [4, 114, 442], [4, 286, 442],
      [5, 198, 442], [0, 286, 442], [2, 114, 442], [4, 198, 442], [2, 198, 442], [0, 114, 442], [4, 286, 442], [5, 198, 442],
      [2, 114, 442],
    ],
    wrong: [
      { name: 'rune 1, 3 damage, strikes the 6-hp 4-gon of boss 3, blow 3', expect: 'not-won', at: 2, blow: [0, 286, 442] },
      { name: 'rune 5, 4 damage, strikes the 6-hp 6-gon of boss 2, blow 7', expect: 'not-won', at: 6, blow: [4, 198, 442] },
      { name: 'rune 6, 6 damage, strikes the 6-hp 3-gon of boss 1, blow 12', expect: 'not-won', at: 11, blow: [5, 114, 442] },
      { name: 'rune 3, 3 damage, strikes the 6-hp 3-gon of boss 2, blow 16', expect: 'not-won', at: 15, blow: [2, 198, 442] },
    ],
  },
  'cups-queen': {
    intended: [
      [0, 198, 442], [1, 114, 442], [0, 286, 442], [0, 286, 442], [2, 286, 442], [3, 114, 442], [4, 198, 442], [1, 198, 442],
      [0, 286, 442], [5, 114, 442], [3, 286, 442], [0, 198, 442], [3, 114, 442], [5, 114, 442], [4, 198, 442], [5, 198, 442],
    ],
    wrong: [
      { name: 'rune 1, 4 damage, strikes the 6-hp 6-gon of boss 3, blow 1', expect: 'not-won', at: 0, blow: [0, 286, 442] },
      { name: 'rune 2, 3 damage, strikes the 6-hp 6-gon of boss 3, blow 7', expect: 'not-won', at: 6, blow: [1, 286, 442] },
      { name: 'rune 4, 4 damage, strikes the 5-hp 5-gon of boss 1, blow 11', expect: 'lost', at: 10, blow: [3, 114, 442] },
      { name: 'rune 6, 4 damage, strikes the 4-hp 5-gon of boss 2, blow 15', expect: 'not-won', at: 14, blow: [5, 198, 442] },
    ],
  },
  'coins-queen': {
    intended: [
      [0, 114, 442], [1, 286, 442], [2, 114, 442], [3, 286, 442], [2, 286, 442], [4, 286, 442], [5, 114, 442], [3, 114, 442],
      [5, 286, 442], [0, 114, 442], [3, 114, 442], [3, 286, 442], [5, 114, 442], [4, 286, 442],
    ],
    wrong: [
      { name: 'rune 3, 4 damage, strikes the 6-hp 3-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [2, 286, 442] },
      { name: 'rune 6, 3 damage, strikes the 4-hp 3-gon of boss 2, blow 6', expect: 'not-won', at: 5, blow: [5, 286, 442] },
      { name: 'rune 4, 3 damage, strikes the 3-hp 6-gon of boss 2, blow 9', expect: 'not-won', at: 8, blow: [3, 286, 442] },
      { name: 'rune 5, 3 damage, strikes the 6-hp 5-gon of boss 1, blow 13', expect: 'not-won', at: 12, blow: [4, 114, 442] },
    ],
  },
  'cups-knight': {
    intended: [
      [0, 286, 442], [1, 114, 442], [2, 286, 442], [0, 114, 442], [3, 114, 442], [4, 286, 442], [5, 286, 442], [0, 114, 442],
      [5, 114, 442], [2, 114, 442], [5, 286, 442], [5, 114, 442], [5, 286, 442], [1, 114, 442], [2, 286, 442],
    ],
    wrong: [
      { name: 'rune 3, 4 damage, strikes the 6-hp 6-gon of boss 1, blow 3', expect: 'not-won', at: 2, blow: [2, 114, 442] },
      { name: 'rune 6, 5 damage, strikes the 6-hp 5-gon of boss 1, blow 7', expect: 'not-won', at: 6, blow: [5, 114, 442] },
      { name: 'rune 6, 5 damage, strikes the 6-hp 6-gon of boss 1, blow 10', expect: 'not-won', at: 9, blow: [5, 114, 442] },
      { name: 'rune 2, 3 damage, strikes the 6-hp 3-gon of boss 2, blow 14', expect: 'not-won', at: 13, blow: [1, 286, 442] },
    ],
  },
  'swords-page': {
    gather: true,
    intended: [
      [0, 114, 442], [1, 114, 442], [2, 286, 442], [1, 114, 442], [3, 114, 442], [4, 286, 442], [5, 114, 442], [2, 114, 442],
      [1, 114, 442], [3, 286, 442], [5, 114, 442], [1, 286, 442], [4, 114, 442], [2, 286, 442],
    ],
    wrong: [
      { name: 'rune 3, 4 damage, strikes the 5-hp 5-gon of boss 1, blow 2', expect: 'lost', at: 1, blow: [2, 114, 442] },
      { name: 'rune 5, 4 damage, strikes the 5-hp 5-gon of boss 1, blow 6', expect: 'not-won', at: 5, blow: [4, 114, 442] },
      { name: 'rune 5, 5 damage, strikes the 5-hp 3-gon of boss 1, blow 8', expect: 'not-won', at: 7, blow: [4, 114, 442] },
      { name: 'rune 3, 3 damage, strikes the 5-hp 3-gon of boss 1, blow 13', expect: 'not-won', at: 12, blow: [2, 114, 442] },
    ],
  },
  'cups-page': {
    intended: [
      [0, 128, 456], [1, 128, 456], [2, 272, 456], [3, 272, 456], [4, 128, 456], [5, 272, 456], [2, 128, 456], [2, 272, 456],
      [2, 272, 456], [0, 272, 456], [5, 128, 456], [0, 128, 456], [4, 128, 456], [0, 272, 456],
    ],
    wrong: [
      { name: 'rune 3, 3 damage, strikes the 6-hp 6-gon of boss 1, blow 5', expect: 'not-won', at: 4, blow: [2, 128, 456] },
      { name: 'rune 5, 3 damage, strikes the 3-hp 6-gon of boss 1, blow 6', expect: 'lost', at: 5, blow: [4, 128, 456] },
      { name: 'rune 6, 3 damage, strikes the 6-hp 3-gon of boss 2, blow 9', expect: 'not-won', at: 8, blow: [5, 272, 456] },
      { name: 'rune 1, 5 damage, strikes the 6-hp 6-gon of boss 1, blow 13', expect: 'not-won', at: 12, blow: [0, 128, 456] },
    ],
  },
  'coins-knight': {
    intended: [
      [0, 286, 442], [1, 286, 442], [0, 114, 442], [1, 286, 442], [0, 114, 442], [0, 286, 442], [2, 286, 442], [2, 286, 442],
      [3, 114, 442], [1, 286, 442], [0, 286, 442], [4, 114, 442], [5, 286, 442],
    ],
    wrong: [
      { name: 'rune 2, 3 damage, strikes the 6-hp 6-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [1, 114, 442] },
      { name: 'rune 5, 5 damage, strikes the 5-hp 5-gon of boss 2, blow 6', expect: 'not-won', at: 5, blow: [4, 286, 442] },
      { name: 'rune 2, 5 damage, strikes the 6-hp 3-gon of boss 1, blow 9', expect: 'not-won', at: 8, blow: [1, 114, 442] },
      { name: 'rune 6, 5 damage, strikes the 6-hp 5-gon of boss 1, blow 12', expect: 'not-won', at: 11, blow: [5, 114, 442] },
    ],
  },
  'coins-10': {
    intended: [
      [0, 114, 442], [1, 286, 442], [0, 286, 442], [1, 114, 442], [2, 114, 442], [3, 114, 442], [0, 286, 442], [1, 286, 442],
      [4, 286, 442], [5, 114, 442], [1, 286, 442],
    ],
    wrong: [
      { name: 'rune 1, 3 damage, strikes the 3-hp 5-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [0, 286, 442] },
      { name: 'rune 4, 4 damage, strikes the 5-hp 4-gon of boss 1, blow 5', expect: 'not-won', at: 4, blow: [3, 114, 442] },
      { name: 'rune 2, 3 damage, strikes the 5-hp 5-gon of boss 1, blow 9', expect: 'not-won', at: 8, blow: [1, 114, 442] },
      { name: 'rune 2, 3 damage, strikes the 5-hp 5-gon of boss 1, blow 10', expect: 'not-won', at: 9, blow: [1, 114, 442] },
    ],
  },
  'cups-8': {
    intended: [
      [0, 278, 450], [1, 122, 450], [2, 278, 450], [3, 122, 450], [4, 278, 450], [5, 122, 450], [3, 122, 450], [0, 278, 450],
      [3, 278, 450], [2, 278, 450], [1, 122, 450],
    ],
    wrong: [
      { name: 'rune 3, 5 damage, strikes the 7-hp 4-gon of boss 1, blow 3', expect: 'lost', at: 2, blow: [2, 122, 450] },
      { name: 'rune 4, 4 damage, strikes the 6-hp 3-gon of boss 2, blow 6', expect: 'lost', at: 5, blow: [3, 278, 450] },
      { name: 'rune 4, 4 damage, strikes the 6-hp 3-gon of boss 2, blow 7', expect: 'lost', at: 6, blow: [3, 278, 450] },
      { name: 'rune 3, 4 damage, strikes the 6-hp 4-gon of boss 1, blow 10', expect: 'not-won', at: 9, blow: [2, 122, 450] },
    ],
  },
  'swords-8': {
    gather: true,
    intended: [
      [0, 286, 442], [1, 114, 442], [2, 286, 442], [0, 286, 442], [1, 114, 442], [3, 114, 442], [4, 286, 442], [0, 286, 442],
      [3, 286, 442], [0, 286, 442], [5, 114, 442],
    ],
    wrong: [
      { name: 'rune 3, 4 damage, strikes the 5-hp 4-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [2, 114, 442] },
      { name: 'rune 4, 3 damage, strikes the 3-hp 4-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [3, 286, 442] },
      { name: 'rune 1, 5 damage, strikes the 6-hp 6-gon of boss 1, blow 9', expect: 'not-won', at: 8, blow: [0, 114, 442] },
      { name: 'rune 1, 5 damage, strikes the 6-hp 6-gon of boss 1, blow 10', expect: 'not-won', at: 9, blow: [0, 114, 442] },
    ],
  },
  'cups-5': {
    intended: [
      [0, 278, 450], [1, 122, 450], [2, 278, 450], [0, 278, 450], [3, 122, 450], [4, 122, 450], [0, 278, 450], [5, 122, 450],
    ],
    wrong: [
      { name: 'rune 2, 3 damage, strikes the 5-hp 3-gon of boss 2, blow 1', expect: 'not-won', at: 0, blow: [1, 278, 450] },
      { name: 'rune 2, 3 damage, strikes the 6-hp 3-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [1, 278, 450] },
      { name: 'rune 6, 4 damage, strikes the 6-hp 5-gon of boss 2, blow 7', expect: 'not-won', at: 6, blow: [5, 278, 450] },
      { name: 'rune 1, 4 damage, strikes the 4-hp 5-gon of boss 1, blow 7', expect: 'not-won', at: 6, blow: [0, 122, 450] },
    ],
  },
  'swords-5': {
    gather: true,
    intended: [
      [0, 286, 442], [1, 114, 442], [2, 286, 442], [3, 286, 442], [4, 114, 442], [2, 286, 442], [5, 114, 442], [2, 286, 442],
    ],
    wrong: [
      { name: 'rune 2, 4 damage, strikes the 5-hp 3-gon of boss 2, blow 1', expect: 'not-won', at: 0, blow: [1, 286, 442] },
      { name: 'rune 5, 4 damage, strikes the 6-hp 5-gon of boss 2, blow 4', expect: 'not-won', at: 3, blow: [4, 286, 442] },
      { name: 'rune 3, 4 damage, strikes the 5-hp 6-gon of boss 1, blow 7', expect: 'not-won', at: 6, blow: [2, 114, 442] },
      { name: 'rune 6, 4 damage, strikes the 4-hp 6-gon of boss 2, blow 7', expect: 'not-won', at: 6, blow: [5, 286, 442] },
    ],
  },
  'swords-3': {
    gather: true,
    intended: [
      [0, 300, 456], [1, 300, 456], [2, 100, 456], [3, 100, 456], [4, 300, 456], [5, 100, 456],
    ],
    wrong: [
      { name: 'rune 3, 3 damage, strikes the 5-hp 4-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [2, 300, 456] },
      { name: 'rune 2, 3 damage, strikes the 3-hp 4-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [1, 100, 456] },
      { name: 'rune 5, 3 damage, strikes the 4-hp 3-gon of boss 1, blow 5', expect: 'not-won', at: 4, blow: [4, 100, 456] },
      { name: 'rune 6, 3 damage, strikes the 3-hp 3-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [5, 300, 456] },
    ],
  },
  'cups-2': {
    intended: [
      [0, 286, 442], [1, 114, 442], [2, 286, 442], [3, 286, 442], [4, 114, 442],
    ],
    wrong: [
      { name: 'rune 1, 4 damage, strikes the 5-hp 4-gon of boss 1, blow 1', expect: 'not-won', at: 0, blow: [0, 114, 442] },
      { name: 'rune 2, 5 damage, strikes the 6-hp 4-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [1, 286, 442] },
      { name: 'rune 5, 3 damage, strikes the 4-hp 5-gon of boss 2, blow 4', expect: 'not-won', at: 3, blow: [4, 286, 442] },
      { name: 'rune 4, 3 damage, strikes the 3-hp 5-gon of boss 1, blow 4', expect: 'not-won', at: 3, blow: [3, 114, 442] },
    ],
  },
  'cups-3': {
    intended: [
      [0, 122, 450], [0, 278, 450], [1, 122, 450], [2, 278, 450], [3, 122, 450], [4, 278, 450],
    ],
    wrong: [
      { name: 'rune 1, 4 damage, strikes the 5-hp 4-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [0, 122, 450] },
      { name: 'rune 2, 4 damage, strikes the 4-hp 4-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [1, 278, 450] },
      { name: 'rune 5, 3 damage, strikes the 4-hp 5-gon of boss 1, blow 5', expect: 'not-won', at: 4, blow: [4, 122, 450] },
      { name: 'rune 4, 3 damage, strikes the 3-hp 5-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [3, 278, 450] },
    ],
  },
  'cups-4': {
    intended: [
      [0, 114, 442], [1, 286, 442], [2, 286, 442], [3, 114, 442], [4, 114, 442], [5, 114, 442], [1, 286, 442],
    ],
    wrong: [
      { name: 'rune 2, 3 damage, strikes the 5-hp 4-gon of boss 1, blow 1', expect: 'not-won', at: 0, blow: [1, 114, 442] },
      { name: 'rune 6, 4 damage, strikes the 4-hp 6-gon of boss 1, blow 5', expect: 'not-won', at: 4, blow: [5, 114, 442] },
      { name: 'rune 6, 4 damage, strikes the 4-hp 6-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [5, 286, 442] },
      { name: 'rune 2, 4 damage, strikes the 6-hp 6-gon of boss 1, blow 6', expect: 'not-won', at: 5, blow: [1, 114, 442] },
    ],
  },
  'swords-ace': {
    gather: true,
    intended: [
      [0, 100, 456], [1, 300, 456], [2, 300, 456], [3, 100, 456],
    ],
    wrong: [
      { name: 'rune 1, 3 damage, strikes the 5-hp 4-gon of boss 2, blow 1', expect: 'not-won', at: 0, blow: [0, 300, 456] },
      { name: 'rune 2, 3 damage, strikes the 3-hp 4-gon of boss 1, blow 1', expect: 'not-won', at: 0, blow: [1, 100, 456] },
    ],
  },
  'swords-2': {
    gather: true,
    intended: [
      [0, 300, 456], [1, 100, 456], [2, 300, 456], [3, 100, 456], [4, 300, 456],
    ],
    wrong: [
      { name: 'rune 2, 4 damage, strikes the 5-hp 3-gon of boss 2, blow 1', expect: 'not-won', at: 0, blow: [1, 300, 456] },
      { name: 'rune 3, 3 damage, strikes the 3-hp 4-gon of boss 1, blow 3', expect: 'not-won', at: 2, blow: [2, 100, 456] },
      { name: 'rune 4, 3 damage, strikes the 4-hp 4-gon of boss 2, blow 4', expect: 'not-won', at: 3, blow: [3, 300, 456] },
      { name: 'rune 5, 3 damage, strikes the 3-hp 4-gon of boss 1, blow 4', expect: 'not-won', at: 3, blow: [4, 100, 456] },
    ],
  },
  'cups-ace': {
    intended: [
      [0, 278, 450], [1, 122, 450], [2, 122, 450], [3, 278, 450],
    ],
    wrong: [
      { name: 'rune 1, 4 damage, strikes the 5-hp 4-gon of boss 1, blow 1', expect: 'not-won', at: 0, blow: [0, 122, 450] },
      { name: 'rune 2, 4 damage, strikes the 4-hp 4-gon of boss 2, blow 1', expect: 'not-won', at: 0, blow: [1, 278, 450] },
    ],
  },
  'staves-ace': {
    intended: [
      [0, 100, 456], [1, 300, 456], [2, 300, 456], [3, 100, 456],
    ],
    wrong: [
      { name: 'rune 2, 3 damage, strikes the 5-hp 3-gon of boss 1, blow 1', expect: 'not-won', at: 0, blow: [1, 100, 456] },
      { name: 'rune 4, 4 damage, strikes the 5-hp 4-gon of boss 1, blow 2', expect: 'not-won', at: 1, blow: [3, 100, 456] },
      { name: 'rune 3, 4 damage, strikes the 5-hp 4-gon of boss 1, blow 3', expect: 'not-won', at: 2, blow: [2, 100, 456] },
      { name: 'rune 4, 4 damage, strikes the 5-hp 4-gon of boss 1, blow 3', expect: 'not-won', at: 2, blow: [3, 100, 456] },
    ],
  },
  'staves-2': {
    intended: [
      [0, 286, 442], [0, 114, 442], [1, 286, 442], [2, 286, 442], [3, 114, 442],
    ],
    wrong: [
      { name: 'rune 3, 3 damage, strikes the 4-hp 4-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [2, 286, 442] },
      { name: 'rune 2, 4 damage, strikes the 5-hp 4-gon of boss 1, blow 3', expect: 'not-won', at: 2, blow: [1, 114, 442] },
      { name: 'rune 3, 4 damage, strikes the 5-hp 4-gon of boss 1, blow 4', expect: 'not-won', at: 3, blow: [2, 114, 442] },
      { name: 'rune 4, 4 damage, strikes the 4-hp 4-gon of boss 2, blow 4', expect: 'not-won', at: 3, blow: [3, 286, 442] },
    ],
  },
  'staves-3': {
    intended: [
      [0, 286, 442], [1, 286, 442], [2, 114, 442], [3, 114, 442], [4, 114, 442], [5, 286, 442],
    ],
    wrong: [
      { name: 'rune 1, 3 damage, strikes the 5-hp 4-gon of boss 1, blow 1', expect: 'not-won', at: 0, blow: [0, 114, 442] },
      { name: 'rune 5, 2 damage, strikes the 5-hp 3-gon of boss 2, blow 3', expect: 'lost', at: 2, blow: [4, 286, 442] },
      { name: 'rune 5, 4 damage, strikes the 5-hp 3-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [4, 286, 442] },
      { name: 'rune 6, 4 damage, strikes the 4-hp 3-gon of boss 1, blow 5', expect: 'not-won', at: 4, blow: [5, 114, 442] },
    ],
  },
  'staves-page': {
    intended: [
      [0, 114, 442], [1, 286, 442], [2, 114, 442], [3, 114, 442], [4, 114, 442], [5, 286, 442], [5, 286, 442], [4, 114, 442],
      [4, 286, 442], [5, 286, 442], [3, 114, 442], [3, 286, 442], [5, 114, 442], [1, 286, 442],
    ],
    wrong: [
      { name: 'rune 5, 0 damage, strikes the 3-hp 6-gon of boss 2, blow 3', expect: 'not-won', at: 2, blow: [4, 286, 442] },
      { name: 'rune 4, 3 damage, strikes the 5-hp 4-gon of boss 1, blow 8', expect: 'not-won', at: 7, blow: [3, 114, 442] },
      { name: 'rune 4, 4 damage, strikes the 6-hp 4-gon of boss 2, blow 10', expect: 'not-won', at: 9, blow: [3, 286, 442] },
      { name: 'rune 2, 3 damage, strikes the 4-hp 5-gon of boss 1, blow 13', expect: 'not-won', at: 12, blow: [1, 114, 442] },
    ],
  },
  'staves-knight': {
    intended: [
      [0, 286, 442], [0, 286, 442], [1, 114, 442], [2, 114, 442], [0, 286, 442], [3, 286, 442], [4, 114, 442], [2, 114, 442],
      [3, 286, 442], [5, 286, 442], [2, 114, 442], [0, 114, 442], [1, 114, 442], [0, 286, 442], [4, 114, 442],
    ],
    wrong: [
      { name: 'rune 1, 3 damage, strikes the 4-hp 6-gon of boss 2, blow 3', expect: 'lost', at: 2, blow: [0, 286, 442] },
      { name: 'rune 5, 5 damage, strikes the 6-hp 6-gon of boss 2, blow 7', expect: 'lost', at: 6, blow: [4, 286, 442] },
      { name: 'rune 3, 3 damage, strikes the 6-hp 6-gon of boss 2, blow 9', expect: 'not-won', at: 8, blow: [2, 286, 442] },
      { name: 'rune 1, 5 damage, strikes the 6-hp 3-gon of boss 1, blow 14', expect: 'not-won', at: 13, blow: [0, 114, 442] },
    ],
  },
  'staves-queen': {
    intended: [
      [0, 198, 442], [1, 114, 442], [2, 114, 442], [0, 286, 442], [1, 286, 442], [3, 198, 442], [4, 114, 442], [1, 286, 442],
      [5, 286, 442], [0, 198, 442], [2, 114, 442], [3, 198, 442], [3, 286, 442], [5, 198, 442], [3, 114, 442], [2, 114, 442],
    ],
    wrong: [
      { name: 'rune 1, 5 damage, strikes the 6-hp 6-gon of boss 1, blow 3', expect: 'lost', at: 2, blow: [0, 114, 442] },
      { name: 'rune 2, 3 damage, strikes the 4-hp 3-gon of boss 1, blow 7', expect: 'not-won', at: 6, blow: [1, 114, 442] },
      { name: 'rune 4, 4 damage, strikes the 6-hp 6-gon of boss 1, blow 11', expect: 'not-won', at: 10, blow: [3, 114, 442] },
      { name: 'rune 4, 4 damage, strikes the 5-hp 4-gon of boss 2, blow 14', expect: 'not-won', at: 13, blow: [3, 198, 442] },
    ],
  },
  'staves-10': {
    intended: [
      [0, 286, 442], [1, 114, 442], [2, 114, 442], [2, 114, 442], [3, 286, 442], [4, 286, 442], [5, 114, 442], [4, 114, 442],
      [1, 114, 442], [0, 286, 442], [3, 114, 442], [1, 114, 442], [5, 286, 442],
    ],
    wrong: [
      { name: 'rune 4, 3 damage, strikes the 4-hp 6-gon of boss 2, blow 3', expect: 'lost', at: 2, blow: [3, 286, 442] },
      { name: 'rune 5, 4 damage, strikes the 5-hp 6-gon of boss 1, blow 6', expect: 'not-won', at: 5, blow: [4, 114, 442] },
      { name: 'rune 2, 4 damage, strikes the 6-hp 3-gon of boss 2, blow 11', expect: 'lost', at: 10, blow: [1, 286, 442] },
      { name: 'rune 2, 5 damage, strikes the 6-hp 3-gon of boss 2, blow 12', expect: 'not-won', at: 11, blow: [1, 286, 442] },
    ],
  },
  'staves-king': {
    intended: [
      [0, 198, 442], [1, 114, 442], [2, 286, 442], [0, 198, 442], [1, 286, 442], [3, 198, 442], [4, 114, 442], [1, 286, 442],
      [5, 114, 442], [0, 114, 442], [3, 198, 442], [5, 198, 442], [5, 114, 442], [5, 198, 442], [3, 286, 442], [1, 198, 442],
      [4, 114, 442],
    ],
    wrong: [
      { name: 'rune 2, 3 damage, strikes the 3-hp 5-gon of boss 1, blow 3', expect: 'not-won', at: 2, blow: [1, 114, 442] },
      { name: 'rune 5, 3 damage, strikes the 5-hp 5-gon of boss 2, blow 6', expect: 'not-won', at: 5, blow: [4, 198, 442] },
      { name: 'rune 2, 3 damage, strikes the 5-hp 6-gon of boss 1, blow 12', expect: 'not-won', at: 11, blow: [1, 114, 442] },
      { name: 'rune 2, 3 damage, strikes the 5-hp 6-gon of boss 1, blow 16', expect: 'not-won', at: 15, blow: [1, 114, 442] },
    ],
  },
  'major-16': {
    gather: true,
    intended: [
      [0, 272, 484], [1, 128, 484], [2, 200, 456], [3, 272, 484], [4, 272, 484], [5, 128, 484], [2, 128, 484], [0, 200, 456],
      [1, 272, 484], [4, 200, 456], [1, 200, 456], [4, 272, 484], [0, 200, 456], [4, 128, 484], [1, 200, 456], [4, 272, 484],
      [5, 128, 484], [0, 200, 456], [1, 272, 484], [0, 200, 456], [5, 128, 484], [1, 128, 484], [0, 128, 484], [4, 200, 456],
      [5, 128, 484], [5, 128, 484], [5, 128, 484], [2, 272, 484], [3, 200, 456], [2, 128, 484],
    ],
    wrong: [
      { name: 'rune 4, 3 damage, strikes the 5-hp 5-gon of boss 1, blow 5', expect: 'not-won', at: 4, blow: [3, 128, 484] },
      { name: 'rune 1, 3 damage, strikes the 3-hp 6-gon of boss 1, blow 12', expect: 'not-won', at: 11, blow: [0, 128, 484] },
      { name: 'rune 4, 3 damage, strikes the 4-hp 5-gon of boss 3, blow 20', expect: 'not-won', at: 19, blow: [3, 272, 484] },
      { name: 'rune 3, 4 damage, strikes the 5-hp 5-gon of boss 1, blow 28', expect: 'not-won', at: 27, blow: [2, 128, 484] },
    ],
  },
  'major-19': {
    gather: true,
    intended: [
      [0, 200, 456], [1, 200, 456], [2, 128, 484], [3, 128, 484], [3, 272, 484], [4, 128, 484], [5, 200, 456], [2, 128, 484],
      [0, 272, 484], [4, 272, 484], [4, 200, 456], [3, 128, 484], [4, 272, 484], [0, 200, 456], [4, 128, 484], [3, 128, 484],
      [5, 200, 456], [2, 272, 484], [0, 200, 456], [2, 128, 484], [3, 128, 484], [4, 272, 484], [4, 272, 484], [5, 128, 484],
      [3, 200, 456], [5, 272, 484], [5, 128, 484], [0, 200, 456], [3, 128, 484], [5, 272, 484], [1, 128, 484], [5, 200, 456],
      [0, 128, 484],
    ],
    wrong: [
      { name: 'rune 5, 5 damage, strikes the 6-hp 6-gon of boss 3, blow 6', expect: 'not-won', at: 5, blow: [4, 272, 484] },
      { name: 'rune 1, 6 damage, strikes the 6-hp 8-gon of boss 2, blow 13', expect: 'not-won', at: 12, blow: [0, 200, 456] },
      { name: 'rune 1, 4 damage, strikes the 4-hp 6-gon of boss 1, blow 22', expect: 'lost', at: 21, blow: [0, 128, 484] },
      { name: 'rune 4, 4 damage, strikes the 8-hp 5-gon of boss 2, blow 29', expect: 'not-won', at: 28, blow: [3, 200, 456] },
    ],
  },
  'major-17': {
    intended: [
      [0, 200, 456], [1, 272, 484], [2, 128, 484], [3, 272, 484], [4, 272, 484], [5, 200, 456], [0, 128, 484], [2, 128, 484],
      [0, 272, 484], [4, 128, 484], [0, 200, 456], [3, 200, 456], [4, 200, 456], [3, 128, 484], [5, 128, 484], [4, 272, 484],
      [3, 200, 456], [4, 128, 484], [5, 200, 456], [3, 272, 484], [3, 200, 456], [5, 272, 484], [4, 128, 484], [5, 272, 484],
      [3, 272, 484], [5, 200, 456], [5, 128, 484], [4, 272, 484], [2, 200, 456], [0, 128, 484], [1, 128, 484],
    ],
    wrong: [
      { name: 'rune 5, 4 damage, strikes the 5-hp 4-gon of boss 1, blow 5', expect: 'not-won', at: 4, blow: [4, 128, 484] },
      { name: 'rune 5, 5 damage, strikes the 7-hp 4-gon of boss 1, blow 13', expect: 'not-won', at: 12, blow: [4, 128, 484] },
      { name: 'rune 1, 6 damage, strikes the 7-hp 6-gon of boss 2, blow 20', expect: 'not-won', at: 19, blow: [0, 200, 456] },
      { name: 'rune 2, 5 damage, strikes the 6-hp 6-gon of boss 1, blow 29', expect: 'not-won', at: 28, blow: [1, 128, 484] },
    ],
  },
  'major-20': {
    gather: true,
    intended: [
      [0, 198, 442], [1, 114, 442], [2, 198, 442], [3, 286, 442], [3, 114, 442], [4, 198, 442], [5, 198, 442], [3, 198, 442],
      [2, 114, 442], [0, 114, 442], [3, 198, 442], [5, 114, 442], [1, 198, 442], [2, 286, 442], [2, 286, 442], [1, 114, 442],
      [2, 114, 442], [5, 198, 442], [3, 286, 442], [2, 286, 442], [5, 198, 442], [3, 114, 442], [2, 286, 442], [5, 114, 442],
      [3, 198, 442], [1, 286, 442], [5, 198, 442], [5, 198, 442], [1, 286, 442], [1, 114, 442], [1, 114, 442], [0, 198, 442],
      [4, 286, 442], [0, 114, 442],
    ],
    wrong: [
      { name: 'rune 5, 0 damage, strikes the 3-hp 3-gon of boss 1, blow 5', expect: 'not-won', at: 4, blow: [4, 114, 442] },
      { name: 'rune 1, 3 damage, strikes the 3-hp 3-gon of boss 1, blow 14', expect: 'not-won', at: 13, blow: [0, 114, 442] },
      { name: 'rune 1, 4 damage, strikes the 6-hp 3-gon of boss 1, blow 22', expect: 'not-won', at: 21, blow: [0, 114, 442] },
      { name: 'rune 2, 4 damage, strikes the 4-hp 3-gon of boss 2, blow 31', expect: 'not-won', at: 30, blow: [1, 198, 442] },
    ],
  },
  'major-13': {
    gather: true,
    intended: [
      [0, 114, 442], [1, 114, 442], [2, 198, 442], [3, 286, 442], [4, 114, 442], [1, 198, 442], [5, 114, 442], [1, 286, 442],
      [0, 198, 442], [0, 286, 442], [1, 114, 442], [2, 198, 442], [0, 286, 442], [5, 198, 442], [2, 114, 442], [0, 198, 442],
      [2, 286, 442], [0, 114, 442], [5, 198, 442], [2, 114, 442], [2, 198, 442], [5, 114, 442], [5, 198, 442], [5, 286, 442],
      [4, 114, 442], [1, 198, 442], [3, 114, 442],
    ],
    wrong: [

    ],
  },
  'major-15': {
    gather: true,
    intended: [
      [0, 114, 442], [1, 286, 442], [2, 114, 442], [3, 286, 442], [4, 114, 442], [2, 114, 442], [5, 114, 442], [3, 286, 442],
      [0, 114, 442], [1, 286, 442], [3, 114, 442], [1, 286, 442], [5, 114, 442], [4, 286, 442], [4, 286, 442], [2, 286, 442],
      [4, 114, 442], [2, 286, 442], [3, 114, 442], [5, 286, 442], [4, 286, 442], [5, 114, 442], [2, 286, 442], [3, 114, 442],
      [5, 286, 442], [2, 114, 442], [1, 114, 442], [5, 286, 442], [0, 286, 442],
    ],
    wrong: [

    ],
  },
  'major-11': {
    intended: [
      [0, 128, 456], [0, 272, 456], [1, 272, 456], [2, 128, 456], [0, 272, 456], [3, 128, 456], [4, 272, 456], [5, 272, 456],
      [1, 128, 456], [0, 128, 456], [2, 128, 456], [1, 272, 456], [0, 272, 456], [2, 128, 456], [3, 128, 456], [3, 272, 456],
      [5, 128, 456], [2, 272, 456], [2, 272, 456], [3, 128, 456], [5, 272, 456], [5, 272, 456], [5, 128, 456], [0, 272, 456],
      [3, 128, 456],
    ],
    wrong: [
      { name: 'rune 2, 3 damage, strikes the 5-hp 4-gon of boss 1, blow 3', expect: 'not-won', at: 2, blow: [1, 128, 456] },
      { name: 'rune 1, 3 damage, strikes the 4-hp 6-gon of boss 1, blow 11', expect: 'not-won', at: 10, blow: [0, 128, 456] },
      { name: 'rune 6, 4 damage, strikes the 7-hp 3-gon of boss 2, blow 17', expect: 'lost', at: 16, blow: [5, 272, 456] },
      { name: 'rune 4, 5 damage, strikes the 6-hp 5-gon of boss 2, blow 23', expect: 'not-won', at: 22, blow: [3, 272, 456] },
    ],
  },
  'major-08': {
    intended: [
      [0, 122, 450], [0, 122, 450], [1, 278, 450], [2, 278, 450], [3, 278, 450], [4, 122, 450], [5, 122, 450], [2, 278, 450],
      [2, 122, 450], [2, 278, 450], [5, 278, 450], [0, 122, 450], [5, 122, 450], [0, 278, 450], [2, 122, 450], [4, 278, 450],
      [4, 278, 450], [5, 278, 450], [4, 122, 450], [0, 278, 450], [1, 122, 450], [5, 278, 450],
    ],
    wrong: [
      { name: 'rune 2, 2 damage, strikes the 5-hp 5-gon of boss 1, blow 4', expect: 'lost', at: 3, blow: [1, 122, 450] },
      { name: 'rune 6, 3 damage, strikes the 5-hp 4-gon of boss 1, blow 9', expect: 'not-won', at: 8, blow: [5, 122, 450] },
      { name: 'rune 2, 3 damage, strikes the 4-hp 5-gon of boss 1, blow 14', expect: 'not-won', at: 13, blow: [1, 122, 450] },
      { name: 'rune 1, 4 damage, strikes the 4-hp 8-gon of boss 2, blow 19', expect: 'not-won', at: 18, blow: [0, 278, 450] },
    ],
  },
  'major-06': {
    intended: [
      [0, 278, 450], [1, 122, 450], [2, 122, 450], [3, 278, 450], [4, 278, 450], [5, 122, 450], [1, 278, 450], [4, 278, 450],
      [0, 122, 450], [5, 122, 450], [5, 278, 450], [3, 122, 450], [3, 278, 450], [5, 278, 450], [1, 122, 450], [4, 122, 450],
      [1, 278, 450], [2, 122, 450], [3, 278, 450], [4, 278, 450],
    ],
    wrong: [
      { name: 'rune 3, 3 damage, strikes the 4-hp 4-gon of boss 2, blow 3', expect: 'lost', at: 2, blow: [2, 278, 450] },
      { name: 'rune 5, 3 damage, strikes the 5-hp 3-gon of boss 1, blow 8', expect: 'not-won', at: 7, blow: [4, 122, 450] },
      { name: 'rune 4, 3 damage, strikes the 3-hp 6-gon of boss 1, blow 13', expect: 'not-won', at: 12, blow: [3, 122, 450] },
      { name: 'rune 3, 4 damage, strikes the 6-hp 3-gon of boss 2, blow 18', expect: 'not-won', at: 17, blow: [2, 278, 450] },
    ],
  },
  'major-07': {
    gather: true,
    intended: [
      [0, 122, 450], [1, 122, 450], [2, 278, 450], [3, 122, 450], [4, 278, 450], [5, 122, 450], [2, 278, 450], [0, 122, 450],
      [5, 278, 450], [0, 278, 450], [3, 122, 450], [2, 278, 450], [0, 122, 450], [5, 278, 450], [2, 122, 450], [4, 122, 450],
      [4, 278, 450], [5, 122, 450], [3, 122, 450], [4, 122, 450], [3, 278, 450],
    ],
    wrong: [

    ],
  },
  'major-10': {
    gather: true,
    intended: [
      [0, 286, 442], [1, 114, 442], [2, 114, 442], [3, 198, 442], [4, 114, 442], [5, 198, 442], [2, 114, 442], [0, 114, 442],
      [0, 198, 442], [5, 286, 442], [4, 114, 442], [3, 198, 442], [0, 286, 442], [3, 198, 442], [2, 114, 442], [5, 198, 442],
      [4, 286, 442], [0, 114, 442], [4, 286, 442], [3, 198, 442], [3, 286, 442], [4, 114, 442], [2, 286, 442], [1, 198, 442],
    ],
    wrong: [

    ],
  },
  'major-04': {
    gather: true,
    intended: [
      [0, 286, 442], [1, 114, 442], [2, 286, 442], [2, 286, 442], [3, 286, 442], [4, 114, 442], [5, 114, 442], [0, 114, 442],
      [4, 114, 442], [2, 114, 442], [0, 286, 442], [3, 286, 442], [3, 114, 442], [2, 286, 442], [5, 286, 442], [4, 286, 442],
      [3, 286, 442], [0, 114, 442],
    ],
    wrong: [

    ],
  },
  'major-05': {
    intended: [
      [0, 286, 442], [1, 114, 442], [0, 286, 442], [2, 114, 442], [3, 286, 442], [4, 286, 442], [5, 114, 442], [4, 114, 442],
      [1, 114, 442], [0, 286, 442], [4, 286, 442], [0, 114, 442], [3, 114, 442], [4, 114, 442], [1, 286, 442], [0, 286, 442],
      [3, 114, 442], [3, 286, 442], [4, 114, 442],
    ],
    wrong: [
      { name: 'rune 6, 2 damage, strikes the 3-hp 3-gon of boss 2, blow 3', expect: 'not-won', at: 2, blow: [5, 286, 442] },
      { name: 'rune 6, 3 damage, strikes the 4-hp 3-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [5, 286, 442] },
      { name: 'rune 4, 3 damage, strikes the 6-hp 4-gon of boss 2, blow 13', expect: 'not-won', at: 12, blow: [3, 286, 442] },
      { name: 'rune 5, 4 damage, strikes the 5-hp 4-gon of boss 2, blow 18', expect: 'not-won', at: 17, blow: [4, 286, 442] },
    ],
  },
  'major-02': {
    intended: [
      [0, 122, 450], [0, 278, 450], [1, 278, 450], [2, 122, 450], [1, 122, 450], [3, 122, 450], [0, 278, 450], [4, 278, 450],
      [5, 122, 450], [2, 278, 450], [4, 122, 450], [0, 278, 450], [2, 122, 450], [0, 122, 450], [3, 122, 450], [5, 278, 450],
    ],
    wrong: [
      { name: 'rune 2, 3 damage, strikes the 5-hp 6-gon of boss 1, blow 3', expect: 'lost', at: 2, blow: [1, 122, 450] },
      { name: 'rune 5, 5 damage, strikes the 6-hp 5-gon of boss 1, blow 7', expect: 'lost', at: 6, blow: [4, 122, 450] },
      { name: 'rune 1, 4 damage, strikes the 6-hp 5-gon of boss 2, blow 10', expect: 'not-won', at: 9, blow: [0, 278, 450] },
      { name: 'rune 4, 4 damage, strikes the 5-hp 3-gon of boss 2, blow 15', expect: 'not-won', at: 14, blow: [3, 278, 450] },
    ],
  },
  'major-03': {
    intended: [
      [0, 278, 450], [1, 122, 450], [1, 278, 450], [2, 122, 450], [2, 278, 450], [3, 122, 450], [4, 122, 450], [1, 278, 450],
      [2, 122, 450], [1, 122, 450], [0, 278, 450], [5, 122, 450], [0, 122, 450], [1, 278, 450], [0, 278, 450], [5, 122, 450],
      [5, 278, 450],
    ],
    wrong: [
      { name: 'rune 2, 5 damage, strikes the 6-hp 6-gon of boss 2, blow 2', expect: 'not-won', at: 1, blow: [1, 278, 450] },
      { name: 'rune 5, 4 damage, strikes the 6-hp 4-gon of boss 2, blow 7', expect: 'not-won', at: 6, blow: [4, 278, 450] },
      { name: 'rune 2, 4 damage, strikes the 6-hp 4-gon of boss 2, blow 10', expect: 'not-won', at: 9, blow: [1, 278, 450] },
      { name: 'rune 6, 4 damage, strikes the 4-hp 4-gon of boss 2, blow 16', expect: 'not-won', at: 15, blow: [5, 278, 450] },
    ],
  },
  'major-00': {
    intended: [
      [0, 286, 442], [1, 114, 442], [0, 286, 442], [2, 114, 442], [3, 114, 442], [4, 114, 442], [1, 286, 442], [5, 114, 442],
      [3, 114, 442], [0, 114, 442], [0, 286, 442], [5, 114, 442], [3, 114, 442], [2, 286, 442],
    ],
    wrong: [
      { name: 'rune 2, 2 damage, strikes the 5-hp 4-gon of boss 1, blow 3', expect: 'lost', at: 2, blow: [1, 114, 442] },
      { name: 'rune 2, 3 damage, strikes the 5-hp 4-gon of boss 1, blow 6', expect: 'not-won', at: 5, blow: [1, 114, 442] },
      { name: 'rune 4, 4 damage, strikes the 6-hp 3-gon of boss 2, blow 9', expect: 'not-won', at: 8, blow: [3, 286, 442] },
      { name: 'rune 4, 3 damage, strikes the 4-hp 3-gon of boss 2, blow 13', expect: 'not-won', at: 12, blow: [3, 286, 442] },
    ],
  },
  'major-01': {
    intended: [
      [0, 114, 442], [1, 286, 442], [2, 114, 442], [1, 114, 442], [3, 286, 442], [4, 114, 442], [5, 286, 442], [1, 286, 442],
      [5, 114, 442], [0, 286, 442], [3, 114, 442], [3, 114, 442], [5, 286, 442], [2, 114, 442], [3, 114, 442],
    ],
    wrong: [
      { name: 'rune 5, 3 damage, strikes the 3-hp 3-gon of boss 2, blow 3', expect: 'not-won', at: 2, blow: [4, 286, 442] },
      { name: 'rune 3, 5 damage, strikes the 5-hp 3-gon of boss 2, blow 7', expect: 'lost', at: 6, blow: [2, 286, 442] },
      { name: 'rune 4, 3 damage, strikes the 6-hp 5-gon of boss 2, blow 10', expect: 'lost', at: 9, blow: [3, 286, 442] },
      { name: 'rune 4, 4 damage, strikes the 6-hp 3-gon of boss 1, blow 14', expect: 'not-won', at: 13, blow: [3, 114, 442] },
    ],
  },
  'major-12': {
    intended: [
      [0, 272, 456], [1, 128, 456], [2, 272, 456], [2, 128, 456], [0, 128, 456], [2, 272, 456], [3, 272, 456], [4, 272, 456],
      [1, 272, 456], [5, 272, 456], [2, 128, 456], [0, 272, 456], [1, 272, 456], [1, 272, 456], [2, 128, 456], [0, 128, 456],
      [0, 272, 456], [5, 272, 456], [2, 128, 456], [0, 128, 456], [5, 272, 456], [1, 272, 456], [5, 128, 456], [5, 272, 456],
      [5, 272, 456], [3, 128, 456],
    ],
    wrong: [
      { name: 'rune 2, 3 damage, strikes the 8-hp 5-gon of boss 2, blow 4', expect: 'lost', at: 3, blow: [1, 272, 456] },
      { name: 'rune 6, 5 damage, strikes the 5-hp 5-gon of boss 1, blow 11', expect: 'not-won', at: 10, blow: [5, 128, 456] },
      { name: 'rune 1, 3 damage, strikes the 3-hp 5-gon of boss 1, blow 17', expect: 'not-won', at: 16, blow: [0, 128, 456] },
      { name: 'rune 4, 3 damage, strikes the 4-hp 4-gon of boss 1, blow 24', expect: 'not-won', at: 23, blow: [3, 128, 456] },
    ],
  },
  'major-14': {
    intended: [
      [0, 200, 456], [1, 128, 484], [1, 200, 456], [2, 128, 484], [3, 272, 484], [4, 272, 484], [2, 200, 456], [5, 128, 484],
      [3, 128, 484], [0, 272, 484], [0, 200, 456], [5, 128, 484], [0, 272, 484], [2, 128, 484], [5, 200, 456], [4, 128, 484],
      [5, 272, 484], [2, 200, 456], [0, 128, 484], [4, 272, 484], [2, 272, 484], [0, 272, 484], [5, 128, 484], [4, 200, 456],
      [2, 200, 456], [4, 128, 484], [3, 128, 484], [1, 200, 456],
    ],
    wrong: [
      { name: 'rune 5, 3 damage, strikes the 6-hp 4-gon of boss 1, blow 4', expect: 'not-won', at: 3, blow: [4, 128, 484] },
      { name: 'rune 1, 4 damage, strikes the 5-hp 5-gon of boss 2, blow 10', expect: 'not-won', at: 9, blow: [0, 200, 456] },
      { name: 'rune 3, 5 damage, strikes the 7-hp 5-gon of boss 1, blow 18', expect: 'not-won', at: 17, blow: [2, 128, 484] },
      { name: 'rune 5, 3 damage, strikes the 4-hp 5-gon of boss 2, blow 26', expect: 'not-won', at: 25, blow: [4, 200, 456] },
    ],
  },
  'major-09': {
    intended: [
      [0, 200, 456], [1, 128, 484], [2, 272, 484], [3, 200, 456], [0, 200, 456], [4, 128, 484], [1, 272, 484], [5, 200, 456],
      [5, 200, 456], [0, 272, 484], [0, 128, 484], [0, 272, 484], [5, 128, 484], [1, 128, 484], [4, 200, 456], [5, 272, 484],
      [1, 200, 456], [5, 128, 484], [4, 200, 456], [1, 200, 456], [4, 200, 456], [2, 128, 484], [3, 272, 484],
    ],
    wrong: [
      { name: 'rune 1, 3 damage, strikes the 6-hp 3-gon of boss 1, blow 4', expect: 'not-won', at: 3, blow: [0, 128, 484] },
      { name: 'rune 1, 3 damage, strikes the 6-hp 6-gon of boss 1, blow 10', expect: 'not-won', at: 9, blow: [0, 128, 484] },
      { name: 'rune 3, 4 damage, strikes the 6-hp 4-gon of boss 1, blow 15', expect: 'not-won', at: 14, blow: [2, 128, 484] },
      { name: 'rune 4, 3 damage, strikes the 4-hp 4-gon of boss 1, blow 21', expect: 'not-won', at: 20, blow: [3, 128, 484] },
    ],
  },
  'major-18': {
    intended: [
      [0, 128, 484], [1, 128, 484], [2, 200, 456], [0, 272, 484], [3, 272, 484], [4, 128, 484], [5, 200, 456], [4, 200, 456],
      [3, 272, 484], [1, 200, 456], [4, 128, 484], [1, 272, 484], [4, 200, 456], [4, 200, 456], [2, 272, 484], [3, 128, 484],
      [5, 200, 456], [3, 128, 484], [1, 200, 456], [2, 272, 484], [4, 128, 484], [5, 128, 484], [1, 200, 456], [2, 128, 484],
      [4, 272, 484], [3, 272, 484], [2, 128, 484], [3, 200, 456], [3, 128, 484], [3, 200, 456], [0, 200, 456], [3, 128, 484],
    ],
    wrong: [
      { name: 'rune 6, 3 damage, strikes the 4-hp 5-gon of boss 2, blow 5', expect: 'not-won', at: 4, blow: [5, 200, 456] },
      { name: 'rune 5, 3 damage, strikes the 3-hp 6-gon of boss 1, blow 13', expect: 'not-won', at: 12, blow: [4, 128, 484] },
      { name: 'rune 4, 3 damage, strikes the 4-hp 5-gon of boss 3, blow 20', expect: 'not-won', at: 19, blow: [3, 272, 484] },
      { name: 'rune 1, 4 damage, strikes the 6-hp 4-gon of boss 1, blow 30', expect: 'not-won', at: 29, blow: [0, 128, 484] },
    ],
  },
  'major-21': {
    intended: [
      [0, 128, 484], [0, 200, 456], [1, 200, 456], [2, 272, 484], [3, 128, 484], [4, 272, 484], [5, 272, 484], [4, 200, 456],
      [0, 128, 484], [3, 272, 484], [1, 272, 484], [2, 272, 484], [4, 128, 484], [4, 200, 456], [3, 128, 484], [3, 200, 456],
      [1, 128, 484], [2, 128, 484], [4, 200, 456], [1, 200, 456], [5, 272, 484], [0, 128, 484], [2, 200, 456], [4, 200, 456],
      [3, 272, 484], [5, 200, 456], [3, 128, 484], [1, 272, 484], [2, 200, 456], [0, 128, 484], [1, 272, 484], [5, 200, 456],
      [5, 200, 456], [2, 200, 456], [2, 128, 484],
    ],
    wrong: [
      { name: 'rune 1, 2 damage, strikes the 3-hp 4-gon of boss 3, blow 5', expect: 'not-won', at: 4, blow: [0, 272, 484] },
      { name: 'rune 5, 5 damage, strikes the 5-hp 4-gon of boss 3, blow 14', expect: 'lost', at: 13, blow: [4, 272, 484] },
      { name: 'rune 3, 4 damage, strikes the 6-hp 4-gon of boss 3, blow 23', expect: 'lost', at: 22, blow: [2, 272, 484] },
      { name: 'rune 6, 4 damage, strikes the 4-hp 7-gon of boss 2, blow 31', expect: 'not-won', at: 30, blow: [5, 200, 456] },
    ],
  },
}

const cast = ([slot, x, y]: Blow, gather: boolean): ScriptStep[] => [...(gather ? [{ wait: 2 }, { gather: slot, at: { x, y } }] : []), { place: slot, at: { x, y } }, { feed: slot }, { tap: slot }]

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
