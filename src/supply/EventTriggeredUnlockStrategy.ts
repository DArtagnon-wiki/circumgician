import type { ShapeSides } from '../core/types'
import type { RuneSupplyStrategy, SupplyContext, RuneTemplate } from './RuneSupplyStrategy'
import type { Rune } from '../model/Rune'
import type { Obstacle } from '../model/Obstacle'

export type UnlockTrigger =
  | { type: 'obstacleCleared'; shape: ShapeSides }
  | { type: 'runeDetonated'; middle: ShapeSides; outer: ShapeSides }

export interface UnlockRule {
  trigger: UnlockTrigger
  unlocks: RuneTemplate[]
}

export interface EventTriggeredUnlockParams {
  initial: RuneTemplate[]
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
    for (const template of this.params.initial) {
      if (ctx.state.inventory.isFull()) break
      ctx.addRune(template)
    }
  }

  onObstacleCleared(obstacle: Obstacle, ctx: SupplyContext): void {
    for (const rule of this.params.rules) {
      if (rule.trigger.type === 'obstacleCleared' && rule.trigger.shape === obstacle.shape.sides) {
        this.grant(rule.unlocks, ctx)
      }
    }
  }

  // Fires on every detonation cycle with the rune still in its
  // pre-promotion state, so `middle`/`outer` here are exactly the pairing
  // that just went off.
  onRuneStepDetonated(rune: Rune, ctx: SupplyContext): void {
    for (const rule of this.params.rules) {
      if (
        rule.trigger.type === 'runeDetonated' &&
        rule.trigger.middle === rune.middle.shape.sides &&
        rule.trigger.outer === rune.outer.shape.sides
      ) {
        this.grant(rule.unlocks, ctx)
      }
    }
  }

  canIntroduceRune(ctx: SupplyContext): boolean {
    return !ctx.state.inventory.isFull()
  }

  private grant(unlocks: RuneTemplate[], ctx: SupplyContext): void {
    for (const template of unlocks) {
      if (ctx.state.inventory.isFull()) break
      ctx.addRune(template)
    }
  }
}
