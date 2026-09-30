import { canPlace } from './rules'
import { footprintRadius, outerLayer } from './geometry'
import type { LossReason, RuneLayerSpec, SimState } from './types'

const SCAN_STEP = 6

// Every obstacle cleared. Ice never counts: breaking it is never required.
export function isWon(state: SimState): boolean {
  const real = state.obstacles.filter((o) => !o.frozen)
  return real.length > 0 && real.every((o) => o.cleared)
}

// Necessary condition for winning: damage to an obstacle layer of shape s
// only ever comes from detonating a piece whose energy has s sides, so per
// shape the pieces on the field and the layers still to cast must be able
// to deal at least the remaining HP of that shape. Unbounded (endless)
// stacks always pass.
function damageCanSuffice(state: SimState): boolean {
  if (state.runes.some((r) => r.endlessSeed !== undefined) || state.obstacles.some((o) => o.endlessSeed !== undefined)) return true
  const need = new Map<number, number>()
  for (const o of state.obstacles) {
    if (o.cleared || o.frozen) continue
    o.layers.forEach((l, i) => {
      if (i < o.index) return
      need.set(l.sides, (need.get(l.sides) ?? 0) + (i === o.index ? o.hp : l.hp))
    })
  }
  const can = new Map<number, number>()
  const add = (layer: RuneLayerSpec, energy: RuneLayerSpec) => can.set(energy.sides, (can.get(energy.sides) ?? 0) + layer.sides)
  for (const p of state.pieces) add(p.layer, p.energy)
  for (const r of state.runes) for (let i = r.index; i + 1 < r.layers.length; i++) add(r.layers[i], r.layers[i + 1])
  for (const [s, hp] of need) if ((can.get(s) ?? 0) < hp) return false
  return true
}

// Could the free motes' colors (generics as wildcards) ever cover this
// layer's catch requirements? Ignores position, so it only rules out.
export function colorsCanCover(state: SimState, catches: string[]): boolean {
  const have = new Map<string, number>()
  let generic = 0
  for (const m of state.motes) {
    if (m.state !== 'free' && m.state !== 'ejecting') continue
    if (m.color === 'generic') generic++
    else have.set(m.color, (have.get(m.color) ?? 0) + 1)
  }
  const need = new Map<string, number>()
  for (const c of catches) need.set(c, (need.get(c) ?? 0) + 1)
  let short = 0
  for (const [c, n] of need) short += Math.max(0, n - (have.get(c) ?? 0))
  return short <= generic
}

// A rune is worth casting if some layer still to cast could fill: casting
// the ones above it is how you dig down to it.
export function anyUsefulCast(state: SimState): boolean {
  const f = state.field
  for (const rune of state.runes) {
    const outer = outerLayer(rune)
    if (rune.state !== 'idle' || !outer) continue
    let fillable = false
    for (let i = rune.index; i + 1 < rune.layers.length && !fillable; i++) fillable = colorsCanCover(state, rune.layers[i].nodes.map((n) => n.catch))
    if (!fillable) continue
    const r = footprintRadius(outer)
    for (let y = f.y + r; y <= f.y + f.h - r; y += SCAN_STEP)
      for (let x = f.x + r; x <= f.x + f.w - r; x += SCAN_STEP) if (canPlace(state, rune, { x, y })) return true
  }
  return false
}

// Motes can be kicked anywhere, so a charging piece can still fill whenever
// the free motes' colors cover its empty nodes, wherever those motes sit.
function chargingPieceCanFill(state: SimState): boolean {
  for (const piece of state.pieces) {
    if (piece.state !== 'charging') continue
    const missing = piece.layer.nodes.filter((_, i) => piece.held[i] === null).map((n) => n.catch)
    if (colorsCanCover(state, missing)) return true
  }
  return false
}

// Conservative: a reason only when no sequence of actions can ever win.
// Anything uncertain (pending motion, a tappable rune, a legal placement) is
// treated as "still playable"; undo and restart cover the rest.
export function certainLoss(state: SimState): LossReason | null {
  if (state.status !== 'playing' || isWon(state)) return null
  if (!damageCanSuffice(state)) return 'damage'
  if (state.motes.some((m) => m.state === 'traveling' || m.state === 'ejecting' || m.vel)) return null
  if (state.pieces.some((p) => p.state === 'full')) return null
  if (anyUsefulCast(state)) return null
  if (chargingPieceCanFill(state)) return null
  return 'stuck'
}

export function isCertainLoss(state: SimState): boolean {
  return certainLoss(state) !== null
}
