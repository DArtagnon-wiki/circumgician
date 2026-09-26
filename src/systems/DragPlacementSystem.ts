import type { GameState } from '../core/GameState'
import type { EventBus } from '../core/EventBus'
import type { Rect } from '../core/Layout'
import type { Rune } from '../model/Rune'
import type { Obstacle } from '../model/Obstacle'
import type { Id, Vec2 } from '../core/types'
import { radiusForSides } from '../model/Polygon'
import { findNearestObstacleByShape } from './matching'

const PLACEMENT_PADDING = 6

export interface PlacementResult {
  ok: boolean
  obstacle?: Obstacle
}

// A rune not yet placed has no frozen footprintRadius yet — this is what a
// drop attempt would freeze it to. Once placed, footprintRadius never
// changes again even as later promotions resize the visual outer shape.
export function effectiveFootprintRadius(rune: Rune): number {
  return rune.footprintRadius ?? radiusForSides(rune.outer.shape.sides)
}

// Drag-and-drop placement: a rune only leaves the inventory once it's dropped
// somewhere in the field that (a) has a matching-shape obstacle to link to and
// (b) doesn't overlap another placed rune's footprint (packing by frozen
// footprint radius). Everything downstream (miasma fill, detonation) only
// cares that the rune is 'active' — this system's whole job is judging a
// drop legal.
export class DragPlacementSystem {
  private state: GameState
  private bus: EventBus
  private getObstaclePosition: (id: Id) => Vec2 | undefined

  constructor(state: GameState, bus: EventBus, getObstaclePosition: (id: Id) => Vec2 | undefined) {
    this.state = state
    this.bus = bus
    this.getObstaclePosition = getObstaclePosition
  }

  findNearestMatch(rune: Rune, worldPos: Vec2): Obstacle | null {
    return findNearestObstacleByShape(this.state.obstacles, rune.middle.shape.sides, worldPos, this.getObstaclePosition)
  }

  fitsInField(rune: Rune, worldPos: Vec2, bounds: Rect): boolean {
    const r = effectiveFootprintRadius(rune)
    const outOfBounds =
      worldPos.x - r < bounds.x ||
      worldPos.x + r > bounds.x + bounds.width ||
      worldPos.y - r < bounds.y ||
      worldPos.y + r > bounds.y + bounds.height
    if (outOfBounds) return false

    for (const other of this.state.inventory.slots) {
      if (!other || other.id === rune.id || other.state !== 'active' || !other.fieldPosition) continue
      const dx = other.fieldPosition.x - worldPos.x
      const dy = other.fieldPosition.y - worldPos.y
      if (Math.hypot(dx, dy) < r + effectiveFootprintRadius(other) + PLACEMENT_PADDING) return false
    }
    return true
  }

  // Whether ANY currently-idle rune could fit ANYWHERE in the field right
  // now — used by the fail check, not by an actual drop attempt.
  hasRoomForSomeIdleRune(bounds: Rect, sampleStep = 24): boolean {
    const idleRunes = this.state.inventory.slots.filter((r): r is Rune => !!r && r.state === 'idle')
    if (idleRunes.length === 0) return true // nothing waiting to place isn't a lockout

    const smallest = idleRunes.reduce((a, b) => (effectiveFootprintRadius(a) <= effectiveFootprintRadius(b) ? a : b))
    const r = effectiveFootprintRadius(smallest)
    for (let y = bounds.y + r; y <= bounds.y + bounds.height - r; y += sampleStep) {
      for (let x = bounds.x + r; x <= bounds.x + bounds.width - r; x += sampleStep) {
        if (this.fitsInField(smallest, { x, y }, bounds)) return true
      }
    }
    return false
  }

  tryPlace(rune: Rune, worldPos: Vec2, bounds: Rect): PlacementResult {
    if (rune.state !== 'idle') return { ok: false }
    const obstacle = this.findNearestMatch(rune, worldPos)
    if (!obstacle) return { ok: false }
    if (!this.fitsInField(rune, worldPos, bounds)) return { ok: false }

    rune.state = 'active'
    rune.linkedObstacleId = obstacle.id
    rune.fieldPosition = { x: worldPos.x, y: worldPos.y }
    rune.footprintRadius = effectiveFootprintRadius(rune)
    this.bus.emit('rune:activated', { rune, obstacle })
    return { ok: true, obstacle }
  }
}
