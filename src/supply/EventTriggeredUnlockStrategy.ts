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
  private grantedInitialCount = 0

  constructor(params: EventTriggeredUnlockParams) {
    this.params = params
  }

  initialize(ctx: SupplyContext): void {
    for (const template of this.params.initial) {
      if (ctx.state.inventory.isFull()) break
      if (ctx.addRune(template)) this.grantedInitialCount += 1
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

  // An open slot alone isn't enough — a level whose unlock triggers have all
  // become permanently unreachable (target obstacle shape gone, target rune
  // pairing will never recur) would otherwise report "can introduce" forever
  // and hide a real loss. Requires a still-plausible path to an actual grant:
  // an un-granted initial template, an obstacleCleared trigger whose target
  // shape still exists, or a runeDetonated trigger some rune in the
  // inventory is currently configured to match. Not a perfect solver (a
  // trigger reachable only via a future promotion chain isn't detected as
  // plausible until a rune actually reaches that state) but closes the
  // vacuous "any open slot" case that actually breaks the loss check.
  canIntroduceRune(ctx: SupplyContext): boolean {
    if (ctx.state.inventory.isFull()) return false
    if (this.grantedInitialCount < this.params.initial.length) return true
    return this.params.rules.some((rule) => this.triggerStillPlausible(rule.trigger, ctx))
  }

  private triggerStillPlausible(trigger: UnlockTrigger, ctx: SupplyContext): boolean {
    if (trigger.type === 'obstacleCleared') {
      // The target shape existing isn't enough — something currently in the
      // inventory has to be capable of ever damaging it. Without this, an
      // obstacle that's partially damaged but whose last matching rune has
      // fully depleted (inventory now empty) reads as "still plausible"
      // forever, since the shape technically still exists — masking a real
      // stuck state (found live: a level ran to its full simulated time
      // budget with every slot empty and this trigger still "plausible").
      const shapeExists = ctx.state.obstacles.some((o) => o.shape.sides === trigger.shape)
      if (!shapeExists) return false
      return ctx.state.inventory.slots.some((r) => r && r.middle.shape.sides === trigger.shape)
    }
    return ctx.state.inventory.slots.some(
      (r) => r && r.middle.shape.sides === trigger.middle && r.outer.shape.sides === trigger.outer,
    )
  }

  private grant(unlocks: RuneTemplate[], ctx: SupplyContext): void {
    for (const template of unlocks) {
      if (ctx.state.inventory.isFull()) break
      ctx.addRune(template)
    }
  }
}
