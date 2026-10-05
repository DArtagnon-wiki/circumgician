import { describe, expect, it } from 'vitest'
import { levelShape, pinchesOf, totalHoldOff, totalWrongHits } from './shape'
import { layer, mote, obstacle, testLevel } from './testFixtures'
import type { LevelData, MoteColor, NodeSpec, RuneLayerSpec } from './types'

const motes = (color: MoteColor, n: number) => Array.from({ length: n }, (_, i) => mote(color, 60 + i * 10, 400))
const bowls = (sides: number, ...groups: [number, NodeSpec['catch'], NodeSpec['release']][]): RuneLayerSpec => ({
  sides,
  radius: 40,
  nodes: groups.flatMap(([n, catchColor, release]) => Array.from({ length: n }, () => ({ catch: catchColor, release }))),
})

// A boss shows a three-gon of 5 hp, with another of 4 hp under it. The four-damage rune can strike
// the 5 hp now (and lose the level); the five-damage rune that fits it needs a gold, which a
// third rune makes at the other boss.
function fourAndFive(fiveNeedsGold: boolean): LevelData {
  return testLevel({
    motes: [...motes('red', 7), ...motes('blue', 4), ...motes('gold', fiveNeedsGold ? 0 : 1)],
    obstacles: [obstacle(100, 150, [3, 5], [3, 4]), obstacle(300, 150, [4, 3])],
    hand: [
      { layers: [bowls(3, [1, 'red', 'gold'], [2, 'red', 'red']), layer(4, 30, 'red')] }, // makes the gold, strikes the other boss
      { layers: [bowls(5, [1, 'gold', 'gold'], [4, 'blue', 'blue']), layer(3, 30, 'red')] }, // five damage
      { layers: [layer(4, 40, 'red'), layer(3, 30, 'red')] }, // four damage
    ],
  })
}

describe('level shape', () => {
  it('a strike that fits now and should wait is a wrong hit that holds off', () => {
    const shape = levelShape(fourAndFive(true))!
    expect(shape).not.toBeNull()
    expect(totalWrongHits(shape)).toBeGreaterThan(0)
    expect(totalHoldOff(shape)).toBeGreaterThan(0)
  })

  it('when the right rune is ready, the same wrong hit is only a wrong hit', () => {
    const shape = levelShape(fourAndFive(false))!
    expect(totalWrongHits(shape)).toBeGreaterThan(0)
    expect(totalHoldOff(shape)).toBe(0)
  })

  it('a level that cannot be won has no shape', () => {
    const level = testLevel({ motes: motes('red', 2), obstacles: [obstacle(200, 150, [3, 3])], hand: [{ layers: [layer(3, 40, 'red'), layer(3, 30, 'red')] }] })
    expect(levelShape(level)).toBeNull()
  })

  it('a pinch is where at most two futures remain, and it is earned when wrong moves lose before it', () => {
    //            depth: 0  1  2  3  4  5  6  7  8
    const shape = [1, 4, 6, 5, 1, 1, 4, 3, 1]
    const losers = [0, 0, 3, 4, 0, 0, 0, 0, 0]
    expect(pinchesOf(shape, shape, losers)).toEqual([{ from: 4, to: 5, earned: true }])
    expect(pinchesOf(shape, shape, [0, 0, 0, 0, 0, 0, 0, 0, 0])).toEqual([{ from: 4, to: 5, earned: false }])
  })
})
