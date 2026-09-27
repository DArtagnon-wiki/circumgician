import { FOOTPRINT_MARGIN, REACH, SPIN_K } from './constants'
import type { Rect, Rune, RuneLayerSpec, SimState, Vec2 } from './types'

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

export function outerLayer(rune: Rune): RuneLayerSpec | undefined {
  return rune.layers[rune.index]
}
export function middleLayer(rune: Rune): RuneLayerSpec | undefined {
  return rune.layers[rune.index + 1]
}
export function centerLayer(rune: Rune): RuneLayerSpec | undefined {
  return rune.layers[rune.index + 2]
}

export const angularSpeed = (radius: number): number => SPIN_K / radius

// Outer layer angle (radians, clockwise in screen space). Starts with a
// vertex pointing up at placement. Purely a function of time since placement.
export function outerAngle(rune: Rune, time: number): number {
  const layer = outerLayer(rune)
  if (!layer || rune.placedAt === undefined) return -Math.PI / 2
  return -Math.PI / 2 + angularSpeed(layer.radius) * (time - rune.placedAt)
}

// Middle counter-rotates at the speed its own radius implies.
export function middleAngle(rune: Rune, time: number): number {
  const layer = middleLayer(rune)
  if (!layer || rune.placedAt === undefined) return -Math.PI / 2
  return -Math.PI / 2 - angularSpeed(layer.radius) * (time - rune.placedAt)
}

export function polygonPoints(center: Vec2, sides: number, radius: number, angle: number): Vec2[] {
  const pts: Vec2[] = []
  for (let i = 0; i < sides; i++) {
    const a = angle + (i * 2 * Math.PI) / sides
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) })
  }
  return pts
}

export function nodePositions(rune: Rune, time: number): Vec2[] {
  const layer = outerLayer(rune)
  if (!layer || !rune.pos) return []
  return polygonPoints(rune.pos, layer.sides, layer.radius, outerAngle(rune, time))
}

export function footprintRadius(layer: RuneLayerSpec): number {
  return layer.radius + FOOTPRINT_MARGIN
}

// Could a mote whose drift stays within `tether` of `home` ever enter this
// rune's catch ring? Used by the conservative loss check.
export function homeCanReachRing(home: Vec2, tether: number, center: Vec2, radius: number): boolean {
  const d = dist(home, center)
  return d + tether >= radius - REACH && d - tether <= radius + REACH
}

export function circleInRect(c: Vec2, r: number, rect: Rect): boolean {
  return c.x - r >= rect.x && c.x + r <= rect.x + rect.w && c.y - r >= rect.y && c.y + r <= rect.y + rect.h
}

export function circleHitsRect(c: Vec2, r: number, rect: Rect): boolean {
  const nx = Math.max(rect.x, Math.min(c.x, rect.x + rect.w))
  const ny = Math.max(rect.y, Math.min(c.y, rect.y + rect.h))
  return Math.hypot(c.x - nx, c.y - ny) < r
}

export function clampToRect(p: Vec2, rect: Rect, inset = 0): Vec2 {
  return {
    x: Math.max(rect.x + inset, Math.min(rect.x + rect.w - inset, p.x)),
    y: Math.max(rect.y + inset, Math.min(rect.y + rect.h - inset, p.y)),
  }
}

export function placedRunes(state: SimState): Rune[] {
  return state.runes.filter((r) => r.state === 'charging' || r.state === 'full')
}
