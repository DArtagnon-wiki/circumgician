import { describe, expect, it } from 'vitest'
import { ScriptedLayerGrowthStrategy } from './ScriptedLayerGrowthStrategy'
import { RandomLayerGrowthStrategy } from './RandomLayerGrowthStrategy'
import type { GrowthContext } from './LayerGrowthStrategy'

function ctx(layerIndex: number, rng: () => number): GrowthContext {
  return { ownerId: 'test', layerIndex, rng }
}

describe('ScriptedLayerGrowthStrategy', () => {
  it('returns the authored sequence in order then null', () => {
    const strategy = new ScriptedLayerGrowthStrategy({ sequence: ['a', 'b'] })
    expect(strategy.next(ctx(0, () => 0))).toBe('a')
    expect(strategy.next(ctx(1, () => 0))).toBe('b')
    expect(strategy.next(ctx(2, () => 0))).toBeNull()
  })

  it('indexes purely by layerIndex, not call order', () => {
    const strategy = new ScriptedLayerGrowthStrategy({ sequence: ['a', 'b', 'c'] })
    expect(strategy.next(ctx(2, () => 0))).toBe('c')
    expect(strategy.next(ctx(0, () => 0))).toBe('a')
  })
})

describe('RandomLayerGrowthStrategy', () => {
  it('generates a layer when the roll succeeds (rng < continueChance)', () => {
    const strategy = new RandomLayerGrowthStrategy({ continueChance: 0.5, generate: () => 'layer' })
    expect(strategy.next(ctx(0, () => 0.1))).toBe('layer')
  })

  it('returns null when the roll fails (rng >= continueChance)', () => {
    const strategy = new RandomLayerGrowthStrategy({ continueChance: 0.5, generate: () => 'layer' })
    expect(strategy.next(ctx(0, () => 0.9))).toBeNull()
  })

  it('respects maxLayers even when the roll would otherwise succeed', () => {
    const strategy = new RandomLayerGrowthStrategy({ continueChance: 1, maxLayers: 2, generate: () => 'layer' })
    expect(strategy.next(ctx(0, () => 0))).toBe('layer')
    expect(strategy.next(ctx(1, () => 0))).toBe('layer')
    expect(strategy.next(ctx(2, () => 0))).toBeNull()
  })
})
