import type { RuneSupplyStrategy, SupplyContext, RuneTemplate } from './RuneSupplyStrategy'
import type { Rune } from '../model/Rune'
import { availablePool, pickRandom } from './pool'

export interface FixedHandRefillParams {
  pool: RuneTemplate[]
}

// Fills every inventory slot at level start; whenever a rune is truly
// depleted (its final promotion had no center), draws one new random rune
// from the pool to refill that slot.
export class FixedHandRefillStrategy implements RuneSupplyStrategy {
  private params: FixedHandRefillParams

  constructor(params: FixedHandRefillParams) {
    this.params = params
  }

  initialize(ctx: SupplyContext): void {
    this.refill(ctx)
  }

  onRuneDepleted(_rune: Rune, ctx: SupplyContext): void {
    this.refill(ctx)
  }

  canIntroduceRune(ctx: SupplyContext): boolean {
    return availablePool(this.params.pool, ctx.state).length > 0
  }

  private refill(ctx: SupplyContext): void {
    while (!ctx.state.inventory.isFull()) {
      const template = pickRandom(availablePool(this.params.pool, ctx.state), ctx.rng)
      if (!template || !ctx.addRune(template)) break
    }
  }
}
