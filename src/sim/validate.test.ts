import { describe, expect, it } from 'vitest'
import { validateLevel } from './validate'
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

  it('forbids annihilation in endless levels', () => {
    const l = good()
    l.endless = { seed: 1 }
    l.hand[0].layers[0].nodes[0].release = 'annihilating'
    expect(validateLevel(l)).toContain('hand[0].layers[0].nodes[0].release: endless levels never annihilate')
  })
})
