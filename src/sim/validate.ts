import { PALETTE_NAMES } from '../model/Color'
import { MAX_MOONS, OBSTACLE_MOTIONS, OBSTACLE_STYLES } from '../model/Look'
import { FIELD_ZONE, ICE_RADIUS, OBSTACLE_ZONE } from './constants'
import { circleInRect } from './geometry'
import type { LevelData, Rect } from './types'

const HUES = ['red', 'blue', 'gold', 'teal', 'violet']
const MOTE_COLORS = [...HUES, 'generic', 'null', 'void']
const PREFILLS = ['real', 'null', 'void']
const RELEASES = [...MOTE_COLORS, 'annihilating']
const INSIGHTS = ['none', 'shape', 'full']
export const MIN_SIDES = 3
export const MAX_SIDES = 12
// A hand fits the shelf readably at up to six runes (see handLayout).
export const MAX_HAND = 6

export class LevelValidationError extends Error {
  readonly errors: string[]
  constructor(errors: string[]) {
    super(`Invalid level:\n  ${errors.join('\n  ')}`)
    this.errors = errors
  }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isInt = (v: unknown): v is number => Number.isInteger(v)

export function rectInside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
}

// Hand-rolled (no schema dependency). Returns every problem found, each with
// a JSON-path-ish location, so the editor can show them inline.
export function validateLevel(data: unknown): string[] {
  const errs: string[] = []
  const err = (path: string, msg: string) => errs.push(`${path}: ${msg}`)

  if (!isObj(data)) return ['level: must be an object']
  if (data.version !== 1) err('version', 'must be 1')
  if (typeof data.id !== 'string' || !/^[a-z0-9-]+$/.test(data.id)) err('id', 'must be a lowercase slug')
  if (typeof data.name !== 'string' || !data.name.trim()) err('name', 'must be a non-empty string')

  const rect = (path: string, v: unknown): Rect | null => {
    if (!isObj(v) || !isNum(v.x) || !isNum(v.y) || !isNum(v.w) || !isNum(v.h)) {
      err(path, 'must be {x, y, w, h} numbers')
      return null
    }
    if (v.w <= 0 || v.h <= 0) err(path, 'w and h must be positive')
    return v as unknown as Rect
  }

  const field = rect('field', data.field)
  if (field && !rectInside(field, FIELD_ZONE)) err('field', `must lie inside the field zone ${JSON.stringify(FIELD_ZONE)}`)

  if (!Array.isArray(data.blockers)) err('blockers', 'must be an array')
  else
    data.blockers.forEach((b, i) => {
      const r = rect(`blockers[${i}]`, b)
      if (r && field && !rectInside(r, field)) err(`blockers[${i}]`, 'must lie inside the field')
    })

  if (!Array.isArray(data.motes)) err('motes', 'must be an array')
  else
    data.motes.forEach((m, i) => {
      const p = `motes[${i}]`
      if (!isObj(m)) return err(p, 'must be an object')
      if (!MOTE_COLORS.includes(m.color as string)) err(`${p}.color`, `must be one of ${MOTE_COLORS.join(', ')}`)
      if (!isNum(m.x) || !isNum(m.y)) err(p, 'x and y must be numbers')
      else if (field && (m.x < field.x || m.x > field.x + field.w || m.y < field.y || m.y > field.y + field.h))
        err(p, 'must lie inside the field')
      if (m.tether !== undefined && (!isNum(m.tether) || m.tether < 0)) err(`${p}.tether`, 'must be a number >= 0')
    })

  const sides = (path: string, v: unknown): boolean => {
    if (!isInt(v) || (v as number) < MIN_SIDES || (v as number) > MAX_SIDES) {
      err(path, `must be an integer ${MIN_SIDES}..${MAX_SIDES}`)
      return false
    }
    return true
  }

  if (!Array.isArray(data.obstacles)) err('obstacles', 'must be an array')
  else {
    if (data.obstacles.length === 0 && !data.endless) err('obstacles', 'needs at least one obstacle')
    data.obstacles.forEach((o, i) => {
      const p = `obstacles[${i}]`
      if (!isObj(o)) return err(p, 'must be an object')
      if (!isNum(o.x) || !isNum(o.y)) err(p, 'x and y must be numbers')
      else if (o.x < OBSTACLE_ZONE.x || o.x > OBSTACLE_ZONE.x + OBSTACLE_ZONE.w || o.y < OBSTACLE_ZONE.y || o.y > OBSTACLE_ZONE.y + OBSTACLE_ZONE.h)
        err(p, 'must lie inside the obstacle zone')
      if (!Array.isArray(o.layers) || (o.layers.length === 0 && !data.endless)) return err(`${p}.layers`, 'needs at least one layer')
      o.layers.forEach((l, j) => {
        const lp = `${p}.layers[${j}]`
        if (!isObj(l)) return err(lp, 'must be an object')
        sides(`${lp}.sides`, l.sides)
        if (!isNum(l.radius) || l.radius <= 0) err(`${lp}.radius`, 'must be a positive number')
        if (!isInt(l.hp) || (l.hp as number) < 1) err(`${lp}.hp`, 'must be an integer >= 1')
        if (l.frost !== undefined && typeof l.frost !== 'boolean') err(`${lp}.frost`, 'must be true or false')
      })
      if (o.look !== undefined) {
        const look = o.look
        if (!isObj(look)) return err(`${p}.look`, 'must be an object')
        if (look.style !== undefined && !(OBSTACLE_STYLES as readonly unknown[]).includes(look.style)) err(`${p}.look.style`, `must be one of ${OBSTACLE_STYLES.join(', ')}`)
        if (look.motion !== undefined && !(OBSTACLE_MOTIONS as readonly unknown[]).includes(look.motion)) err(`${p}.look.motion`, `must be one of ${OBSTACLE_MOTIONS.join(', ')}`)
        if (look.moons !== undefined && (!isInt(look.moons) || (look.moons as number) < 0 || (look.moons as number) > MAX_MOONS)) err(`${p}.look.moons`, `must be an integer from 0 to ${MAX_MOONS}`)
      }
    })
  }

  if (data.ice !== undefined && !Array.isArray(data.ice)) err('ice', 'must be an array')
  else if (Array.isArray(data.ice))
    data.ice.forEach((b, i) => {
      const p = `ice[${i}]`
      if (!isObj(b)) return err(p, 'must be an object')
      const okSides = sides(`${p}.sides`, b.sides)
      if (b.radius !== undefined && (!isNum(b.radius) || b.radius <= 0)) err(`${p}.radius`, 'must be a positive number')
      if (b.hp !== undefined && (!isInt(b.hp) || (b.hp as number) < 1)) err(`${p}.hp`, 'must be an integer >= 1')
      const r = isNum(b.radius) ? b.radius : ICE_RADIUS
      if (!isNum(b.x) || !isNum(b.y)) err(p, 'x and y must be numbers')
      else if (field && !circleInRect({ x: b.x, y: b.y }, r, field)) err(p, 'must lie inside the field')
      if (b.motes === undefined) return
      if (!Array.isArray(b.motes)) return err(`${p}.motes`, 'must be an array')
      if (okSides && b.motes.length > (b.sides as number)) err(`${p}.motes`, `holds at most ${b.sides} (one per vertex)`)
      b.motes.forEach((c, k) => {
        if (!MOTE_COLORS.includes(c as string)) err(`${p}.motes[${k}]`, `must be one of ${MOTE_COLORS.join(', ')}`)
      })
    })

  if (!Array.isArray(data.hand)) err('hand', 'must be an array')
  else {
    if (data.hand.length === 0) err('hand', 'needs at least one rune')
    if (data.hand.length > MAX_HAND) err('hand', `holds at most ${MAX_HAND} runes (deeper stacks instead)`)
    data.hand.forEach((r, i) => {
      const p = `hand[${i}]`
      if (!isObj(r)) return err(p, 'must be an object')
      if (r.insight !== undefined && !INSIGHTS.includes(r.insight as string)) err(`${p}.insight`, `must be one of ${INSIGHTS.join(', ')}`)
      // A layer to cast and the shape it strikes (endless stacks are generated).
      if (!Array.isArray(r.layers) || (r.layers.length < 2 && !data.endless)) return err(`${p}.layers`, 'needs at least two layers: one to cast, and the shape it strikes')
      r.layers.forEach((l, j) => {
        const lp = `${p}.layers[${j}]`
        if (!isObj(l)) return err(lp, 'must be an object')
        const okSides = sides(`${lp}.sides`, l.sides)
        if (!isNum(l.radius) || l.radius <= 0) err(`${lp}.radius`, 'must be a positive number')
        if (l.fuse !== undefined && (!isNum(l.fuse) || l.fuse <= 0)) err(`${lp}.fuse`, 'must be a positive number of seconds')
        if (!Array.isArray(l.nodes)) return err(`${lp}.nodes`, 'must be an array')
        if (okSides && l.nodes.length !== l.sides) err(`${lp}.nodes`, `must have exactly ${l.sides} entries (one per side)`)
        l.nodes.forEach((n, k) => {
          const np = `${lp}.nodes[${k}]`
          if (!isObj(n)) return err(np, 'must be an object')
          if (!HUES.includes(n.catch as string)) err(`${np}.catch`, `must be a hue (${HUES.join(', ')})`)
          if (!RELEASES.includes(n.release as string)) err(`${np}.release`, `must be one of ${RELEASES.join(', ')}`)
          if (n.prefilled !== undefined && !PREFILLS.includes(n.prefilled as string)) err(`${np}.prefilled`, `must be one of ${PREFILLS.join(', ')}`)
          if (data.endless && n.release === 'annihilating') err(`${np}.release`, 'endless levels never annihilate')
        })
      })
    })
  }

  if (!isObj(data.goal) || data.goal.type !== 'clearAll') err('goal', 'must be {"type": "clearAll"}')
  if (data.endless !== undefined && (!isObj(data.endless) || !isInt(data.endless.seed))) err('endless', 'must be {"seed": integer}')
  if (data.palette !== undefined && !(PALETTE_NAMES as readonly unknown[]).includes(data.palette)) err('palette', `must be one of ${PALETTE_NAMES.join(', ')}`)
  if (data.fuse !== undefined) {
    if (!isNum(data.fuse) || data.fuse <= 0) err('fuse', 'must be a positive number of seconds')
    if (data.endless !== undefined) err('fuse', 'endless levels have their own fuse')
  }

  return errs
}

export function parseLevel(data: unknown): LevelData {
  const errors = validateLevel(data)
  if (errors.length) throw new LevelValidationError(errors)
  return data as LevelData
}
