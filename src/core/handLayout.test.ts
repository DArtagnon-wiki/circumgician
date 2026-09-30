import { describe, expect, it } from 'vitest'
import { handLayout, iconRadius } from './handLayout'
import { INVENTORY_ZONE, VIRTUAL_W } from '../sim/constants'

describe('hand layout', () => {
  it('keeps every footprint on the shelf and clear of its neighbours', () => {
    for (let n = 1; n <= 10; n++) {
      const { slots, room, hit } = handLayout(n)
      expect(slots).toHaveLength(n)
      for (const p of slots) {
        expect(p.x - room, `n=${n}`).toBeGreaterThanOrEqual(-1e-6)
        expect(p.x + room, `n=${n}`).toBeLessThanOrEqual(VIRTUAL_W + 1e-6)
        expect(p.y - room, `n=${n}`).toBeGreaterThanOrEqual(INVENTORY_ZONE.y)
        expect(p.y + room, `n=${n}`).toBeLessThanOrEqual(INVENTORY_ZONE.y + INVENTORY_ZONE.h)
      }
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const d = Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y)
          expect(d, `n=${n} slots ${i},${j}`).toBeGreaterThanOrEqual(2 * room)
          expect(d, `n=${n} taps ${i},${j}`).toBeGreaterThanOrEqual(2 * hit)
        }
    }
  })

  it('staggers five or more into two rows, with more room than one row gives', () => {
    const six = handLayout(6)
    expect(new Set(six.slots.map((p) => Math.round(p.y))).size).toBe(2)
    expect(six.room).toBeGreaterThan((VIRTUAL_W / 6) / 2)
    expect(new Set(handLayout(4).slots.map((p) => p.y)).size).toBe(1)
  })
})

describe('icon radius', () => {
  it('draws bigger runes bigger, never beyond the rune itself or its room', () => {
    const room = handLayout(6).room
    const sizes = [30, 40, 62, 88].map((r) => iconRadius(r, 88, room, 8.5, 7))
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b))
    expect(new Set(sizes).size).toBe(4)
    for (const [i, r] of [30, 40, 62, 88].entries()) {
      const icon = sizes[i]
      expect(icon).toBeLessThanOrEqual(r)
      expect(icon + Math.max(7, (8.5 * icon) / r)).toBeLessThanOrEqual(room + 1e-6)
    }
    expect(iconRadius(30, 40, 58, 8.5, 7)).toBe(30) // plenty of room: true size
  })
})
