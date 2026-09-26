import type { Id, Vec2 } from '../core/types'
import type { PolygonSpec } from './Polygon'
import type { NodeColorSpec } from './Color'

export type RuneState = 'idle' | 'active' | 'detonating'
export type InsightLevel = 'none' | 'shape' | 'full'

export interface RuneNode {
  filled: boolean
  puffId: Id | null
}

// A single telescoping layer: a shape plus one independent catch/release
// color spec per node (index-aligned with verticesOf(shape) — never
// cross-referenced against another layer's node count, since outer/middle/
// center can each have a different number of sides).
export interface RuneLayer {
  shape: PolygonSpec
  nodeColors: NodeColorSpec[] // length === shape.sides
}

export interface Rune {
  id: Id
  outer: RuneLayer // collects miasma — this is what `nodes` tracks fill-state for
  middle: RuneLayer // connects to obstacles; becomes the new outer on detonation
  center: RuneLayer | null // becomes the new middle on detonation; null = terminal next promotion
  centerLayerIndex: number // how many centers have been produced so far (GrowthContext.layerIndex)
  insightLevel: InsightLevel // gates rendering of `center` only — outer/middle are always fully shown
  nodes: RuneNode[] // length === outer.shape.sides, live fill-state parallel to outer.nodeColors
  state: RuneState
  linkedObstacleId: Id | null
  slotIndex: number
  // World-space position once dropped into the field; unset while idle in inventory.
  fieldPosition?: Vec2
  // Frozen at drop time — field-packing footprint does NOT change as the
  // rune's outer shape changes size across later promotions.
  footprintRadius?: number
}

const BASE_DAMAGE_PER_NODE = 1

export function freshNodes(layer: RuneLayer): RuneNode[] {
  return Array.from({ length: layer.shape.sides }, () => ({ filled: false, puffId: null }))
}

export function createRune(
  id: Id,
  outer: RuneLayer,
  middle: RuneLayer,
  center: RuneLayer | null,
  insightLevel: InsightLevel,
): Rune {
  return {
    id,
    outer,
    middle,
    center,
    centerLayerIndex: 0,
    insightLevel,
    state: 'idle',
    linkedObstacleId: null,
    slotIndex: -1,
    nodes: freshNodes(outer),
  }
}

export function runeDamage(rune: Rune): number {
  return rune.outer.shape.sides * BASE_DAMAGE_PER_NODE
}
