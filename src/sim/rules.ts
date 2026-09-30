import { BURST_GAP, EJECT_TIME, FOOTPRINT_MARGIN, THAW_LAG } from './constants'
import type { DetonationInfo, SimBus } from './events'
import { circleHitsRect, circleInRect, clampToRect, dist, footprintRadius, iceSpots, middleAngle, middleLayer, outerAngle, outerLayer, strikeTime } from './geometry'
import type { Hue, Mote, Obstacle, Piece, Rune, RuneLayerSpec, SimState, Vec2 } from './types'

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
  for (const o of state.obstacles) if (o.frozen && !o.cleared && dist(pos, o.pos) < r + o.layers[0].radius + FOOTPRINT_MARGIN) return false
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
export function castRune(state: SimState, bus: SimBus, rune: Rune, pos: Vec2, ensure?: EnsureLayers, fuse?: number): Piece {
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
    ...(fuse !== undefined ? { freezeAt: state.time + fuse } : {}),
  }
  state.pieces.push(piece)
  rune.index++
  ensure?.(state)
  if (!outerLayer(rune)) rune.state = 'spent'
  bus.emit('piece:cast', { piece, rune })
  if (rune.state === 'spent') bus.emit('rune:spent', { rune })
  return piece
}

// A strike on a frost layer that leaves it standing is caught by the frost:
// the piece freezes where it stood into ice of its own shape, holding the
// motes it transformed (see damageObstacle for the thaw).
function frostbites(obstacle: Obstacle | null, blow: number): obstacle is Obstacle {
  return !!obstacle && !obstacle.frozen && !!obstacle.layers[obstacle.index]?.frost && blow < obstacle.hp
}

export function detonatePiece(state: SimState, bus: SimBus, piece: Piece, ensure?: EnsureLayers): void {
  const outer = piece.layer
  const pos = piece.pos
  const obstacle = state.obstacles.find((o) => o.id === piece.linkedObstacleId && !o.cleared) ?? null
  const ice = frostbites(obstacle, outer.sides) ? newIce(state, pos, outer.sides, outer.radius, { obstacle: obstacle.id, layer: obstacle.index }) : null
  const spots = ice ? iceSpots(pos, outer.sides, outer.radius) : []
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
    ...(ice ? { frozeInto: ice.id } : {}),
  }

  // 1. Resolve each node's mote: annihilate, or recolor and burst outward
  //    (or, frostbitten, stay locked in the ice where its node stood).
  const annihilate = new Set<string>()
  const discovered: { hue: Hue; mote: Mote }[] = []
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
    if (release !== 'generic' && !state.seenHues.includes(release)) {
      state.seenHues.push(release)
      discovered.push({ hue: release, mote })
    }
    if (ice) {
      lockInIce(mote, ice, spots[i])
      return
    }
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

  // 2. The piece is used up (or frozen solid).
  state.pieces = state.pieces.filter((p) => p !== piece)
  if (ice) state.obstacles.push(ice)
  bus.emit('piece:detonated', { piece, info })
  for (const d of discovered) bus.emit('hue:discovered', d)

  // 3. Damage the obstacle (after the piece has left, so relinking sees the
  //    freed field), then relink everything still on the field.
  if (obstacle) damageObstacle(state, bus, obstacle, outer.sides, ensure, strikeTime(pos, obstacle.pos))
  relinkAll(state, bus)
}

// Ice: an obstacle of one layer, strength equal to its sides, that holds
// motes. `by` is the frost layer that froze it, if one did.
function newIce(state: SimState, pos: Vec2, sides: number, radius: number, by?: { obstacle: string; layer: number }): Obstacle {
  return { id: `frozen-${state.nextId++}`, pos: { ...pos }, layers: [{ sides, radius, hp: sides }], index: 0, hp: sides, cleared: false, frozen: { motes: [], ...(by ? { by } : {}) } }
}

