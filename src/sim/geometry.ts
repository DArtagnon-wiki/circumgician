import { FOOTPRINT_MARGIN, REACH, SPIN_K } from './constants'
import type { Piece, Rect, Rune, RuneLayerSpec, Vec2 } from './types'

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

// The layer a rune would cast now. A stack's last entry is only ever a
// target shape, so it is never in hand.
export function outerLayer(rune: Rune): RuneLayerSpec | undefined {
  return rune.index + 1 < rune.layers.length ? rune.layers[rune.index] : undefined
}
// What the layer in hand would strike: the next entry of the stack.
export function middleLayer(rune: Rune): RuneLayerSpec | undefined {
  return outerLayer(rune) ? rune.layers[rune.index + 1] : undefined
}
export function centerLayer(rune: Rune): RuneLayerSpec | undefined {
  return outerLayer(rune) ? rune.layers[rune.index + 2] : undefined
}
// Is this entry the stack's last, the one that only ever strikes? (Endless
// stacks grow on demand and never have one.)
export function isFinal(rune: Rune, depth: number): boolean {
  return rune.endlessSeed === undefined && depth === rune.layers.length - 1
}

export const angularSpeed = (radius: number): number => SPIN_K / radius

// A piece's glass angle (radians, clockwise in screen space). Starts with a
// vertex pointing up when cast. Purely a function of time since casting.
export function outerAngle(piece: Piece, time: number): number {
  return -Math.PI / 2 + angularSpeed(piece.layer.radius) * (time - piece.placedAt)
}

// Its energy counter-rotates at the speed its own radius implies.
export function middleAngle(piece: Piece, time: number): number {
  return -Math.PI / 2 - angularSpeed(piece.energy.radius) * (time - piece.placedAt)
}

export function polygonPoints(center: Vec2, sides: number, radius: number, angle: number): Vec2[] {
  const pts: Vec2[] = []
  for (let i = 0; i < sides; i++) {
    const a = angle + (i * 2 * Math.PI) / sides
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) })
  }
  return pts
}

export function nodePositions(piece: Piece, time: number): Vec2[] {
  return polygonPoints(piece.pos, piece.layer.sides, piece.layer.radius, outerAngle(piece, time))
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
