import { BURST_GAP } from './constants'
import type { DetonationInfo, SimBus } from './events'
import { circleHitsRect, circleInRect, clampToRect, dist, footprintRadius, middleAngle, middleLayer, outerAngle, outerLayer } from './geometry'
import type { Obstacle, Piece, Rune, RuneLayerSpec, SimState, Vec2 } from './types'

// Where node i's released mote settles: along that node's REST direction
// (vertex 0 pointing up), BURST_GAP outside the outer radius. Independent
// of spin, so designers can author exactly where bursts land.
export function landingPoint(center: Vec2, sides: number, radius: number, i: number): Vec2 {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides
  return { x: center.x + Math.cos(a) * (radius + BURST_GAP), y: center.y + Math.sin(a) * (radius + BURST_GAP) }
}

export function canPlace(state: SimState, rune: Rune, pos: Vec2): boolean {
  if (rune.state !== 'idle') return false
  const layer = outerLayer(rune)
  if (!layer) return false
  const r = footprintRadius(layer)
  if (!circleInRect(pos, r, state.field)) return false
  if (state.blockers.some((b) => circleHitsRect(pos, r, b))) return false
  for (const p of state.pieces) if (dist(pos, p.pos) < r + footprintRadius(p.layer)) return false
  return true
}

// Nearest uncleared obstacle (any distance) whose current layer has as many
// sides as the energy shape. Ties go to the earlier obstacle.
export function findLink(state: SimState, energy: RuneLayerSpec | undefined, pos: Vec2): Obstacle | null {
  if (!energy) return null
  let best: Obstacle | null = null
  let bestD = Infinity
  for (const o of state.obstacles) {
    if (o.cleared || o.layers[o.index]?.sides !== energy.sides) continue
    const d = dist(pos, o.pos)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

export function relinkAll(state: SimState, bus: SimBus): void {
  for (const piece of state.pieces) {
    const id = findLink(state, piece.energy, piece.pos)?.id ?? null
    if (id !== piece.linkedObstacleId) {
      piece.linkedObstacleId = id
      bus.emit('piece:linked', { piece })
    }
  }
}

// Called by the Sim before reading a layer that may not exist yet (endless).
export type EnsureLayers = (state: SimState) => void

// The layer in hand goes onto the field as a piece, and the rune brings its
// next layer into hand at once; when that next entry is the stack's last
// (a target shape only), the rune is spent instead.
export function castRune(state: SimState, bus: SimBus, rune: Rune, pos: Vec2, ensure?: EnsureLayers): Piece {
  const layer = outerLayer(rune)!
  const energy = middleLayer(rune)!
  const piece: Piece = {
    id: `piece-${state.nextId++}`,
    runeId: rune.id,
    slot: rune.slot,
    depth: rune.index,
    layer,
    energy,
    pos: { ...pos },
    placedAt: state.time,
    state: 'charging',
    held: Array.from({ length: layer.sides }, () => null),
    linkedObstacleId: findLink(state, energy, pos)?.id ?? null,
  }
  state.pieces.push(piece)
  rune.index++
  ensure?.(state)
  if (!outerLayer(rune)) rune.state = 'spent'
  bus.emit('piece:cast', { piece, rune })
  if (rune.state === 'spent') bus.emit('rune:spent', { rune })
  return piece
}

export function detonatePiece(state: SimState, bus: SimBus, piece: Piece, ensure?: EnsureLayers): void {
  const outer = piece.layer
  const pos = piece.pos
  const obstacle = state.obstacles.find((o) => o.id === piece.linkedObstacleId && !o.cleared) ?? null
  const info: DetonationInfo = {
    pos: { ...pos },
    outer,
    energy: piece.energy,
    outerAngle: outerAngle(piece, state.time),
    energyAngle: middleAngle(piece, state.time),
    damage: obstacle ? outer.sides : 0,
    obstacleId: obstacle?.id ?? null,
    released: [],
    annihilated: [],
  }

  // 1. Resolve each node's mote: annihilate, or recolor and burst outward.
  const annihilate = new Set<string>()
  piece.held.forEach((moteId, i) => {
    if (moteId === null) return
    const mote = state.motes.find((m) => m.id === moteId)
    if (!mote) return
    const release = outer.nodes[i].release
    if (release === 'annihilating') {
      annihilate.add(mote.id)
      info.annihilated.push(mote.id)
      return
    }
    mote.color = release
    if (release !== 'generic' && !state.seenHues.includes(release)) state.seenHues.push(release)
    mote.home = clampToRect(landingPoint(pos, outer.sides, outer.radius, i), state.field, Math.min(mote.tether + 2, state.field.w / 2, state.field.h / 2))
    mote.state = 'ejecting'
    mote.ejectFrom = { ...mote.pos }
    mote.t = 0
    delete mote.pieceId
    delete mote.node
    delete mote.travelFrom
    info.released.push(mote.id)
  })
  if (annihilate.size) state.motes = state.motes.filter((m) => !annihilate.has(m.id))
  state.stats.detonations++
  state.stats.destroyed += annihilate.size
  if (!obstacle) state.stats.unlinked++

  // 2. The piece is used up.
  state.pieces = state.pieces.filter((p) => p !== piece)
  bus.emit('piece:detonated', { piece, info })

  // 3. Damage the obstacle (after the piece has left, so relinking sees the
  //    freed field), then relink everything still on the field.
  if (obstacle) damageObstacle(state, bus, obstacle, outer.sides, ensure)
  relinkAll(state, bus)
}

// Damage never overflows into the next layer. Does not relink; callers do.
export function damageObstacle(state: SimState, bus: SimBus, obstacle: Obstacle, amount: number, ensure?: EnsureLayers): void {
  const landed = Math.min(obstacle.hp, amount)
  state.stats.landed += landed
  state.stats.wasted += amount - landed
  obstacle.hp -= landed
  bus.emit('obstacle:damaged', { obstacle, damage: amount })
  if (obstacle.hp > 0) return
  const previous = obstacle.layers[obstacle.index]
  obstacle.index++
  ensure?.(state)
  const next = obstacle.layers[obstacle.index]
  if (next) obstacle.hp = next.hp
  else obstacle.cleared = true
  state.broken++
  state.score += Math.round((previous.hp * previous.radius) / 30)
  if (previous.boss) {
    // Endless insight upgrade: enigma -> silhouette -> full, run-wide.
    for (const r of state.runes) r.insight = r.insight === 'none' ? 'shape' : 'full'
  }
  bus.emit('obstacle:collapsed', { obstacle, previous, cleared: obstacle.cleared })
}
