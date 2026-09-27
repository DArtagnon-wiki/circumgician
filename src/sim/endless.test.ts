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
