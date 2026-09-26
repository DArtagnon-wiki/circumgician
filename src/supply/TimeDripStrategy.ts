import type { RuneSupplyStrategy, SupplyContext, RuneShapePair } from './RuneSupplyStrategy'
import { availablePool, pickRandom } from './pool'

export interface TimeDripParams {
  pool: RuneShapePair[]
  intervalSeconds: number
}

// Drips a new random rune into the first open slot on a fixed timer,
// independent of anything the player does.
export class TimeDripStrategy implements RuneSupplyStrategy {
  private params: TimeDripParams
  private timer = 0

  constructor(params: TimeDripParams) {
    this.params = params
  }

  initialize(): void {
    this.timer = 0
  }

  update(dt: number, ctx: SupplyContext): void {
    this.timer += dt
    if (this.timer < this.params.intervalSeconds) return
    this.timer = 0
    if (ctx.state.inventory.isFull()) return
    const pair = pickRandom(availablePool(this.params.pool, ctx.state), ctx.rng)
    if (pair) ctx.addRune(pair)
  }

  canIntroduceRune(ctx: SupplyContext): boolean {
    return availablePool(this.params.pool, ctx.state).length > 0
  }
}
