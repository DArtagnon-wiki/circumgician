import { BURST_GAP, DEFAULT_TETHER, EJECT_TIME, FOOTPRINT_MARGIN, THAW_LAG } from './constants'
import type { DetonationInfo, SimBus } from './events'
import { circleHitsRect, circleInRect, clampToRect, dist, footprintRadius, iceSpots, middleAngle, middleLayer, nodePositions, outerAngle, outerLayer, strikeTime } from './geometry'
import { addsPower, isHue } from '../model/Color'
import type { Hue, Mote, MoteColor, Obstacle, ObstacleLayerSpec, Piece, Rune, RuneLayerSpec, ShieldSpec, SimState, Vec2 } from './types'

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

// Does a layer take a blow of this shape: its own, or on a two-shape layer
// either of its two?
const takesShape = (layer: ObstacleLayerSpec, sides: number) => layer.sides === sides || layer.pair === sides

// The piece in stasis holding the place for this shape on an obstacle's
// two-shape layer (other than `except`), if one is.
function holderOf(state: SimState, obstacle: Obstacle, sides: number, except?: Piece): Piece | undefined {
  return state.pieces.find((p) => p !== except && p.stasis !== undefined && p.linkedObstacleId === obstacle.id && p.energy.sides === sides)
}

// The shields still up on an obstacle's current layer.
export function upShields(o: Obstacle): ShieldSpec[] {
  return (o.layers[o.index]?.shields ?? []).filter((_, i) => !o.down?.includes(i))
}

// While any shield is up, nothing strikes the layer.
export const guarded = (o: Obstacle): boolean => upShields(o).length > 0

// A piece with a bowl of a shield's color that is still up pulls there.
export function canPull(glass: RuneLayerSpec | undefined, o: Obstacle): boolean {
  return !!glass && upShields(o).some((sh) => glass.nodes.some((n) => n.catch === sh.color))
}

// A shield's pull so far: the motes that count (its color or opal) held in
// its pullers' bowls of its color.
export function shieldPull(state: SimState, o: Obstacle, color: Hue): number {
  let pull = 0
  for (const p of state.pieces) {
    if (p.pulling === undefined || p.linkedObstacleId !== o.id) continue
    p.held.forEach((id, i) => {
      if (id === null || p.layer.nodes[i].catch !== color) return
      const mote = state.motes.find((m) => m.id === id)
      if (mote?.state === 'held' && addsPower(mote.color)) pull++
    })
  }
  return pull
}

// Can a blow of this shape strike the obstacle now: no shield up, and the
// layer takes the shape (on a two-shape layer, while no other piece holds
// that shape's place in stasis)?
function canStrike(state: SimState, o: Obstacle, sides: number, self?: Piece): boolean {
  const layer = o.layers[o.index]
  if (!layer || guarded(o) || !takesShape(layer, sides)) return false
  return layer.pair === undefined || !holderOf(state, o, sides, self)
}

