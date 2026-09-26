import type { ShapeSides } from '../core/types'
import type { RuneSupplyStrategy, SupplyContext, RuneShapePair } from './RuneSupplyStrategy'
import type { Rune } from '../model/Rune'
import type { Obstacle } from '../model/Obstacle'

export type UnlockTrigger =
  | { type: 'obstacleCleared'; shape: ShapeSides }
  | { type: 'runeDetonated'; inner: ShapeSides; outer: ShapeSides }

export interface UnlockRule {
  trigger: UnlockTrigger
  unlocks: RuneShapePair[]
}

export interface EventTriggeredUnlockParams {
  initial: RuneShapePair[]
  rules: UnlockRule[]
}

// One config-driven class covers both "clearing an obstacle unlocks a rune"
// and "detonating a rune unlocks a gated rune" — same event-to-unlock shape,
// so a third trigger type later is just a new config entry, not a new class.
export class EventTriggeredUnlockStrategy implements RuneSupplyStrategy {
  private params: EventTriggeredUnlockParams

  constructor(params: EventTriggeredUnlockParams) {
    this.params = params
  }

  initialize(ctx: SupplyContext): void {
    for (const pair of this.params.initial) {
      if (ctx.state.inventory.isFull()) break
      ctx.addRune(pair)
    }
  }

  onObstacleCleared(obstacle: Obstacle, ctx: SupplyContext): void {
    for (const rule of this.params.rules) {
      if (rule.trigger.type === 'obstacleCleared' && rule.trigger.shape === obstacle.shape.sides) {
        this.grant(rule.unlocks, ctx)
      }
    }
  }

  onRuneDetonated(rune: Rune, ctx: SupplyContext): void {
    for (const rule of this.params.rules) {
      if (
        rule.trigger.type === 'runeDetonated' &&
        rule.trigger.inner === rune.inner.sides &&
        rule.trigger.outer === rune.outer.sides
      ) {
        this.grant(rule.unlocks, ctx)
      }
    }
  }

  canIntroduceRune(ctx: SupplyContext): boolean {
    return !ctx.state.inventory.isFull()
  }

  private grant(unlocks: RuneShapePair[], ctx: SupplyContext): void {
    for (const pair of unlocks) {
      if (ctx.state.inventory.isFull()) break
      ctx.addRune(pair)
    }
  }
}
