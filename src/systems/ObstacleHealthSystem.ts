import type { GameState } from '../core/GameState'
import type { EventBus } from '../core/EventBus'
import type { Obstacle } from '../model/Obstacle'
import type { ObstacleGrowthSystem } from './ObstacleGrowthSystem'

// Consumes 'obstacle:damaged': on 0 HP, asks the obstacle's growth strategy
// for the next layer. A layer exists -> promote in place (fresh HP, bumped
// layerIndex) and announce 'obstacle:layerPromoted'. No layer -> remove and
// announce 'obstacle:cleared' exactly as before this rework.
export class ObstacleHealthSystem {
  private state: GameState
  private bus: EventBus
  private growth: ObstacleGrowthSystem

  constructor(state: GameState, bus: EventBus, growth: ObstacleGrowthSystem) {
    this.state = state
    this.bus = bus
    this.growth = growth
    this.bus.on('obstacle:damaged', ({ obstacle }) => this.checkCollapse(obstacle))
  }

  private checkCollapse(obstacle: Obstacle): void {
    if (obstacle.hp > 0) return

    const next = this.growth.nextLayer(obstacle.id, obstacle.layerIndex)
    if (next) {
      const previousShape = obstacle.shape
      obstacle.shape = next.shape
      obstacle.hp = next.hp
      obstacle.maxHp = next.hp
      obstacle.layerIndex += 1
      this.invalidateStaleLinks(obstacle)
      this.bus.emit('obstacle:layerPromoted', { obstacle, previousShape })
      return
    }

    this.growth.unregister(obstacle.id)
    this.state.obstacles = this.state.obstacles.filter((o) => o.id !== obstacle.id)
    this.bus.emit('obstacle:cleared', { obstacle })
  }

  // A rune already linked to this obstacle whose middle shape no longer
  // matches the newly-revealed layer would otherwise keep damaging a shape
  // it was never matched to — drop the link instead (mirrors the existing
  // graceful no-op DetonationSystem already does when a linked obstacle is
  // simply gone).
  private invalidateStaleLinks(obstacle: Obstacle): void {
    for (const rune of this.state.inventory.slots) {
      if (!rune || rune.linkedObstacleId !== obstacle.id) continue
      if (rune.middle.shape.sides !== obstacle.shape.sides) {
        rune.linkedObstacleId = null
      }
    }
  }
}
