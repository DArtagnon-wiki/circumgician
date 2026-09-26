import type { Id } from '../core/types'
import type { PolygonSpec } from './Polygon'

export type RuneState = 'idle' | 'active' | 'detonating'

export interface RuneNode {
  filled: boolean
  puffId: Id | null
}

export interface Rune {
  id: Id
  inner: PolygonSpec
  outer: PolygonSpec
  nodes: RuneNode[]
  state: RuneState
  linkedObstacleId: Id | null
  slotIndex: number
}

const BASE_DAMAGE_PER_NODE = 1

export function createRune(id: Id, inner: PolygonSpec, outer: PolygonSpec): Rune {
  return {
    id,
    inner,
    outer,
    state: 'idle',
    linkedObstacleId: null,
    slotIndex: -1,
    nodes: Array.from({ length: outer.sides }, () => ({ filled: false, puffId: null })),
  }
}

export function runeDamage(rune: Rune): number {
  return rune.outer.sides * BASE_DAMAGE_PER_NODE
}
