import { describe, expect, it } from 'vitest'
import { createEventBus } from '../core/EventBus'
import { Inventory } from '../model/Inventory'
import { createRune, type RuneLayer } from '../model/Rune'
import type { GameState } from '../core/GameState'
import type { Obstacle } from '../model/Obstacle'
import type { LevelConfig } from '../data/levels/level1'
import type { RuneSupplyStrategy } from '../supply/RuneSupplyStrategy'
import { RuneGrowthSystem } from './RuneGrowthSystem'
import { RuneSupplySystem } from './RuneSupplySystem'
import { DragPlacementSystem } from './DragPlacementSystem'
import { WinFailSystem } from './WinFailSystem'

function layer(sides: 3 | 4 | 5 | 6): RuneLayer {
  return {
    shape: { sides, radius: 30 },
    nodeColors: Array.from({ length: sides }, () => ({ catch: 'red' as const, release: 'generic' as const })),
  }
}

function makeObstacle(sides: 3 | 4 | 5 | 6): Obstacle {
  return { id: 'obstacle-1', shape: { sides, radius: 34 }, position: { x: 0.5, y: 0.5 }, hp: 5, maxHp: 5, layerIndex: 0 }
}

const fakeLevel = { inventoryCapacity: 3 } as LevelConfig

// A strategy whose canIntroduceRune() is controlled directly by the test —
// stands in for "supply exhausted" (false) vs. "more supply available" (true).
function fakeStrategy(canIntroduce: boolean): RuneSupplyStrategy {
  return {
    initialize(): void {},
    canIntroduceRune: () => canIntroduce,
  }
}

function makeSystems(state: GameState, canIntroduce: boolean) {
  const bus = createEventBus()
  const runeGrowth = new RuneGrowthSystem()
  const supplySystem = new RuneSupplySystem(state, fakeLevel, bus, fakeStrategy(canIntroduce), runeGrowth)
  const dragSystem = new DragPlacementSystem(state, bus, (id) => (id === 'obstacle-1' ? { x: 0.5, y: 0.5 } : undefined))
  const bounds = { x: 0, y: 0, width: 400, height: 300 }
  const winFail = new WinFailSystem(state, bus, supplySystem, dragSystem, () => bounds)
  return { bus, winFail }
}

describe('WinFailSystem.canStillProgress (regression: the "stuck but never lost" bug)', () => {
  it('declares a loss when an obstacle remains, supply is exhausted, and inventory has zero idle/viable-active runes', () => {
    // Reproduces the reported screenshot: one obstacle left, no rune anywhere
    // in play (all slots empty — e.g. mid-refill after the supply pool
    // stopped matching this shape), no more supply coming. Before the fix,
    // hasRoomForSomeIdleRune() vacuously returned true whenever idleRunes
    // was empty, so this state was never detected as a loss.
    const obstacle = makeObstacle(6)
    const state: GameState = { obstacles: [obstacle], inventory: new Inventory(3), miasmaPuffs: [] }
    const { winFail } = makeSystems(state, false)

    winFail.update()

    expect(winFail.outcome).toBe('lost')
  })

  it('does NOT declare a loss when an active rune is still linked to a remaining obstacle', () => {
    const obstacle = makeObstacle(6)
    const inventory = new Inventory(3)
    const rune = createRune('rune-1', layer(4), layer(6), null, 'full')
    rune.state = 'active'
    rune.linkedObstacleId = obstacle.id
    rune.fieldPosition = { x: 0, y: 0 }
    inventory.tryAddRune(rune)
    const state: GameState = { obstacles: [obstacle], inventory, miasmaPuffs: [] }
    const { winFail } = makeSystems(state, false)

    winFail.update()

    expect(winFail.outcome).toBe('playing')
  })

  it('does NOT declare a loss when an active-but-unlinked rune could still match a remaining obstacle', () => {
    const obstacle = makeObstacle(6)
    const inventory = new Inventory(3)
    const rune = createRune('rune-1', layer(4), layer(6), null, 'full') // middle matches obstacle shape
    rune.state = 'active'
    rune.linkedObstacleId = null
    rune.fieldPosition = { x: 0, y: 0 }
    inventory.tryAddRune(rune)
    const state: GameState = { obstacles: [obstacle], inventory, miasmaPuffs: [] }
    const { winFail } = makeSystems(state, false)

    winFail.update()

    expect(winFail.outcome).toBe('playing')
  })

  it('DOES declare a loss when the only active rune can never match any remaining obstacle, even though it is technically "in play"', () => {
    const obstacle = makeObstacle(6)
    const inventory = new Inventory(3)
    const rune = createRune('rune-1', layer(4), layer(3), null, 'full') // middle=3, obstacle=6 — can never link
    rune.state = 'active'
    rune.linkedObstacleId = null
    rune.fieldPosition = { x: 0, y: 0 }
    inventory.tryAddRune(rune)
    const state: GameState = { obstacles: [obstacle], inventory, miasmaPuffs: [] }
    const { winFail } = makeSystems(state, false)

    winFail.update()

    expect(winFail.outcome).toBe('lost')
  })

  it('does NOT declare a loss while more supply can still be introduced', () => {
    const obstacle = makeObstacle(6)
    const state: GameState = { obstacles: [obstacle], inventory: new Inventory(3), miasmaPuffs: [] }
    const { winFail } = makeSystems(state, true)

    winFail.update()

    expect(winFail.outcome).toBe('playing')
  })
})
