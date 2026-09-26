import { describe, expect, it } from 'vitest'
import { createEventBus } from '../core/EventBus'
import { Inventory } from '../model/Inventory'
import { createRune, type RuneLayer } from '../model/Rune'
import type { GameState } from '../core/GameState'
import type { Obstacle } from '../model/Obstacle'
import type { MiasmaPuff } from '../model/MiasmaPuff'
import { RuneGrowthSystem } from './RuneGrowthSystem'
import { DetonationSystem } from './DetonationSystem'

function layer(sides: 3 | 4 | 5 | 6, catchColor: 'red' | 'blue' = 'red', release: 'generic' | 'red' | 'annihilating' = 'generic'): RuneLayer {
  return {
    shape: { sides, radius: 30 },
    nodeColors: Array.from({ length: sides }, () => ({ catch: catchColor, release })),
  }
}

function makeState(): { state: GameState; obstacle: Obstacle } {
  const obstacle: Obstacle = {
    id: 'obstacle-1',
    shape: { sides: 3, radius: 34 },
    position: { x: 0.5, y: 0.5 },
    hp: 3,
    maxHp: 3,
    layerIndex: 0,
  }
  const inventory = new Inventory(3)
  const state: GameState = { obstacles: [obstacle], inventory, miasmaPuffs: [] }
  return { state, obstacle }
}

function fillOuterWithPuffs(state: GameState, runeId: string, outer: RuneLayer, release: ('generic' | 'annihilating')[]): void {
  const rune = state.inventory.slots.find((r) => r?.id === runeId)!
  outer.nodeColors.forEach((_, i) => {
    const puffId = `puff-${runeId}-${i}`
    const puff: MiasmaPuff = {
      id: puffId,
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      state: 'consumed',
      color: 'generic',
    }
    state.miasmaPuffs.push(puff)
    rune.nodes[i].filled = true
    rune.nodes[i].puffId = puffId
    rune.outer.nodeColors[i].release = release[i]
  })
}

describe('DetonationSystem promotion/depletion/annihilation', () => {
  it('promotes in place when a center exists: damages obstacle, releases non-annihilating motes, keeps the slot', () => {
    const { state, obstacle } = makeState()
    const bus = createEventBus()
    const runeGrowth = new RuneGrowthSystem()
    new DetonationSystem(state, bus, () => ({ x: 0, y: 0, width: 100, height: 100 }), runeGrowth, () => ({ x: 0.5, y: 0.5 }))

    const outer = layer(4)
    const middle = layer(3) // matches the obstacle's shape
    const center = layer(5)
    const rune = createRune('rune-1', outer, middle, center, 'full')
    rune.linkedObstacleId = obstacle.id
    rune.fieldPosition = { x: 0, y: 0 }
    rune.state = 'active'
    state.inventory.tryAddRune(rune)
    runeGrowth.register('rune-1', { type: 'none' }) // center already set directly above; growth only matters for the NEXT roll

    fillOuterWithPuffs(state, 'rune-1', outer, ['generic', 'generic', 'annihilating', 'generic'])

    let promoted = false
    bus.on('rune:promoted', () => (promoted = true))
    let depleted = false
    bus.on('rune:depleted', () => (depleted = true))
    const annihilatedIds: string[] = []
    bus.on('miasma:annihilated', ({ puffIds }) => annihilatedIds.push(...puffIds))

    bus.emit('rune:ready', { rune })

    expect(obstacle.hp).toBe(0) // outer had 4 sides -> 4 damage against 3 hp
    expect(promoted).toBe(true)
    expect(depleted).toBe(false)

    // The rune object itself was promoted in place, same id, same array slot.
    const stillThere = state.inventory.slots.find((r) => r?.id === 'rune-1')
    expect(stillThere).toBeDefined()
    expect(stillThere!.outer.shape.sides).toBe(3) // old middle promoted to outer
    expect(stillThere!.middle.shape.sides).toBe(5) // old center promoted to middle
    expect(stillThere!.nodes.every((n) => !n.filled)).toBe(true) // fresh nodes

    // 3 non-annihilating puffs freed back to the field, 1 destroyed.
    expect(annihilatedIds).toHaveLength(1)
    const freed = state.miasmaPuffs.filter((p) => p.state === 'free')
    expect(freed).toHaveLength(3)
    expect(state.miasmaPuffs.find((p) => annihilatedIds.includes(p.id))).toBeUndefined()
  })

  it('depletes (removes from inventory) when there is no center to promote', () => {
    const { state, obstacle } = makeState()
    const bus = createEventBus()
    const runeGrowth = new RuneGrowthSystem()
    new DetonationSystem(state, bus, () => ({ x: 0, y: 0, width: 100, height: 100 }), runeGrowth, () => undefined)

    const outer = layer(3)
    const middle = layer(3)
    const rune = createRune('rune-2', outer, middle, null, 'none') // no center at all
    rune.linkedObstacleId = obstacle.id
    rune.state = 'active'
    state.inventory.tryAddRune(rune)
    runeGrowth.register('rune-2', { type: 'none' })

    fillOuterWithPuffs(state, 'rune-2', outer, ['generic', 'generic', 'generic'])

    let depleted = false
    bus.on('rune:depleted', () => (depleted = true))

    bus.emit('rune:ready', { rune })

    expect(depleted).toBe(true)
    expect(state.inventory.slots.find((r) => r?.id === 'rune-2')).toBeUndefined()
  })
})
