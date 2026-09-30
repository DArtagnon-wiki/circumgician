import { INVENTORY_ZONE, VIRTUAL_W } from '../sim/constants'
import type { Vec2 } from '../sim/types'

// Where the runes in hand sit on the shelf. Up to four share a row; five or
// more stagger into two rows, which gives each more room than a row would.
// Slots never move during a level, so a rune is always where it was.
export interface HandLayout {
  slots: Vec2[]
  room: number // footprint radius per slot: the icon plus its bowls
  hit: number // tap radius: half the distance to the nearest neighbour
}

const TOP = 4 // clear of the shelf's gilt edge
const BOTTOM = 2
const GAP = 6 // between neighbouring footprints
const MAX_ROOM = 58

export function handLayout(n: number): HandLayout {
  n = Math.max(1, n)
  const h = INVENTORY_ZONE.h - TOP - BOTTOM
  const dx = VIRTUAL_W / n
  const x = (slot: number) => (slot + 0.5) * dx
  if (n <= 4) {
    const room = Math.min(MAX_ROOM, (dx - GAP) / 2, h / 2)
    const y = INVENTORY_ZONE.y + TOP + h / 2
    return { slots: Array.from({ length: n }, (_, i) => ({ x: x(i), y })), room, hit: Math.min(room + 8, dx / 2 - 2) }
  }
  // Two rows, neighbours alternating between them. The largest room that
  // fits: the rows fill the shelf's height (2 room + dy = h), the end slots
  // stay on screen, and neighbours clear each other (diagonally, and two
  // along in the same row).
  const fits = (room: number) => {
    const dy = h - 2 * room
    const step = (VIRTUAL_W - 2 * room) / (n - 1)
    return dy >= 0 && Math.hypot(step, dy) >= 2 * room + GAP && 2 * step >= 2 * room + GAP
  }
  let lo = 0
  let hi = h / 2
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  const room = lo
  const dy = h - 2 * room
  const step = (VIRTUAL_W - 2 * room) / (n - 1)
  const top = INVENTORY_ZONE.y + TOP + room
  const slots = Array.from({ length: n }, (_, i) => ({ x: room + i * step, y: i % 2 ? top + dy : top }))
  return { slots, room, hit: Math.min(Math.hypot(step, dy), 2 * step) / 2 - 2 }
}

// An icon's radius within its room. Bigger runes draw bigger, compressed so
// the smallest stays legible (`largest` is the level's biggest rune), and
// no icon draws larger than the rune itself. Bowls sit on the vertices and
// draw at `bowl` times the icon's scale, but never smaller than `minBowl`.
export function iconRadius(radius: number, largest: number, room: number, bowl: number, minBowl: number): number {
  const sized = (room - minBowl) * Math.pow(radius / Math.max(radius, largest), 0.4)
  return Math.max(1, Math.min(radius, sized, room / (1 + bowl / radius)))
}