function lockInIce(mote: Mote, ice: Obstacle, spot: Vec2): void {
  mote.state = 'frozen'
  mote.frozenIn = ice.id
  mote.pos = { ...spot }
  mote.home = { ...spot }
  delete mote.pieceId
  delete mote.node
  delete mote.travelFrom
  delete mote.t
  delete mote.vel
  delete mote.kicked
  ice.frozen!.motes.push(mote.id)
}

// Ice lets its motes go, unchanged, the way a detonation bursts them: each
// flies straight out past its vertex, once `delay` seconds have passed (the
// blow that freed them lands).
function releaseIce(state: SimState, ice: Obstacle, delay: number): void {
  const { radius } = ice.layers[0]
  for (const id of ice.frozen!.motes) {
    const mote = state.motes.find((m) => m.id === id)
    if (!mote) continue
    const dx = mote.pos.x - ice.pos.x
    const dy = mote.pos.y - ice.pos.y
    const d = Math.hypot(dx, dy) || 1
    const out = { x: ice.pos.x + (dx / d) * (radius + BURST_GAP), y: ice.pos.y + (dy / d) * (radius + BURST_GAP) }
    mote.home = clampToRect(out, state.field, Math.min(mote.tether + 2, state.field.w / 2, state.field.h / 2))
    mote.state = 'ejecting'
    mote.ejectFrom = { ...mote.pos }
    mote.t = -delay / EJECT_TIME // waits at its spot until t reaches 0
    delete mote.frozenIn
  }
  ice.frozen!.motes = []
}

// A piece that outlives its fuse freezes where it stands: ice of its own
// shape holding the motes it caught (and any still on their way).
export function freezePiece(state: SimState, bus: SimBus, piece: Piece): Obstacle {
  const { sides, radius } = piece.layer
  const obstacle = newIce(state, piece.pos, sides, radius)
  const spots = iceSpots(piece.pos, sides, radius)
  piece.held.forEach((moteId, i) => {
    const mote = moteId === null ? undefined : state.motes.find((m) => m.id === moteId)
    if (mote) lockInIce(mote, obstacle, spots[i])
  })
  state.obstacles.push(obstacle)
  state.pieces = state.pieces.filter((p) => p !== piece)
  bus.emit('piece:frozen', { piece, obstacle })
  relinkAll(state, bus)
  return obstacle
}

// Damage never overflows into the next layer. Does not relink; callers do.
// `landsIn`: seconds until the blow lands, which motes it frees wait for.
export function damageObstacle(state: SimState, bus: SimBus, obstacle: Obstacle, amount: number, ensure?: EnsureLayers, landsIn = 0): void {
  const landed = Math.min(obstacle.hp, amount)
  state.stats.landed += landed
  state.stats.wasted += amount - landed
  obstacle.hp -= landed
  bus.emit('obstacle:damaged', { obstacle, damage: amount })
  if (obstacle.hp > 0) return
  const broke = obstacle.index
  const previous = obstacle.layers[broke]
  obstacle.index++
  ensure?.(state)
  const next = obstacle.layers[obstacle.index]
  if (next) obstacle.hp = next.hp
  else obstacle.cleared = true
  if (obstacle.frozen) {
    // Broken ice is not a layer broken: no score.
    releaseIce(state, obstacle, landsIn)
    bus.emit('obstacle:collapsed', { obstacle, previous, cleared: obstacle.cleared })
    return
  }
  state.broken++
  state.score += Math.round((previous.hp * previous.radius) / 30)
  if (previous.boss) {
    // Endless insight upgrade: enigma -> silhouette -> full, run-wide.
    for (const r of state.runes) r.insight = r.insight === 'none' ? 'shape' : 'full'
  }
  bus.emit('obstacle:collapsed', { obstacle, previous, cleared: obstacle.cleared })
  // A frost layer that falls thaws every piece it froze.
  if (previous.frost) {
    for (const ice of state.obstacles) {
      const by = ice.frozen?.by
      if (ice.cleared || by?.obstacle !== obstacle.id || by.layer !== broke) continue
      ice.index = ice.layers.length
      ice.hp = 0
      ice.cleared = true
      releaseIce(state, ice, landsIn + THAW_LAG)
      bus.emit('ice:thawed', { ice, by: obstacle })
    }
  }
}
