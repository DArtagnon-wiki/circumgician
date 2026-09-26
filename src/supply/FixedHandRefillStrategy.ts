import type { RuneSupplyStrategy, SupplyContext, RuneShapePair } from './RuneSupplyStrategy'
import type { Rune } from '../model/Rune'
import { availablePool, pickRandom } from './pool'

export interface FixedHandRefillParams {
  pool: RuneShapePair[]
}

// Fills every inventory slot at level start; whenever a rune detonates
// (freeing its slot), draws one new random rune from the pool to refill it.
export class FixedHandRefillStrategy implements RuneSupplyStrategy {
  private params: FixedHandRefillParams

  constructor(params: FixedHandRefillParams) {
    this.params = params
  }

  initialize(ctx: SupplyContext): void {
    this.refill(ctx)
  }

  onRuneDetonated(_rune: Rune, ctx: SupplyContext): void {
    this.refill(ctx)
  }

  canIntroduceRune(ctx: SupplyContext): boolean {
    return availablePool(this.params.pool, ctx.state).length > 0
  }

  private refill(ctx: SupplyContext): void {
    while (!ctx.state.inventory.isFull()) {
      const pair = pickRandom(availablePool(this.params.pool, ctx.state), ctx.rng)
      if (!pair || !ctx.addRune(pair)) break
    }
  }
}
