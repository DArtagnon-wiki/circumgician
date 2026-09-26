import type { Id } from '../core/types'
import type { Rune } from './Rune'

// Single write path for rune slots so every supply strategy (and the future
// debug spawner) shares one source of truth for capacity bookkeeping.
export class Inventory {
  slots: (Rune | null)[]

  constructor(capacity: number) {
    this.slots = new Array(capacity).fill(null)
  }

  get capacity(): number {
    return this.slots.length
  }

  isFull(): boolean {
    return this.slots.every((s) => s !== null)
  }

  freeSlotCount(): number {
    return this.slots.filter((s) => s === null).length
  }

  tryAddRune(rune: Rune): Rune | null {
    const idx = this.slots.findIndex((s) => s === null)
    if (idx === -1) return null
    rune.slotIndex = idx
    this.slots[idx] = rune
    return rune
  }

  removeRune(id: Id): void {
    const idx = this.slots.findIndex((s) => s?.id === id)
    if (idx !== -1) this.slots[idx] = null
  }
}
