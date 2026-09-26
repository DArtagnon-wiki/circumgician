import type { Obstacle } from '../model/Obstacle'
import type { MiasmaPuff } from '../model/MiasmaPuff'
import type { MoteColor } from '../model/Color'
import { Inventory } from '../model/Inventory'
import type { LevelConfig } from '../data/levels/level1'
import type { Rect } from './Layout'
import { randRange } from '../utils/math'
import { makeId } from './id'
import type { ObstacleGrowthSystem } from '../systems/ObstacleGrowthSystem'

export interface GameState {
  obstacles: Obstacle[]
  inventory: Inventory
  miasmaPuffs: MiasmaPuff[]
}

function pickWeightedColor(weights: Partial<Record<MoteColor, number>> | undefined): MoteColor {
  if (!weights) return 'generic'
  const entries = Object.entries(weights) as [MoteColor, number][]
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  if (total <= 0) return 'generic'
  let roll = Math.random() * total
  for (const [color, w] of entries) {
    roll -= w
    if (roll <= 0) return color
  }
  return entries[entries.length - 1][0]
}

// miasmaFieldRect is in world/root space (same space as obstacle and rune
// positions) so attraction/targeting math never has to convert between spaces.
// Inventory starts empty — populating it is the active RuneSupplyStrategy's
// job (see systems/RuneSupplySystem), not this loader's.
export function loadLevel(level: LevelConfig, miasmaFieldRect: Rect, obstacleGrowth: ObstacleGrowthSystem): GameState {
  const obstacles: Obstacle[] = level.obstacles.map((o) => {
    const id = makeId('obstacle')
    obstacleGrowth.register(id, o.growth)
    return {
      id,
      shape: { sides: o.shape, radius: 34 },
      position: { x: o.position.x, y: o.position.y },
      hp: o.hp,
      maxHp: o.hp,
      layerIndex: 0,
    }
  })

  const inventory = new Inventory(level.inventoryCapacity)

  const miasmaPuffs: MiasmaPuff[] = Array.from({ length: level.miasma.ambientCount }, () => ({
    id: makeId('puff'),
    position: {
      x: miasmaFieldRect.x + randRange(0, miasmaFieldRect.width),
      y: miasmaFieldRect.y + randRange(0, miasmaFieldRect.height),
    },
    velocity: { x: randRange(-12, 12), y: randRange(-12, 12) },
    state: 'free' as const,
    color: pickWeightedColor(level.miasma.colorWeights),
  }))

  return { obstacles, inventory, miasmaPuffs }
}
