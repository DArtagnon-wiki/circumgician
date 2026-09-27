import type { GameState } from '../core/GameState'
import type { EventBus } from '../core/EventBus'
import type { Rect } from '../core/Layout'
import type { RuneSupplySystem } from './RuneSupplySystem'
import type { DragPlacementSystem } from './DragPlacementSystem'

export type GameOutcome = 'playing' | 'won' | 'lost'

// Win: no obstacles remain. Fail: obstacles remain AND the player has no
// possible way to still make progress — see canStillProgress(). This must
// check every path, not just "is anything idle waiting": an inventory full
// of active-but-unmatched runes (or completely empty, mid-refill) has zero
// idle runes, which used to be misread as "not stuck" (see git history —
// a real screenshot of a permanently stuck board that never triggered a
// loss led to this rewrite).
export class WinFailSystem {
  private state: GameState
  private bus: EventBus
  private supplySystem: RuneSupplySystem
  private dragSystem: DragPlacementSystem
  private fieldBounds: () => Rect
  outcome: GameOutcome = 'playing'

  constructor(
    state: GameState,
    bus: EventBus,
    supplySystem: RuneSupplySystem,
    dragSystem: DragPlacementSystem,
    fieldBounds: () => Rect,
  ) {
    this.state = state
    this.bus = bus
    this.supplySystem = supplySystem
    this.dragSystem = dragSystem
    this.fieldBounds = fieldBounds
  }

  update(): void {
    if (this.outcome !== 'playing') return

    if (this.state.obstacles.length === 0) {
      this.outcome = 'won'
      this.bus.emit('game:won', undefined)
      return
    }

    if (this.canStillProgress()) return

    this.outcome = 'lost'
    this.bus.emit('game:lost', undefined)
  }

  // True if there is ANY remaining path to progress: more supply might
  // arrive, an idle rune could still be placed, or an active rune could
  // still eventually damage something (already linked, or unlinked but its
  // middle shape matches a remaining obstacle and could still pick up a
  // link — see ObstacleHealthSystem.refreshLinks / DetonationSystem.relink).
  private canStillProgress(): boolean {
    if (this.supplySystem.canIntroduceRune()) return true
    if (this.dragSystem.hasRoomForSomeIdleRune(this.fieldBounds())) return true

    for (const rune of this.state.inventory.slots) {
      if (!rune || rune.state !== 'active') continue
      if (rune.linkedObstacleId && this.state.obstacles.some((o) => o.id === rune.linkedObstacleId)) return true
      if (this.state.obstacles.some((o) => o.shape.sides === rune.middle.shape.sides)) return true
    }
    return false
  }
}
