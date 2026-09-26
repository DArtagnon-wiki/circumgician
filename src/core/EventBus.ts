import mitt from 'mitt'
import type { Id } from '../core/types'
import type { Rune } from '../model/Rune'
import type { Obstacle } from '../model/Obstacle'
import type { PolygonSpec } from '../model/Polygon'

export type GameEvents = {
  // obstacle is undefined when a rune is placed with no matching obstacle
  // nearby — it still goes active and collects miasma, just unlinked.
  'rune:activated': { rune: Rune; obstacle?: Obstacle }
  'node:filled': { rune: Rune; nodeIndex: number }
  'rune:ready': { rune: Rune }
  'obstacle:damaged': { obstacle: Obstacle; damage: number }
  'obstacle:cleared': { obstacle: Obstacle }
  'obstacle:layerPromoted': { obstacle: Obstacle; previousShape: PolygonSpec }
  // Fires on EVERY detonation cycle, with the rune still in its pre-promotion
  // state (outer/middle as they were when it went off) — SFX and
  // EventTriggeredUnlockStrategy's trigger-matching both depend on seeing
  // the pairing that actually detonated, not what it promotes into next.
  'rune:detonated': { rune: Rune }
  // Fires only when a detonation had no center to promote into a new middle
  // — the one moment a slot truly vacates now.
  'rune:depleted': { rune: Rune }
  // Fires when a detonation successfully promoted in place (outer destroyed,
  // middle -> outer, center -> middle, new center rolled) — rune is already
  // in its NEW post-promotion state here, for rendering to resync against.
  'rune:promoted': { rune: Rune }
  'rune:added': { rune: Rune }
  'miasma:annihilated': { puffIds: Id[] }
  'game:won': undefined
  'game:lost': undefined
}

export type EventBus = ReturnType<typeof createEventBus>

export function createEventBus() {
  return mitt<GameEvents>()
}
