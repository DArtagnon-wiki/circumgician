import type { Obstacle } from '../model/Obstacle'
import type { MiasmaPuff } from '../model/MiasmaPuff'
import { Inventory } from '../model/Inventory'
import type { LevelConfig } from '../data/levels/level1'
import type { Rect } from './Layout'
import { randRange } from '../utils/math'
import { makeId } from './id'

export interface GameState {
  obstacles: Obstacle[]
  inventory: Inventory
  miasmaPuffs: MiasmaPuff[]
}

// miasmaFieldRect is in world/root space (same space as obstacle and rune
// positions) so attraction/targeting math never has to convert between spaces.
// Inventory starts empty — populating it is the active RuneSupplyStrategy's
// job (see systems/RuneSupplySystem), not this loader's.
export function loadLevel(level: LevelConfig, miasmaFieldRect: Rect): GameState {
  const obstacles: Obstacle[] = level.obstacles.map((o) => ({
    id: makeId('obstacle'),
    shape: { sides: o.shape, radius: 34 },
    position: { x: o.position.x, y: o.position.y },
    hp: o.hp,
    maxHp: o.hp,
  }))

  const inventory = new Inventory(level.inventoryCapacity)

  const miasmaPuffs: MiasmaPuff[] = Array.from({ length: level.miasma.ambientCount }, () => ({
    id: makeId('puff'),
    position: {
      x: miasmaFieldRect.x + randRange(0, miasmaFieldRect.width),
      y: miasmaFieldRect.y + randRange(0, miasmaFieldRect.height),
    },
    velocity: { x: randRange(-12, 12), y: randRange(-12, 12) },
    state: 'free' as const,
  }))

  return { obstacles, inventory, miasmaPuffs }
}
