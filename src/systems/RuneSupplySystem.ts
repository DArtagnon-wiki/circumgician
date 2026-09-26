import type { GameState } from '../core/GameState'
import type { EventBus } from '../core/EventBus'
import type { LevelConfig } from '../data/levels/level1'
import type { RuneSupplyStrategy, SupplyContext } from '../supply/RuneSupplyStrategy'
import { createRune } from '../model/Rune'
import { makeId } from '../core/id'
import type { RuneGrowthSystem } from './RuneGrowthSystem'

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
    runeGrowth: RuneGrowthSystem,
    rng: () => number = Math.random,
  ) {
    this.strategy = strategy
    this.ctx = {
      state,
      level,
      bus,
      rng,
      addRune: (template) => {
        const id = makeId('rune')
        runeGrowth.register(id, template.centerGrowth)
        // layerIndex 0 = the rune's initial center; later promotions ask for
        // layerIndex 1, 2, ... via rune.centerLayerIndex.
        const center = runeGrowth.nextCenter(id, 0)
        const insightLevel = template.insightLevel ?? level.defaultInsightLevel
        const rune = createRune(id, template.outer, template.middle, center, insightLevel)
        rune.centerLayerIndex = 1

        const placed = state.inventory.tryAddRune(rune)
        if (placed) {
          bus.emit('rune:added', { rune: placed })
        } else {
          runeGrowth.unregister(id) // placement failed (inventory full) — don't leak a registered strategy
        }
        return placed
      },
    }

    bus.on('rune:depleted', ({ rune }) => this.strategy.onRuneDepleted?.(rune, this.ctx))
    bus.on('rune:detonated', ({ rune }) => this.strategy.onRuneStepDetonated?.(rune, this.ctx))
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
