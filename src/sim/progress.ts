import { canPlace } from './rules'
import { footprintRadius, homeCanReachRing, outerLayer } from './geometry'
import type { SimState } from './types'

const SCAN_STEP = 6

export function isWon(state: SimState): boolean {
  return state.obstacles.length > 0 && state.obstacles.every((o) => o.cleared)
}

// Necessary condition for winning: damage to an obstacle layer of shape s
// only ever comes from detonating a rune layer whose middle has s sides, so
// per shape the remaining rune stacks must be able to deal at least the
// remaining HP of that shape. Unbounded (endless) stacks always pass.
function damageCanSuffice(state: SimState): boolean {
  if (state.runes.some((r) => r.endlessSeed !== undefined) || state.obstacles.some((o) => o.endlessSeed !== undefined)) return true
  const need = new Map<number, number>()
  for (const o of state.obstacles) {
    if (o.cleared) continue
    o.layers.forEach((l, i) => {
      if (i < o.index) return
      need.set(l.sides, (need.get(l.sides) ?? 0) + (i === o.index ? o.hp : l.hp))
    })
  }
  const can = new Map<number, number>()
  for (const r of state.runes) {
    if (r.state === 'spent') continue
    for (let i = r.index; i + 1 < r.layers.length; i++) {
      const s = r.layers[i + 1].sides
      can.set(s, (can.get(s) ?? 0) + r.layers[i].sides)
    }
  }
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

export function anyIdlePlacement(state: SimState): boolean {
  const f = state.field
  for (const rune of state.runes) {
    if (rune.state !== 'idle') continue
    if (!colorsCanCover(state, outerLayer(rune)!.nodes.map((n) => n.catch))) continue
    const r = footprintRadius(outerLayer(rune)!)
    for (let y = f.y + r; y <= f.y + f.h - r; y += SCAN_STEP)
      for (let x = f.x + r; x <= f.x + f.w - r; x += SCAN_STEP) if (canPlace(state, rune, { x, y })) return true
  }
  return false
}

function chargingRuneCanFill(state: SimState): boolean {
  for (const rune of state.runes) {
    if (rune.state !== 'charging' || !rune.pos) continue
    const layer = outerLayer(rune)!
    const ok = rune.held.every((id, i) => {
      if (id !== null) return true
      const want = layer.nodes[i].catch
      return state.motes.some(
        (m) => m.state === 'free' && (m.color === 'generic' || m.color === want) && homeCanReachRing(m.home, m.tether + 0.5, rune.pos!, layer.radius),
      )
    })
    if (ok) return true
  }
  return false
}

// Conservative: true only when no sequence of actions can ever win. Anything
// uncertain (pending motion, a tappable rune, a legal placement) is treated
// as "still playable" — undo and restart cover the rest.
export function isCertainLoss(state: SimState): boolean {
  if (state.status !== 'playing' || isWon(state)) return false
  if (!damageCanSuffice(state)) return true
  if (state.motes.some((m) => m.state === 'traveling' || m.state === 'ejecting')) return false
  if (state.runes.some((r) => r.state === 'full')) return false
  if (anyIdlePlacement(state)) return false
  if (chargingRuneCanFill(state)) return false
  return true
}
