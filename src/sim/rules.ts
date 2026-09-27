import { BURST_GAP } from './constants'
import type { DetonationInfo, SimBus } from './events'
import {
  circleHitsRect,
  circleInRect,
  clampToRect,
  dist,
  footprintRadius,
  middleAngle,
  middleLayer,
  outerAngle,
  outerLayer,
  placedRunes,
} from './geometry'
import type { Obstacle, Rune, SimState, Vec2 } from './types'

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
  for (const other of placedRunes(state)) {
    if (other.id === rune.id) continue
    if (dist(pos, other.pos!) < r + footprintRadius(outerLayer(other)!)) return false
  }
  return true
}

// Nearest uncleared obstacle (any distance) whose current layer has as many
// sides as the rune's middle layer. Ties go to the earlier obstacle.
export function findLink(state: SimState, rune: Rune, pos: Vec2): Obstacle | null {
  const middle = middleLayer(rune)
  if (!middle) return null
  let best: Obstacle | null = null
  let bestD = Infinity
  for (const o of state.obstacles) {
    if (o.cleared || o.layers[o.index]?.sides !== middle.sides) continue
    const d = dist(pos, o.pos)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

export function relinkAll(state: SimState, bus: SimBus): void {
  for (const rune of placedRunes(state)) {
    const id = findLink(state, rune, rune.pos!)?.id ?? null
    if (id !== rune.linkedObstacleId) {
      rune.linkedObstacleId = id
      bus.emit('rune:linked', { rune })
    }
  }
}

export function placeRune(state: SimState, bus: SimBus, rune: Rune, pos: Vec2): void {
  const layer = outerLayer(rune)!
  rune.pos = { ...pos }
  rune.placedAt = state.time
  rune.state = 'charging'
  rune.held = Array.from({ length: layer.sides }, () => null)
  rune.linkedObstacleId = findLink(state, rune, pos)?.id ?? null
  bus.emit('rune:placed', { rune })
}

// Called by the Sim before reading a layer that may not exist yet (endless).
export type EnsureLayers = (state: SimState) => void

export function detonateRune(state: SimState, bus: SimBus, rune: Rune, ensure?: EnsureLayers): void {
  const outer = outerLayer(rune)!
  const pos = rune.pos!
  const obstacle = state.obstacles.find((o) => o.id === rune.linkedObstacleId && !o.cleared) ?? null
  const info: DetonationInfo = {
    pos: { ...pos },
    outer,
    middle: middleLayer(rune),
    outerAngle: outerAngle(rune, state.time),
    middleAngle: middleAngle(rune, state.time),
    damage: obstacle ? outer.sides : 0,
    obstacleId: obstacle?.id ?? null,
    released: [],
    annihilated: [],
  }


  // 2. Resolve each node's mote: annihilate, or recolor and burst outward.
  const annihilate = new Set<string>()
  rune.held.forEach((moteId, i) => {
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
    mote.home = clampToRect(landingPoint(pos, outer.sides, outer.radius, i), state.field, Math.min(mote.tether + 2, state.field.w / 2, state.field.h / 2))
    mote.state = 'ejecting'
    mote.ejectFrom = { ...mote.pos }
    mote.t = 0
    delete mote.runeId
    delete mote.node
    delete mote.travelFrom
    info.released.push(mote.id)
  })
  if (annihilate.size) state.motes = state.motes.filter((m) => !annihilate.has(m.id))

  // 3. The rune leaves the field one layer thinner, or is spent.
  rune.index++
  rune.pos = undefined
  rune.placedAt = undefined
  rune.held = []
  rune.linkedObstacleId = null
  ensure?.(state)
  rune.state = rune.index < rune.layers.length ? 'idle' : 'spent'
  bus.emit('rune:detonated', { rune, info })
  if (rune.state === 'spent') bus.emit('rune:spent', { rune })

  // 4. Damage the obstacle (after the rune has left, so relinking sees the
  //    freed field), then relink everything still on the field.
  if (obstacle) damageObstacle(state, bus, obstacle, outer.sides, ensure)
  relinkAll(state, bus)
}

// Damage never overflows into the next layer. Does not relink; callers do.
export function damageObstacle(state: SimState, bus: SimBus, obstacle: Obstacle, amount: number, ensure?: EnsureLayers): void {
  obstacle.hp = Math.max(0, obstacle.hp - amount)
  bus.emit('obstacle:damaged', { obstacle, damage: amount })
  if (obstacle.hp > 0) return
  const previous = obstacle.layers[obstacle.index]
  obstacle.index++
  ensure?.(state)
  const next = obstacle.layers[obstacle.index]
  if (next) obstacle.hp = next.hp
  else obstacle.cleared = true
  state.score += previous.hp
  bus.emit('obstacle:collapsed', { obstacle, previous, cleared: obstacle.cleared })
}
