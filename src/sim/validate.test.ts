import { describe, expect, it } from 'vitest'
import { validateLevel } from './validate'
import type { LevelData } from './types'
import { DEBUG_PACK, MANIFEST, PACK } from '../data/levels/pack'

describe('level files', () => {
  it('every manifest entry loads and validates', () => {
    expect(PACK).toHaveLength(MANIFEST.levels.length)
    expect(DEBUG_PACK).toHaveLength(MANIFEST.debug.length)
    for (const level of [...PACK, ...DEBUG_PACK]) expect(validateLevel(level)).toEqual([])
  })

  it('ids are unique and match the manifest order', () => {
    expect(PACK.map((l) => l.id)).toEqual(MANIFEST.levels)
    expect(new Set([...MANIFEST.levels, ...MANIFEST.debug]).size).toBe(MANIFEST.levels.length + MANIFEST.debug.length)
  })

  it('JSON round-trip is lossless', () => {
    for (const level of PACK) expect(JSON.parse(JSON.stringify(level))).toEqual(level)
  })
})

describe('validateLevel', () => {
  const good = () => structuredClone(PACK[0]) as unknown as Record<string, any>

  it('rejects non-objects', () => {
    expect(validateLevel(null)).toEqual(['level: must be an object'])
  })

  it('reports node count mismatch with a precise path', () => {
    const l = good()
    l.hand[0].layers[1].nodes.pop()
    expect(validateLevel(l)).toContain('hand[0].layers[1].nodes: must have exactly 3 entries (one per side)')
  })

  it('rejects generic catch colors', () => {
    const l = good()
    l.hand[0].layers[0].nodes[0].catch = 'generic'
    expect(validateLevel(l).some((e) => e.startsWith('hand[0].layers[0].nodes[0].catch'))).toBe(true)
  })

  it('rejects a field outside the field zone and motes outside the field', () => {
    const l = good()
    l.field = { x: 0, y: 0, w: 100, h: 100 }
    const errs = validateLevel(l)
    expect(errs.some((e) => e.startsWith('field:'))).toBe(true)
    expect(errs.some((e) => e.startsWith('motes[0]:'))).toBe(true)
  })

  it('rejects bad obstacle hp and missing layers', () => {
    const l = good()
    l.obstacles[0].layers[0].hp = 0
    l.obstacles[1].layers = []
    const errs = validateLevel(l)
    expect(errs).toContain('obstacles[0].layers[0].hp: must be an integer >= 1')
    expect(errs).toContain('obstacles[1].layers: needs at least one layer')
  })

  it('accepts ice and frost layers, and checks them', () => {
    const l = good()
    l.obstacles[0].layers[0].frost = true
    l.ice = [{ x: 100, y: 420, sides: 4, motes: ['red', 'generic'] }]
    expect(validateLevel(l)).toEqual([])
    l.obstacles[0].layers[0].frost = 'yes'
    l.ice = [{ x: 10, y: 420, sides: 3, hp: 0, motes: ['red', 'blue', 'gold', 'teal'] }, { x: 200, y: 500, sides: 2, motes: ['pink'] }]
    const errs = validateLevel(l)
    expect(errs).toContain('obstacles[0].layers[0].frost: must be true or false')
    expect(errs).toContain('ice[0]: must lie inside the field')
    expect(errs).toContain('ice[0].hp: must be an integer >= 1')
    expect(errs).toContain('ice[0].motes: holds at most 3 (one per vertex)')
    expect(errs).toContain('ice[1].sides: must be an integer 3..12')
    expect(errs.some((e) => e.startsWith('ice[1].motes[0]:'))).toBe(true)
  })

  it('forbids annihilation in endless levels', () => {
    const l = good()
    l.endless = { seed: 1 }
    l.hand[0].layers[0].nodes[0].release = 'annihilating'
    expect(validateLevel(l)).toContain('hand[0].layers[0].nodes[0].release: endless levels never annihilate')
  })

  it('checks fuses: positive seconds, and never on an endless level', () => {
    const l = good()
    l.fuse = 10
    l.hand[0].layers[0].fuse = 14
    expect(validateLevel(l)).toEqual([])
    l.fuse = 0
    l.hand[0].layers[0].fuse = 'soon'
    const errs = validateLevel(l)
    expect(errs).toContain('fuse: must be a positive number of seconds')
    expect(errs).toContain('hand[0].layers[0].fuse: must be a positive number of seconds')
    l.fuse = 10
    l.endless = { seed: 1 }
    expect(validateLevel(l)).toContain('fuse: endless levels have their own fuse')
  })

  it('accepts a known palette and nothing else', () => {
    const l = good()
    l.palette = 'cool'
    expect(validateLevel(l)).toEqual([])
    l.palette = 'neon'
    expect(validateLevel(l)).toEqual(['palette: must be one of jewel, cool, warm'])
  })

  it("checks an obstacle's look: a known style and motion, and up to four moons", () => {
    const l = good()
    l.obstacles[0].look = { style: 'geode', motion: 'spin', moons: 4 }
    expect(validateLevel(l)).toEqual([])
    l.obstacles[0].look = { style: 'plastic', motion: 'wobble', moons: 5 } as unknown as LevelData['obstacles'][0]['look']
    expect(validateLevel(l)).toEqual([
      'obstacles[0].look.style: must be one of obsidian, marble, magma, void, astrolabe, monolith, geode',
      'obstacles[0].look.motion: must be one of sway, bob, spin, pulse, drift, still',
      'obstacles[0].look.moons: must be an integer from 0 to 4',
    ])
  })
})
