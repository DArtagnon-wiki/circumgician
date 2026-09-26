import type { GameState } from '../core/GameState'
import type { EventBus } from '../core/EventBus'
import type { Rect } from '../core/Layout'
import type { RuneSupplySystem } from './RuneSupplySystem'
import type { DragPlacementSystem } from './DragPlacementSystem'

export type GameOutcome = 'playing' | 'won' | 'lost'

// Win: no obstacles remain. Fail: obstacles remain AND the player cannot
// act — the supply strategy has nothing useful left to introduce AND the
// field has no room to place even the smallest currently-held idle rune.
// Both paths matter per design: overcommitting a large-outer-shape rune to
// an easy kill can strand both field space and miasma needed for what's left.
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

    const noSupply = !this.supplySystem.canIntroduceRune()
    const noFieldRoom = !this.dragSystem.hasRoomForSomeIdleRune(this.fieldBounds())
    if (noSupply && noFieldRoom) {
      this.outcome = 'lost'
      this.bus.emit('game:lost', undefined)
    }
  }
}
