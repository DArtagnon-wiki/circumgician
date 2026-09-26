import type { GameState } from '../core/GameState'
import type { EventBus } from '../core/EventBus'
import type { Obstacle } from '../model/Obstacle'
import type { Id, Vec2 } from '../core/types'
import type { ObstacleGrowthSystem } from './ObstacleGrowthSystem'
import { findNearestObstacleByShape } from './matching'

// Consumes 'obstacle:damaged': on 0 HP, asks the obstacle's growth strategy
// for the next layer. A layer exists -> promote in place (fresh HP, bumped
// layerIndex) and announce 'obstacle:layerPromoted'. No layer -> remove and
// announce 'obstacle:cleared' exactly as before this rework.
export class ObstacleHealthSystem {
  private state: GameState
  private bus: EventBus
  private growth: ObstacleGrowthSystem
  private getObstaclePosition: (id: Id) => Vec2 | undefined

  constructor(state: GameState, bus: EventBus, growth: ObstacleGrowthSystem, getObstaclePosition: (id: Id) => Vec2 | undefined) {
    this.state = state
    this.bus = bus
    this.growth = growth
    this.getObstaclePosition = getObstaclePosition
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
      this.refreshLinks()
      this.bus.emit('obstacle:layerPromoted', { obstacle, previousShape })
      return
    }

    this.growth.unregister(obstacle.id)
    this.state.obstacles = this.state.obstacles.filter((o) => o.id !== obstacle.id)
    this.refreshLinks()
    this.bus.emit('obstacle:cleared', { obstacle })
  }

  // Whenever the obstacle set changes shape at all (a promotion or a full
  // clear), every active rune gets a chance to re-evaluate its link: drop
  // one that's gone stale (mirrors the graceful no-op DetonationSystem
  // already does when a linked obstacle is simply gone), and — since a rune
  // can now be placed with no link at all — also try to ACQUIRE a link for
  // any active-but-unlinked rune against whatever obstacles remain. Without
  // this, an unlinked rune would only ever get a chance to link on its own
  // next detonation (DetonationSystem.relink), which could be a long wait.
  private refreshLinks(): void {
    for (const rune of this.state.inventory.slots) {
      if (!rune || rune.state !== 'active' || !rune.fieldPosition) continue

      if (rune.linkedObstacleId) {
        const linked = this.state.obstacles.find((o) => o.id === rune.linkedObstacleId)
        if (linked && rune.middle.shape.sides === linked.shape.sides) continue // still valid
        rune.linkedObstacleId = null
      }

      const match = findNearestObstacleByShape(this.state.obstacles, rune.middle.shape.sides, rune.fieldPosition, this.getObstaclePosition)
      if (match) rune.linkedObstacleId = match.id
    }
  }
}
