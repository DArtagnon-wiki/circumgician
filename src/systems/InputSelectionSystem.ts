import type { GameState } from '../core/GameState'
import type { EventBus } from '../core/EventBus'
import type { Rune } from '../model/Rune'
import type { Id, Vec2 } from '../core/types'

// Tap-to-select: the rune's inner shape auto-snaps to the nearest obstacle
// sharing its shape, measured from the rune's own screen position (its
// inventory slot) since the rune has no field position of its own yet.
export class InputSelectionSystem {
  private state: GameState
  private bus: EventBus
  private getPosition: (id: Id) => Vec2 | undefined

  constructor(state: GameState, bus: EventBus, getPosition: (id: Id) => Vec2 | undefined) {
    this.state = state
    this.bus = bus
    this.getPosition = getPosition
  }

  trySelect(rune: Rune): void {
    if (rune.state !== 'idle') return

    const runePos = this.getPosition(rune.id)
    if (!runePos) return

    const candidates = this.state.obstacles.filter((o) => o.shape.sides === rune.inner.sides)
    if (candidates.length === 0) return

    let nearest = candidates[0]
    let nearestDistSq = Infinity
    for (const obstacle of candidates) {
      const pos = this.getPosition(obstacle.id)
      if (!pos) continue
      const dx = pos.x - runePos.x
      const dy = pos.y - runePos.y
      const distSq = dx * dx + dy * dy
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq
        nearest = obstacle
      }
    }

    rune.state = 'active'
    rune.linkedObstacleId = nearest.id
    this.bus.emit('rune:activated', { rune, obstacle: nearest })
  }
}