// Nearest uncleared obstacle (any distance) the piece can pull at (a
// shield up of a color its glass catches) or strike (see canStrike). Ties
// go to the earlier obstacle. `self` is the piece asking, whose own place
// doesn't count against it.
export function findLink(state: SimState, glass: RuneLayerSpec | undefined, energy: RuneLayerSpec | undefined, pos: Vec2, self?: Piece): Obstacle | null {
  if (!energy) return null
  let best: Obstacle | null = null
  let bestD = Infinity
  for (const o of state.obstacles) {
    if (o.cleared || !(canPull(glass, o) || canStrike(state, o, energy.sides, self))) continue
    const d = dist(pos, o.pos)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

// Every piece not locked on (in stasis or pulling) links to its nearest
// match, latching on at once where it pulls. A full piece that links to a
// two-shape layer takes up stasis there, which can move others off that
// place, so links settle in rounds (each puts one more piece in stasis, so
// they end).
export function relinkAll(state: SimState, bus: SimBus): void {
  for (;;) {
    for (const piece of state.pieces) {
      if (piece.stasis !== undefined || piece.pulling !== undefined) continue
      const o = findLink(state, piece.layer, piece.energy, piece.pos, piece)
      const id = o?.id ?? null
      if (id !== piece.linkedObstacleId) {
        piece.linkedObstacleId = id
        bus.emit('piece:linked', { piece })
      }
      if (o && canPull(piece.layer, o)) startPulling(state, bus, piece)
    }
    if (!enterStasis(state, bus)) return
  }
}

const linkedTo = (state: SimState, piece: Piece): Obstacle | null => state.obstacles.find((o) => o.id === piece.linkedObstacleId && !o.cleared) ?? null

// Latched onto a shielded layer: no fuse, no burst, until the layer falls.
function startPulling(state: SimState, bus: SimBus, piece: Piece): void {
  piece.pulling = state.time
  delete piece.burnAt
  delete piece.freezeAt
  bus.emit('piece:pulling', { piece })
}

// Shields whose pullers now hold enough of their color come down. Once the
// last is down the layer can be struck, so pieces relink.
export function updateShields(state: SimState, bus: SimBus): void {
  let fell = false
  for (const o of state.obstacles) {
    const shields = o.layers[o.index]?.shields
    if (o.cleared || !shields) continue
    shields.forEach((sh, i) => {
      if (o.down?.includes(i) || shieldPull(state, o, sh.color) < sh.strength) return
      o.down = [...(o.down ?? []), i]
      bus.emit('shield:down', { obstacle: o, index: i })
      fell = true
    })
  }
  if (fell) relinkAll(state, bus)
}

// Full pieces linked to a two-shape layer go into stasis there, one per
// shape (the first in cast order wins a contested place): the fuse goes
// out, the spin stops, and each waits for the other shape's piece. Returns
// whether any did; callers relink (see relinkAll).
export function enterStasis(state: SimState, bus: SimBus): boolean {
  let any = false
  for (const piece of state.pieces) {
    if (piece.state !== 'full' || piece.stasis !== undefined) continue
    const o = linkedTo(state, piece)
    if (!o || o.layers[o.index]?.pair === undefined || holderOf(state, o, piece.energy.sides, piece)) continue
    piece.stasis = state.time
    delete piece.burnAt
    delete piece.freezeAt
    bus.emit('piece:stasis', { piece })
    any = true
  }
  return any
}

// Let go when the layer it was locked onto falls (a puller's, or one in
// stasis whose layer fell to something else): back in play, spinning, with
// a fresh fuse. Callers relink.
function release(state: SimState, bus: SimBus, piece: Piece): void {
  if (piece.stasis !== undefined) piece.stillFor = (piece.stillFor ?? 0) + state.time - piece.stasis
  delete piece.stasis
  delete piece.pulling
  if (piece.freezeFor !== undefined) piece.freezeAt = state.time + piece.freezeFor
  if (piece.burnFor !== undefined) piece.burnAt = state.time + piece.burnFor
  bus.emit('piece:released', { piece })
}

// The partner a piece in stasis waits for: the other shape's piece in
// stasis on the same layer.
export function partnerOf(state: SimState, piece: Piece): Piece | null {
  if (piece.stasis === undefined) return null
  return state.pieces.find((p) => p !== piece && p.stasis !== undefined && p.linkedObstacleId === piece.linkedObstacleId && p.energy.sides !== piece.energy.sides) ?? null
}

// Can the player burst this piece now? Once full, unless it is pulling, or
// waits in stasis for a partner (with both there, either bursts the pair).
export function canFire(state: SimState, piece: Piece): boolean {
  return piece.state === 'full' && piece.pulling === undefined && (piece.stasis === undefined || partnerOf(state, piece) !== null)
}

// Called by the Sim before reading a layer that may not exist yet (endless).
export type EnsureLayers = (state: SimState) => void

// The layer in hand goes onto the field as a piece, and the rune brings its
// next layer into hand at once; when that next entry is the stack's last
// (a target shape only), the rune is spent instead.
// Fuses, in seconds from the cast: `freeze` (endless) turns the piece to
// ice, `burn` (a level's fuse, or the layer's own) burns it away.
export interface Fuses {
  freeze?: number
  burn?: number
}

export function castRune(state: SimState, bus: SimBus, rune: Rune, pos: Vec2, ensure?: EnsureLayers, fuses: Fuses = {}): Piece {
  const layer = outerLayer(rune)!
  const burn = layer.fuse ?? fuses.burn
  const energy = middleLayer(rune)!
  const link = findLink(state, layer, energy, pos)
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
    linkedObstacleId: link?.id ?? null,
    ...(fuses.freeze !== undefined ? { freezeAt: state.time + fuses.freeze, freezeFor: fuses.freeze } : {}),
    ...(burn !== undefined ? { burnAt: state.time + burn, burnFor: burn } : {}),
  }
  state.pieces.push(piece)
  // Prefilled cups come with their motes already in them.
  const at = nodePositions(piece, state.time)
  layer.nodes.forEach((node, i) => {
    if (!node.prefilled) return
    const color: MoteColor = node.prefilled === 'real' ? node.catch : node.prefilled
    const mote: Mote = { id: `mote-${state.nextId++}`, color, home: { ...at[i] }, tether: DEFAULT_TETHER, pos: { ...at[i] }, wander: { ...at[i] }, state: 'held', pieceId: piece.id, node: i }
    state.motes.push(mote)
    piece.held[i] = mote.id
  })
  rune.index++
  ensure?.(state)
  if (!outerLayer(rune)) rune.state = 'spent'
  bus.emit('piece:cast', { piece, rune })
  if (rune.state === 'spent') bus.emit('rune:spent', { rune })
  if (link && canPull(layer, link)) startPulling(state, bus, piece)
  if (piece.held.every((id) => id !== null)) {
    piece.state = 'full'
    bus.emit('piece:full', { piece })
    if (enterStasis(state, bus)) relinkAll(state, bus)
  }
  // Its prefilled motes may already pull a shield down.
  updateShields(state, bus)
  return piece
}

// A blow's power: the motes it holds that count (its own colors and opal;
// nulls and voids fill a bowl but add nothing).
export function blowPower(state: SimState, piece: Piece): number {
  let power = 0
  for (const id of piece.held) {
    const mote = id === null ? undefined : state.motes.find((m) => m.id === id)
    if (mote && addsPower(mote.color)) power++
  }
  return power
}

// A strike on a frost layer that leaves it standing is caught by the frost:
// the piece freezes where it stood into ice of its own shape, holding the
// motes it transformed (see damageObstacle for the thaw).
function frostbites(obstacle: Obstacle | null, blow: number): obstacle is Obstacle {
  return !!obstacle && !obstacle.frozen && !!obstacle.layers[obstacle.index]?.frost && blow < obstacle.hp
}

// Bursts a piece. One in stasis bursts with its partner, as one blow of
// their combined power.
export function detonatePiece(state: SimState, bus: SimBus, piece: Piece, ensure?: EnsureLayers): void {
  const partner = partnerOf(state, piece)
  const blow = partner ? [piece, partner] : [piece]
  const linked = linkedTo(state, piece)
  // Nothing strikes a shielded layer, or a two-shape layer alone (only a
  // debug burst gets here).
  const obstacle = linked && !guarded(linked) && (partner || linked.layers[linked.index]?.pair === undefined) ? linked : null
  const power = blow.reduce((sum, p) => sum + blowPower(state, p), 0)
  const ice = !partner && frostbites(obstacle, power) ? newIce(state, piece.pos, piece.layer.sides, piece.layer.radius, { obstacle: obstacle.id, layer: obstacle.index }) : null

  // 1. Resolve each node's mote: annihilate, or recolor and burst outward
  //    (or, frostbitten, stay locked in the ice where its node stood).
  const annihilate = new Set<string>()
  const discovered: { hue: Hue; mote: Mote }[] = []
  const bursts = blow.map((p) => {
    const outer = p.layer
    const pos = p.pos
    const spots = ice ? iceSpots(pos, outer.sides, outer.radius) : []
    const info: DetonationInfo = {
      pos: { ...pos },
      outer,
      energy: p.energy,
      outerAngle: outerAngle(p, state.time),
      energyAngle: middleAngle(p, state.time),
      damage: obstacle ? power : 0,
      obstacleId: obstacle?.id ?? null,
      released: [],
      annihilated: [],
      ...(ice ? { frozeInto: ice.id } : {}),
      ...(partner ? { partner: (p === piece ? partner : piece).id } : {}),
    }
    p.held.forEach((moteId, i) => {
      if (moteId === null) return
      const mote = state.motes.find((m) => m.id === moteId)
      if (!mote) return
      const release = outer.nodes[i].release
      if (release === 'annihilating') {
        annihilate.add(mote.id)
        info.annihilated.push(mote.id)
        return
      }
      // A void never changes; every other mote takes the bowl's output.
      if (mote.color !== 'void') mote.color = release
      if (isHue(mote.color) && !state.seenHues.includes(mote.color)) {
        state.seenHues.push(mote.color)
        discovered.push({ hue: mote.color, mote })
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
    return { piece: p, info }
  })
  if (annihilate.size) state.motes = state.motes.filter((m) => !annihilate.has(m.id))
  state.stats.detonations += blow.length
  state.stats.destroyed += annihilate.size
  if (!obstacle) state.stats.unlinked += blow.length

  // 2. The pieces are used up (or frozen solid).
  state.pieces = state.pieces.filter((p) => !blow.includes(p))
  if (ice) state.obstacles.push(ice)
  for (const b of bursts) bus.emit('piece:detonated', b)
  for (const d of discovered) bus.emit('hue:discovered', d)

  // 3. Damage the obstacle when the last blow lands (after the pieces have
  //    left, so relinking sees the freed field), then relink everything
  //    still on the field.
  if (obstacle) damageObstacle(state, bus, obstacle, power, ensure, Math.max(...blow.map((p) => strikeTime(p.pos, obstacle.pos))))
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

// A piece whose fuse ran out before it was burst burns away: the layer is
// spent without striking, and the motes it holds (or was drawing in) burn
// with it. The rune already holds its next layer.
export function burnPiece(state: SimState, bus: SimBus, piece: Piece): void {
  const ids = new Set(piece.held.filter((id): id is string => id !== null))
  const motes = state.motes.filter((m) => ids.has(m.id))
  state.motes = state.motes.filter((m) => !ids.has(m.id))
  state.pieces = state.pieces.filter((p) => p !== piece)
  state.stats.burned++
  state.stats.destroyed += motes.length
  bus.emit('piece:burned', { piece, motes })
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
  // Its shields go with it, and the pieces locked onto it (pulling, or in
  // stasis) go back into play.
  delete obstacle.down
  for (const p of state.pieces) if ((p.stasis !== undefined || p.pulling !== undefined) && p.linkedObstacleId === obstacle.id) release(state, bus, p)
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
