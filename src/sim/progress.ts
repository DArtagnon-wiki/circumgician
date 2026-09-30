import { canFire, canPlace } from './rules'
import { footprintRadius, outerLayer } from './geometry'
import { takesAnyBowl } from '../model/Color'
import type { LossReason, SimState } from './types'

const SCAN_STEP = 6

// Every obstacle cleared. Ice never counts: breaking it is never required.
export function isWon(state: SimState): boolean {
  const real = state.obstacles.filter((o) => !o.frozen)
  return real.length > 0 && real.every((o) => o.cleared)
}

// Could the free motes' colors (opal, null and void as wildcards) ever cover
// this layer's catch requirements? Ignores position, so it only rules out.
export function colorsCanCover(state: SimState, catches: string[]): boolean {
  const have = new Map<string, number>()
  let generic = 0
  for (const m of state.motes) {
    if (m.state !== 'free' && m.state !== 'ejecting') continue
    if (takesAnyBowl(m.color)) generic++
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
    for (let i = rune.index; i + 1 < rune.layers.length && !fillable; i++) fillable = colorsCanCover(state, rune.layers[i].nodes.filter((n) => !n.prefilled).map((n) => n.catch))
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

// The game ends in a loss only when the player can no longer do anything
// that moves it along: nothing full to burst (a piece in stasis without its
// partner can't), nothing charging that could still fill, and no rune worth
// casting. A board that can no longer be won
// plays on while moves remain, so a wrong turn is the player's to find
// (the way a maze doesn't announce a dead end). Anything uncertain (pending
// motion, a legal placement) counts as still playable.
export function certainLoss(state: SimState): LossReason | null {
  if (state.status !== 'playing' || isWon(state)) return null
  if (state.motes.some((m) => m.state === 'traveling' || m.state === 'ejecting' || m.vel)) return null
  if (state.pieces.some((p) => canFire(state, p))) return null
  if (anyUsefulCast(state)) return null
  if (chargingPieceCanFill(state)) return null
  return 'stuck'
}

export function isCertainLoss(state: SimState): boolean {
  return certainLoss(state) !== null
}
