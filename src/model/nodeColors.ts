import type { ShapeSides } from '../core/types'
import type { NodeColorSpec } from './Color'
import type { RuneLayer } from './Rune'
import { radiusForSides } from './Polygon'

// Authoring convenience: most layers want the same catch/release pair on
// every node rather than a hand-written array per side.
export function uniformNodeColors(sides: ShapeSides, spec: NodeColorSpec): NodeColorSpec[] {
  return Array.from({ length: sides }, () => ({ ...spec }))
}

// Cycles a short authored pattern to fill out a layer's full node count —
// e.g. patternNodeColors(5, [{catch:'red',release:'gold'}, {catch:'blue',release:'generic'}])
// produces 5 entries, repeating the 2-entry pattern.
export function patternNodeColors(sides: ShapeSides, pattern: NodeColorSpec[]): NodeColorSpec[] {
  return Array.from({ length: sides }, (_, i) => ({ ...pattern[i % pattern.length] }))
}

const GENERIC: NodeColorSpec = { catch: 'generic', release: 'generic' }

// Builds a full RuneLayer (shape + nodeColors) in one call — the common case
// for level-authoring where every node on a layer shares one catch/release
// pair, or a short pattern.
export function simpleLayer(sides: ShapeSides, spec: NodeColorSpec = GENERIC): RuneLayer {
  return { shape: { sides, radius: radiusForSides(sides) }, nodeColors: uniformNodeColors(sides, spec) }
}

export function patternLayer(sides: ShapeSides, pattern: NodeColorSpec[]): RuneLayer {
  return { shape: { sides, radius: radiusForSides(sides) }, nodeColors: patternNodeColors(sides, pattern) }
}
