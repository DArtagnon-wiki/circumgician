import { describe, expect, it } from 'vitest'
import { endlessLevel, ensureEndlessLayers, obstacleLayerAt, runeLayerAt } from './endless'
import { runCompetent } from './headless'
import { validateLevel } from './validate'
import { Sim } from './Sim'

describe('endless generators', () => {
  it('are pure functions of (seed, depth)', () => {
    expect(runeLayerAt(7, 5)).toEqual(runeLayerAt(7, 5))
    expect(obstacleLayerAt(7, 5)).toEqual(obstacleLayerAt(7, 5))
    expect(runeLayerAt(7, 5)).not.toEqual(runeLayerAt(8, 5))
  })

  it('never annihilate and ramp up slowly', () => {
    for (let d = 0; d < 40; d++) {
      const l = runeLayerAt(3, d)
      expect(l.nodes.every((n) => n.release !== 'annihilating')).toBe(true)
      expect(l.nodes).toHaveLength(l.sides)
    }
    expect(obstacleLayerAt(3, 30).hp).toBeGreaterThan(obstacleLayerAt(3, 0).hp)
    expect(obstacleLayerAt(3, 3).boss).toBe(true)
  })

  it('produce before consume: catches use only hues the pool has had', () => {
    const released = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) {
      for (let d = 0; d < 20; d++) {
        const l = runeLayerAt(seed, d, ['red', 'blue', 'gold'])
        for (const n of l.nodes) {
          expect(['red', 'blue', 'gold']).toContain(n.catch)
          released.add(n.release)
        }
      }
    }
    // New hues still ramp in on the release side.
    expect(released.has('teal')).toBe(true)
    expect(released.has('violet')).toBe(true)
    // Once teal has been seen, deep layers may ask for it.
    const catches = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) runeLayerAt(seed, 6, ['red', 'blue', 'gold', 'teal']).nodes.forEach((n) => catches.add(n.catch))
    expect(catches.has('teal')).toBe(true)
  })

  it('a detonation that releases a new hue adds it to the seen set', () => {
    const sim = new Sim(endlessLevel(5), { seed: 1, ensureLayers: ensureEndlessLayers, lossCheck: false })
    expect(sim.state.seenHues.sort()).toEqual(['blue', 'gold', 'red'])
    const rune = sim.state.runes[0]
    const layer = rune.layers[0]
    layer.nodes.forEach((n) => (n.release = 'teal'))
    const piece = sim.place(rune.id, { x: 200, y: 520 })!
    expect(piece).not.toBeNull()
    // Hold a mote on every node, then detonate.
    sim.state.motes.slice(0, layer.sides).forEach((m, i) => {
      m.state = 'held'
      m.pieceId = piece.id
      m.node = i
      piece.held[i] = m.id
    })
    piece.state = 'full'
    sim.detonate(piece.id)
    expect(sim.state.seenHues).toContain('teal')
  })

  it('obstacles always have their next layer ready (for the outline)', () => {
    const sim = new Sim(endlessLevel(9), { seed: 1, ensureLayers: ensureEndlessLayers })
    for (const o of sim.state.obstacles) expect(o.layers.length).toBeGreaterThanOrEqual(o.index + 2)
    sim.debugCollapseAll()
    for (const o of sim.state.obstacles) expect(o.layers.length).toBeGreaterThanOrEqual(o.index + 2)
  })

  it('builds a valid level whose stacks extend forever', () => {
    const level = endlessLevel(42)
    expect(validateLevel(level)).toEqual([])
    const sim = new Sim(level, { seed: 1, ensureLayers: ensureEndlessLayers })
    const o = sim.state.obstacles[0]
    for (let i = 0; i < 10; i++) sim.debugCollapseAll()
    expect(o.index).toBe(10)
    expect(o.cleared).toBe(false)
    expect(sim.state.status).toBe('playing')
    expect(sim.state.broken).toBe(30)
    expect(sim.state.runes[0].insight).not.toBe('none') // bosses were broken
  })
})

describe('endless run length (competent agent)', () => {
  it('typically lasts a couple of minutes', () => {
    const times: number[] = []
    const broken: number[] = []
    for (let seed = 1; seed <= 16; seed++) {
      const res = runCompetent(endlessLevel(seed), seed, 900, { ensureLayers: ensureEndlessLayers })
      times.push(res.time)
      broken.push(res.sim.state.broken)
    }
    times.sort((a, b) => a - b)
    const median = times[Math.floor(times.length / 2)]
    console.log('endless times', times.map((t) => Math.round(t)).join(' '), '| broken', broken.join(' '), '| median', Math.round(median))
    expect(median).toBeGreaterThan(60)
    expect(median).toBeLessThan(600)
  })
})
