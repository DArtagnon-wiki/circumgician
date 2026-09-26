import type { GameState } from '../core/GameState'
import type { EventBus } from '../core/EventBus'
import type { Id, Vec2 } from '../core/types'
import type { Rune } from '../model/Rune'
import type { MiasmaPuff } from '../model/MiasmaPuff'
import { verticesOf } from '../model/Polygon'

const ARRIVE_EPSILON = 4
const APPROACH_RATE = 6 // frame-rate independent ease toward the target node

// Each active rune with an unfilled node reserves the nearest free puff and
// pulls it in; because every puff is drawn from one shared pool, two active
// runes naturally compete for the same miasma without any extra bookkeeping.
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
      this.reserveNextPuff(rune)
    }

    for (const puff of this.state.miasmaPuffs) {
      if (puff.state === 'traveling') this.advancePuff(puff, dt)
    }
  }

  private reserveNextPuff(rune: Rune): void {
    const nodeIndex = rune.nodes.findIndex((n) => !n.filled)
    if (nodeIndex === -1) return

    const alreadyTraveling = this.state.miasmaPuffs.some(
      (p) => p.state === 'traveling' && p.targetRuneId === rune.id && p.targetNodeIndex === nodeIndex,
    )
    if (alreadyTraveling) return

    const runePos = this.getRunePosition(rune.id)
    if (!runePos) return
    const nodeWorldPos = verticesOf(rune.outer, runePos)[nodeIndex]

    let nearest: MiasmaPuff | null = null
    let nearestDistSq = Infinity
    for (const puff of this.state.miasmaPuffs) {
      if (puff.state !== 'free') continue
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
    const targetWorldPos = verticesOf(rune.outer, runePos)[nodeIndex]

    const dx = targetWorldPos.x - puff.position.x
    const dy = targetWorldPos.y - puff.position.y
    const dist = Math.hypot(dx, dy)

    if (dist <= ARRIVE_EPSILON) {
      puff.position.x = targetWorldPos.x
      puff.position.y = targetWorldPos.y
      puff.state = 'consumed'
      rune.nodes[nodeIndex].filled = true
      rune.nodes[nodeIndex].puffId = puff.id
      this.bus.emit('node:filled', { rune, nodeIndex })
      if (rune.nodes.every((n) => n.filled)) {
        this.bus.emit('rune:ready', { rune })
      }
      return
    }

    const t = 1 - Math.exp(-APPROACH_RATE * dt)
    puff.position.x += dx * t
    puff.position.y += dy * t
  }

  private releaseToField(puff: MiasmaPuff): void {
    puff.state = 'free'
    puff.targetRuneId = undefined
    puff.targetNodeIndex = undefined
  }
}
