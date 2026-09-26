import type { GameState } from '../core/GameState'
import type { EventBus } from '../core/EventBus'
import type { Rect } from '../core/Layout'
import type { Rune } from '../model/Rune'
import { runeDamage } from '../model/Rune'
import { randRange } from '../utils/math'

// Consumes 'rune:ready': resolves damage against the linked obstacle, scatters
// the rune's spent miasma back into the field, and resets the rune to idle.
// Obstacle death/removal is ObstacleHealthSystem's job (it listens separately
// to 'obstacle:damaged') so obstacle lifecycle stays decoupled from combat math —
// future obstacle variety (shields, delayed death, etc.) hooks in there instead.
export class DetonationSystem {
  private state: GameState
  private bus: EventBus
  private fieldBounds: () => Rect

  constructor(state: GameState, bus: EventBus, fieldBounds: () => Rect) {
    this.state = state
    this.bus = bus
    this.fieldBounds = fieldBounds
    this.bus.on('rune:ready', ({ rune }) => this.detonate(rune))
  }

  private detonate(rune: Rune): void {
    const obstacle = this.state.obstacles.find((o) => o.id === rune.linkedObstacleId)
    if (obstacle) {
      const damage = runeDamage(rune)
      obstacle.hp = Math.max(0, obstacle.hp - damage)
      this.bus.emit('obstacle:damaged', { obstacle, damage })
    }

    this.scatterConsumedPuffs(rune)
    this.resetRune(rune)
    this.bus.emit('rune:detonated', { rune })
  }

  private scatterConsumedPuffs(rune: Rune): void {
    const bounds = this.fieldBounds()
    for (const node of rune.nodes) {
      if (!node.puffId) continue
      const puff = this.state.miasmaPuffs.find((p) => p.id === node.puffId)
      if (!puff) continue
      puff.state = 'free'
      puff.targetRuneId = undefined
      puff.targetNodeIndex = undefined
      puff.position.x = bounds.x + randRange(0, bounds.width)
      puff.position.y = bounds.y + randRange(0, bounds.height)
      puff.velocity.x = randRange(-12, 12)
      puff.velocity.y = randRange(-12, 12)
    }
  }

  private resetRune(rune: Rune): void {
    rune.state = 'idle'
    rune.linkedObstacleId = null
    for (const node of rune.nodes) {
      node.filled = false
      node.puffId = null
    }
  }
}
