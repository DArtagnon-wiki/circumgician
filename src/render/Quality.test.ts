import { beforeEach, describe, expect, it } from 'vitest'
import { QualityGovernor, TIERS, quality, type Tier } from './Quality'

// Feeds `seconds` worth of frames of `ms` each.
function run(g: QualityGovernor, ms: number, seconds: number): void {
  for (let t = 0; t < seconds * 1000; t += ms) g.sample(ms)
}

describe('quality governor', () => {
  let changes: Tier[]
  let g: QualityGovernor

  beforeEach(() => {
    quality.tier = 2
    quality.settings = TIERS[2]
    changes = []
    g = new QualityGovernor((t) => changes.push(t))
  })

  it('holds full detail at 60fps', () => {
    run(g, 16.7, 30)
    expect(quality.tier).toBe(2)
    expect(changes).toEqual([])
  })

  it('drops one tier after about two seconds of slow frames, then another', () => {
    run(g, 25, 1) // warm-up is ignored
    run(g, 25, 1.9)
    expect(quality.tier).toBe(2)
    run(g, 25, 0.6)
    expect(quality.tier).toBe(1)
    expect(quality.settings).toBe(TIERS[1])
    run(g, 25, 2.2)
    expect(quality.tier).toBe(0)
    expect(changes).toEqual([1, 0])
  })

  it('ignores hitches such as tab switches', () => {
    run(g, 16.7, 1)
    for (let i = 0; i < 20; i++) {
      g.sample(800)
      run(g, 16.7, 0.5)
    }
    expect(quality.tier).toBe(2)
  })

  it('climbs back after a sustained fast stretch', () => {
    run(g, 25, 4)
    expect(quality.tier).toBe(1)
    run(g, 16.7, 6)
    expect(quality.tier).toBe(1)
    run(g, 16.7, 6)
    expect(quality.tier).toBe(2)
  })

  it('waits twice as long before retrying a tier that just failed', () => {
    run(g, 25, 4)
    run(g, 16.7, 12)
    expect(quality.tier).toBe(2) // climbed
    run(g, 25, 2.5)
    expect(quality.tier).toBe(1) // ...and failed again at once
    run(g, 16.7, 12)
    expect(quality.tier).toBe(1) // not retried as soon as the first time
    run(g, 16.7, 6)
    expect(quality.tier).toBe(2)
  })

  it('holds a pinned tier regardless of frame times', () => {
    g.pin(1)
    run(g, 40, 10)
    expect(quality.tier).toBe(1)
    g.pin(null)
    run(g, 40, 3)
    expect(quality.tier).toBe(0)
  })
})

describe('quality governor recovery', () => {
  beforeEach(() => {
    quality.tier = 1
    quality.settings = TIERS[1]
  })

  it('still climbs back through an occasional GC pause', () => {
    const g = new QualityGovernor()
    run(g, 16.7, 1) // warm-up
    // 60fps with one 40ms frame every 2 seconds: each pause briefly lifts
    // the short average over the slow line, which must not reset the climb.
    for (let t = 0; t < 8; t += 2) {
      run(g, 16.7, 1.96)
      g.sample(40)
    }
    expect(quality.tier).toBe(2)
  })

  it('does not climb while frames keep dropping', () => {
    const g = new QualityGovernor()
    run(g, 16.7, 1)
    // Two long frames every second: about 57fps.
    for (let t = 0; t < 30; t += 1) {
      run(g, 16.7, 0.92)
      g.sample(40)
      g.sample(40)
    }
    expect(quality.tier).toBe(1)
  })
})
