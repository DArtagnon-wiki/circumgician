import type { Obstacle } from '../model/Obstacle'
import type { MiasmaPuff } from '../model/MiasmaPuff'
import { Inventory } from '../model/Inventory'
import { createRune } from '../model/Rune'
import type { LevelConfig } from '../data/levels/level1'
import { randRange } from '../utils/math'

export interface GameState {
  obstacles: Obstacle[]
  inventory: Inventory
  miasmaPuffs: MiasmaPuff[]
}

let nextId = 0
function makeId(prefix: string): string {
  nextId += 1
  return `${prefix}-${nextId}`
}

export function loadLevel(level: LevelConfig, miasmaFieldWidth: number, miasmaFieldHeight: number): GameState {
  const obstacles: Obstacle[] = level.obstacles.map((o) => ({
    id: makeId('obstacle'),
    shape: { sides: o.shape, radius: 34 },
    position: { x: o.position.x, y: o.position.y },
    hp: o.hp,
    maxHp: o.hp,
  }))

  const inventory = new Inventory(Math.max(level.initialRunes.length, 5))
  for (const pair of level.initialRunes) {
    inventory.tryAddRune(createRune(makeId('rune'), { sides: pair.inner, radius: 16 }, { sides: pair.outer, radius: 32 }))
  }

  const miasmaPuffs: MiasmaPuff[] = Array.from({ length: level.miasma.ambientCount }, () => ({
    id: makeId('puff'),
    position: { x: randRange(0, miasmaFieldWidth), y: randRange(0, miasmaFieldHeight) },
    velocity: { x: randRange(-12, 12), y: randRange(-12, 12) },
    state: 'free' as const,
  }))

  return { obstacles, inventory, miasmaPuffs }
}
