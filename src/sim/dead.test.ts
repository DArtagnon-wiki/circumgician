import { describe, expect, it } from 'vitest'
import { deadLayers, decoyLayers, layerUses } from './dead'
import { layer, mote, obstacle, testLevel } from './testFixtures'
import type { MoteColor } from './types'

const motes = (color: MoteColor, n: number) => Array.from({ length: n }, (_, i) => mote(color, 60 + i * 10, 400))

describe('dead layers', () => {
  it('finds a layer whose shape is never on top and one whose color never comes', () => {
    const level = testLevel({
      motes: motes('red', 6),
      obstacles: [obstacle(200, 150, [3, 3])],
      hand: [
        { layers: [layer(3, 40, 'red'), layer(3, 30, 'red')] }, // strikes the triangle on top
        { layers: [layer(3, 40, 'red'), layer(6, 30, 'red')] }, // would strike a hexagon: there is none
        { layers: [layer(3, 40, 'blue'), layer(3, 30, 'red')] }, // blue never comes
      ],
    })
    expect(deadLayers(level)).toEqual([
      { rune: 1, layer: 0 },
      { rune: 2, layer: 0 },
    ])
  })

  it('a layer fired at nothing is alive when the level cannot be won without it', () => {
    const level = testLevel({
      motes: motes('red', 3),
      obstacles: [obstacle(200, 150, [3, 3])],
      hand: [
        { layers: [layer(3, 40, 'red', 'blue'), layer(6, 30, 'red')] }, // turns red into blue, striking nothing
        { layers: [layer(3, 40, 'blue'), layer(3, 30, 'red')] }, // strikes the triangle, but only with blue
      ],
    })
    expect(deadLayers(level)).toEqual([])
  })

  it('a layer that can only go into stasis for a two-shape layer is alive', () => {
    const level = testLevel({
      motes: [...motes('red', 4), ...motes('blue', 3)],
      obstacles: [{ x: 200, y: 150, layers: [{ sides: 3, pair: 4, radius: 30, hp: 6 }] }],
      hand: [
        { layers: [layer(4, 40, 'red'), layer(3, 36, 'red')] },
        { layers: [layer(3, 40, 'blue'), layer(4, 36, 'blue')] },
      ],
    })
    expect(deadLayers(level)).toEqual([])
  })

  it('tells a decoy (strikes, but only in lines that lose) from a layer on a winning line', () => {
    const level = testLevel({
      motes: motes('red', 3),
      obstacles: [obstacle(200, 150, [3, 3], [4, 3])],
      hand: [
        { layers: [layer(3, 40, 'red'), layer(3, 30, 'red')] }, // strikes the triangle
        { layers: [layer(3, 40, 'red'), layer(4, 30, 'red')] }, // strikes the square under it
        { layers: [layer(3, 40, 'red', 'blue'), layer(3, 30, 'red')] }, // strikes the triangle too, and turns the reds blue
      ],
    })
    expect([...layerUses(level)]).toEqual([
      ['0.0', 'route'],
      ['1.0', 'route'],
      ['2.0', 'trap'],
    ])
    expect(deadLayers(level)).toEqual([])
    expect(decoyLayers(level)).toEqual([{ rune: 2, layer: 0 }])
  })
})
