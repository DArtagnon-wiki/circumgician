import type { GameState } from '../core/GameState'
import type { EventBus } from '../core/EventBus'
import type { LevelConfig } from '../data/levels/level1'
import type { RuneSupplyStrategy, SupplyContext } from '../supply/RuneSupplyStrategy'
import { createRune } from '../model/Rune'
import { radiusForSides } from '../model/Polygon'
import { makeId } from '../core/id'

// Thin adapter: wires the active strategy's optional hooks to the bus and
// gives it one write path (ctx.addRune) into the inventory. Swapping a
// level's progression model is just passing a different strategy in.
export class RuneSupplySystem {
  private ctx: SupplyContext
  private strategy: RuneSupplyStrategy

  constructor(
    state: GameState,
    level: LevelConfig,
    bus: EventBus,
    strategy: RuneSupplyStrategy,
    rng: () => number = Math.random,
  ) {
    this.strategy = strategy
    this.ctx = {
      state,
      level,
      bus,
      rng,
      addRune: (pair) => {
        const outerRadius = radiusForSides(pair.outer)
        const rune = createRune(
          makeId('rune'),
          { sides: pair.inner, radius: outerRadius * 0.5 },
          { sides: pair.outer, radius: outerRadius },
        )
        const placed = state.inventory.tryAddRune(rune)
        if (placed) bus.emit('rune:added', { rune: placed })
        return placed
      },
    }

    bus.on('rune:detonated', ({ rune }) => this.strategy.onRuneDetonated?.(rune, this.ctx))
    bus.on('obstacle:cleared', ({ obstacle }) => this.strategy.onObstacleCleared?.(obstacle, this.ctx))
    this.strategy.initialize(this.ctx)
  }

  update(dt: number): void {
    this.strategy.update?.(dt, this.ctx)
  }

  canIntroduceRune(): boolean {
    return this.strategy.canIntroduceRune(this.ctx)
  }
}
