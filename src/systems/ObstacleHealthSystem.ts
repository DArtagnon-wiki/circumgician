import type { GameState } from '../core/GameState'
import type { EventBus } from '../core/EventBus'
import type { Obstacle } from '../model/Obstacle'

// Consumes 'obstacle:damaged': removes obstacles at 0 HP and announces it via
// 'obstacle:cleared' so rendering/win-check/supply systems can react.
export class ObstacleHealthSystem {
  private state: GameState
  private bus: EventBus

  constructor(state: GameState, bus: EventBus) {
    this.state = state
    this.bus = bus
    this.bus.on('obstacle:damaged', ({ obstacle }) => this.checkDeath(obstacle))
  }

  private checkDeath(obstacle: Obstacle): void {
    if (obstacle.hp > 0) return
    this.state.obstacles = this.state.obstacles.filter((o) => o.id !== obstacle.id)
    this.bus.emit('obstacle:cleared', { obstacle })
  }
}
