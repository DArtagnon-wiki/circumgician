import type { GameState } from '../core/GameState'
import type { EventBus } from '../core/EventBus'
import type { Id, Vec2 } from '../core/types'
import type { Rune } from '../model/Rune'
import type { MiasmaPuff } from '../model/MiasmaPuff'
import { verticesOf } from '../model/Polygon'
import { moteMatchesCatch } from '../model/Color'

// Deliberately slow, genuinely accelerating approach — a puff should be
// visibly in flight for a couple of seconds, not snap to the node almost
// instantly. Ease-in-quad from a captured start position over a fixed
// duration: deterministically arrives exactly at TRAVEL_DURATION, unlike a
// velocity/acceleration pursuit (tried first) which can orbit a stationary
// target indefinitely without ever actually converging.
const TRAVEL_DURATION = 2.2 // seconds

// Each active rune's unfilled nodes each independently reserve the nearest
// free puff whose color they can catch (generic or an exact match) — because
// every puff is drawn from one shared pool, runes (and now individual nodes
// needing scarce colors) naturally compete without any extra bookkeeping.
// Nodes are reserved concurrently, not one-at-a-time, so a node needing a
// scarce color can't stall the rest of an otherwise-ready rune.
export class AttractionFillSystem {
  private state: GameState
  private bus: EventBus
  private getRunePosition: (id: Id) => Vec2 | undefined

  constructor(state: GameState, bus: EventBus, getRunePosition: (id: Id) => Vec2 | undefined) {
    this.state = state
    this.bus = bus
    this.getRunePosition = getRunePosition
  }

  update(dt: number): void {
    for (const rune of this.state.inventory.slots) {
      if (!rune || rune.state !== 'active') continue
      this.reserveForRune(rune)
    }

    for (const puff of this.state.miasmaPuffs) {
      if (puff.state === 'traveling') this.advancePuff(puff, dt)
    }
  }

  private reserveForRune(rune: Rune): void {
    rune.nodes.forEach((node, nodeIndex) => {
      if (node.filled) return
      const alreadyTraveling = this.state.miasmaPuffs.some(
        (p) => p.state === 'traveling' && p.targetRuneId === rune.id && p.targetNodeIndex === nodeIndex,
      )
      if (alreadyTraveling) return
      this.reserveNodePuff(rune, nodeIndex)
    })
  }

  private reserveNodePuff(rune: Rune, nodeIndex: number): void {
    const runePos = this.getRunePosition(rune.id)
    if (!runePos) return
    const nodeWorldPos = verticesOf(rune.outer.shape, runePos)[nodeIndex]
    const catchColor = rune.outer.nodeColors[nodeIndex].catch

    let nearest: MiasmaPuff | null = null
    let nearestDistSq = Infinity
    for (const puff of this.state.miasmaPuffs) {
      if (puff.state !== 'free') continue
      if (!moteMatchesCatch(puff.color, catchColor)) continue
      const dx = puff.position.x - nodeWorldPos.x
      const dy = puff.position.y - nodeWorldPos.y
      const distSq = dx * dx + dy * dy
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq
        nearest = puff
      }
    }
    if (!nearest) return

    nearest.state = 'traveling'
    nearest.targetRuneId = rune.id
    nearest.targetNodeIndex = nodeIndex
    nearest.travelStartPos = { x: nearest.position.x, y: nearest.position.y }
    nearest.travelElapsed = 0
  }

  private advancePuff(puff: MiasmaPuff, dt: number): void {
    const rune = this.state.inventory.slots.find((r) => r?.id === puff.targetRuneId)
    const nodeIndex = puff.targetNodeIndex
    if (!rune || nodeIndex === undefined) {
      this.releaseToField(puff)
      return
    }

    const runePos = this.getRunePosition(rune.id)
    if (!runePos) return
    const targetWorldPos = verticesOf(rune.outer.shape, runePos)[nodeIndex]
    const start = puff.travelStartPos ?? puff.position

    puff.travelElapsed = (puff.travelElapsed ?? 0) + dt
    const t = Math.min(1, puff.travelElapsed / TRAVEL_DURATION)
    const eased = t * t // ease-in-quad: slow start, accelerating toward arrival

    puff.position.x = start.x + (targetWorldPos.x - start.x) * eased
    puff.position.y = start.y + (targetWorldPos.y - start.y) * eased

    if (t >= 1) {
      puff.state = 'consumed'
      rune.nodes[nodeIndex].filled = true
      rune.nodes[nodeIndex].puffId = puff.id
      this.bus.emit('node:filled', { rune, nodeIndex })
      if (rune.nodes.every((n) => n.filled)) {
        this.bus.emit('rune:ready', { rune })
      }
    }
  }

  private releaseToField(puff: MiasmaPuff): void {
    puff.state = 'free'
    puff.targetRuneId = undefined
    puff.targetNodeIndex = undefined
    puff.travelStartPos = undefined
    puff.travelElapsed = undefined
  }
}
