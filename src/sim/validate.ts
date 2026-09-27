import { FIELD_ZONE, OBSTACLE_ZONE } from './constants'
import type { LevelData, Rect } from './types'

const HUES = ['red', 'blue', 'gold', 'teal', 'violet']
const MOTE_COLORS = [...HUES, 'generic']
const RELEASES = [...MOTE_COLORS, 'annihilating']
const INSIGHTS = ['none', 'shape', 'full']
export const MIN_SIDES = 3
export const MAX_SIDES = 12

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
      })
    })
  }

  if (!Array.isArray(data.hand)) err('hand', 'must be an array')
  else {
    if (data.hand.length === 0) err('hand', 'needs at least one rune')
    data.hand.forEach((r, i) => {
      const p = `hand[${i}]`
      if (!isObj(r)) return err(p, 'must be an object')
      if (r.insight !== undefined && !INSIGHTS.includes(r.insight as string)) err(`${p}.insight`, `must be one of ${INSIGHTS.join(', ')}`)
      if (!Array.isArray(r.layers) || (r.layers.length === 0 && !data.endless)) return err(`${p}.layers`, 'needs at least one layer')
      r.layers.forEach((l, j) => {
        const lp = `${p}.layers[${j}]`
        if (!isObj(l)) return err(lp, 'must be an object')
        const okSides = sides(`${lp}.sides`, l.sides)
        if (!isNum(l.radius) || l.radius <= 0) err(`${lp}.radius`, 'must be a positive number')
        if (!Array.isArray(l.nodes)) return err(`${lp}.nodes`, 'must be an array')
        if (okSides && l.nodes.length !== l.sides) err(`${lp}.nodes`, `must have exactly ${l.sides} entries (one per side)`)
        l.nodes.forEach((n, k) => {
          const np = `${lp}.nodes[${k}]`
          if (!isObj(n)) return err(np, 'must be an object')
          if (!HUES.includes(n.catch as string)) err(`${np}.catch`, `must be a hue (${HUES.join(', ')})`)
          if (!RELEASES.includes(n.release as string)) err(`${np}.release`, `must be one of ${RELEASES.join(', ')}`)
          if (data.endless && n.release === 'annihilating') err(`${np}.release`, 'endless levels never annihilate')
        })
      })
    })
  }

  if (!isObj(data.goal) || data.goal.type !== 'clearAll') err('goal', 'must be {"type": "clearAll"}')
  if (data.endless !== undefined && (!isObj(data.endless) || !isInt(data.endless.seed))) err('endless', 'must be {"seed": integer}')

  return errs
}

export function parseLevel(data: unknown): LevelData {
  const errors = validateLevel(data)
  if (errors.length) throw new LevelValidationError(errors)
  return data as LevelData
}
