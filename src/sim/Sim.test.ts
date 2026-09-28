import { describe, expect, it } from 'vitest'
import { Sim, type SimOptions } from './Sim'
import { BURST_GAP, REACH } from './constants'
import { dist, nodePositions } from './geometry'
import { layer, mote, obstacle, ring, testLevel } from './testFixtures'
import { runScript } from './headless'
import { DEBUG_PACK } from '../data/levels/pack'
import type { LevelData } from './types'

const DT = 1 / 30
const C = { x: 200, y: 500 }
const mk = (level: LevelData, opts: SimOptions = {}) => new Sim(level, { lossCheck: false, ...opts })

function stepFor(sim: Sim, seconds: number) {
  for (let t = 0; t < seconds; t += DT) sim.step(DT)
}
function placeSlot(sim: Sim, slot: number, at = C) {
  const rune = sim.state.runes.find((r) => r.slot === slot)!
  expect(sim.place(rune.id, at)).toBe(true)
  return rune.id
}

describe('catch ring', () => {
  const level = testLevel({
    hand: [{ layers: [layer(4, 40, 'red'), layer(3, 30, 'red')] }],
    motes: [mote('red', C.x + 40, C.y), mote('red', C.x, C.y), mote('red', C.x + 40 + REACH + 20, C.y), mote('blue', C.x - 40, C.y)],
  })

  it('catches only matching motes inside the swept ring', () => {
    const sim = mk(level)
    const id = placeSlot(sim, 0)
    stepFor(sim, 8)
    const [onRing, center, beyond, blue] = sim.state.motes
    expect(onRing.state).toBe('held')
    expect(onRing.runeId).toBe(id)
    expect(center.state).toBe('held') // pushed out of the body, through the ring
    expect(beyond.state).toBe('free')
    expect(blue.state).toBe('free')
  })

  it('pulls a catchable mote inside the body straight to a node', () => {
    // 15px off-center: some node of the square is always within pull range.
    const sim = mk(testLevel({ hand: level.hand, motes: [mote('red', C.x + 15, C.y)] }))
    placeSlot(sim, 0)
    const m = sim.state.motes[0]
    let maxD = 0
    for (let t = 0; t < 4 && m.state === 'free'; t += DT) {
      sim.step(DT)
      maxD = Math.max(maxD, dist(m.pos, C))
    }
    expect(m.state).not.toBe('free') // claimed (traveling or held)
    expect(maxD).toBeLessThanOrEqual(40 + REACH) // never left the body first
  })

  it('a full rune has no hungry nodes, so even matching motes are pushed out', () => {
    const sim = mk(testLevel({ hand: level.hand, motes: [...ring('red', C.x, C.y, 40, 4), mote('red', C.x + 3, C.y + 2)] }))
    const id = placeSlot(sim, 0)
    const inner = sim.state.motes[4]
    // Fill from the ring first: hold the inner mote still until the rune is full.
    for (let t = 0; t < 15 && sim.rune(id)!.state !== 'full'; t += DT) {
      inner.pos = { x: C.x + 3, y: C.y + 2 }
      delete inner.vel
      sim.step(DT)
    }
    expect(sim.rune(id)!.state).toBe('full')
    expect(inner.state).toBe('free')
    stepFor(sim, 6)
    expect(inner.state).toBe('free')
    expect(dist(inner.home, C)).toBeGreaterThanOrEqual(40 - REACH / 2)
  })

  it('pushes uncaptured motes out of the rune body, where they settle', () => {
    const sim = mk(testLevel({ hand: level.hand, motes: [mote('blue', C.x + 5, C.y + 3), mote('blue', C.x - 20, C.y)] }))
    placeSlot(sim, 0)
    stepFor(sim, 10)
    for (const m of sim.state.motes) {
      expect(m.state).toBe('free')
      expect(m.vel).toBeUndefined()
      expect(dist(m.home, C)).toBeGreaterThanOrEqual(40 - REACH / 2)
    }
  })

  it('generic motes satisfy any catch color', () => {
    const sim = mk(testLevel({ hand: level.hand, motes: [mote('generic', C.x - 40, C.y)] }))
    placeSlot(sim, 0)
    stepFor(sim, 8)
    expect(sim.state.motes[0].state).toBe('held')
  })
})

describe('kick', () => {
  const one = () => mk(testLevel({ hand: [{ layers: [layer(4, 40, 'red')] }], motes: [mote('red', 200, 500)] }))

  it('shoves the mote directly away from the touch, then it re-homes where it stops', () => {
    const sim = one()
    const m = sim.state.motes[0]
    expect(sim.kick(m.id, { x: 215, y: 500 })).toBe(true) // touch to the right
    stepFor(sim, 5)
    expect(m.vel).toBeUndefined()
    expect(m.home.x).toBeLessThan(170) // moved left
    expect(Math.abs(m.home.y - 500)).toBeLessThan(1)
    expect(m.pos).toEqual(m.home)
  })

  it('a farther tap kicks harder; a dead-center tap does nothing', () => {
    const near = one()
    near.kick(near.state.motes[0].id, { x: 200, y: 510 })
    stepFor(near, 5)
    const far = one()
    far.kick(far.state.motes[0].id, { x: 200, y: 522 })
    stepFor(far, 5)
    expect(500 - far.state.motes[0].home.y).toBeGreaterThan(500 - near.state.motes[0].home.y)
    const still = one()
    expect(still.kick(still.state.motes[0].id, { x: 200, y: 500 })).toBe(false)
  })

  it('bounces off the field edge instead of leaving it', () => {
    const field = { x: 100, y: 400, w: 60, h: 60 }
    const sim = mk(testLevel({ field, hand: [{ layers: [layer(4, 20, 'red')] }], motes: [mote('red', 130, 430)] }))
    const m = sim.state.motes[0]
    for (let i = 0; i < 5; i++) {
      sim.kick(m.id, { x: m.pos.x - 20 + i * 10, y: m.pos.y + 20 }) // hard kicks up and around
      stepFor(sim, 3)
    }
    expect(m.home.x).toBeGreaterThanOrEqual(field.x)
    expect(m.home.x).toBeLessThanOrEqual(field.x + field.w)
    expect(m.home.y).toBeGreaterThanOrEqual(field.y)
    expect(m.home.y).toBeLessThanOrEqual(field.y + field.h)
  })
})

describe('contention', () => {
  it('the nearest hungry node wins a contested mote', () => {
    const a = { x: 120, y: 500 }
    const b = { x: 250, y: 500 }
    // Rune A's ring passes through x=160; rune B's ring (r=80) through x=170.
    const sim = mk(
      testLevel({
        hand: [{ layers: [layer(4, 40, 'red'), layer(3, 30, 'red')] }, { layers: [layer(4, 80, 'red'), layer(3, 30, 'red')] }],
        motes: [mote('red', 165, 500)],
      }),
    )
    const idA = placeSlot(sim, 0, a)
    const idB = placeSlot(sim, 1, b)
    let claimedBy: string | null = null
    let claimNodeDist = { a: Infinity, b: Infinity }
    sim.bus.on('mote:claimed', ({ rune, node, mote: m }) => {
      claimedBy = rune.id
      const other = sim.state.runes.find((r) => r.id !== rune.id)!
      const own = dist(m.pos, nodePositions(rune, sim.state.time)[node])
      const rival = Math.min(...nodePositions(other, sim.state.time).map((p) => dist(p, m.pos)))
      claimNodeDist = rune.id === idA ? { a: own, b: rival } : { a: rival, b: own }
    })
    stepFor(sim, 20)
    expect(claimedBy).not.toBeNull()
    const winnerDist = claimedBy === idA ? claimNodeDist.a : claimNodeDist.b
    const loserDist = claimedBy === idA ? claimNodeDist.b : claimNodeDist.a
    expect(winnerDist).toBeLessThanOrEqual(loserDist)
    expect([idA, idB]).toContain(claimedBy)
  })
})

describe('full, hold and detonation lifecycle', () => {
  const level = testLevel({
    obstacles: [obstacle(200, 150, [3, 10])],
    hand: [{ layers: [layer(4, 40, 'red', 'blue'), layer(3, 30, 'red'), layer(5, 36, 'blue')] }],
    motes: [...ring('red', C.x, C.y, 40, 4), mote('red', C.x + 40, C.y + 3)],
  })

  it('fills, holds without catching more, and waits for a tap', () => {
    const sim = mk(level)
    const id = placeSlot(sim, 0)
    stepFor(sim, 15)
    const rune = sim.rune(id)!
    expect(rune.state).toBe('full')
    expect(sim.state.motes.filter((m) => m.state === 'held')).toHaveLength(4)
    expect(sim.state.motes.filter((m) => m.state === 'free')).toHaveLength(1)
    stepFor(sim, 5)
    expect(rune.state).toBe('full') // never auto-detonates
  })

  it('links, damages by outer node count, recolors, bursts and returns one layer thinner', () => {
    const sim = mk(level)
    const id = placeSlot(sim, 0)
    const rune = sim.rune(id)!
    expect(rune.linkedObstacleId).toBe(sim.state.obstacles[0].id)
    stepFor(sim, 15)
    expect(sim.detonate(id)).toBe(true)
    expect(sim.state.obstacles[0].hp).toBe(6)
    expect(rune.state).toBe('idle')
    expect(rune.index).toBe(1)
    expect(rune.pos).toBeUndefined()
    const released = sim.state.motes.filter((m) => m.state === 'ejecting')
    expect(released).toHaveLength(4)
    for (const m of released) {
      expect(m.color).toBe('blue')
      expect(dist(m.home, C)).toBeCloseTo(40 + BURST_GAP, 0)
    }
    stepFor(sim, 1)
    for (const m of released) {
      expect(m.state).toBe('free')
      expect(m.pos).toEqual(m.home)
    }
  })

  it('an unlinked detonation deals no damage but still transforms motes', () => {
    const sim = mk({ ...level, obstacles: [obstacle(200, 150, [6, 10])] })
    const id = placeSlot(sim, 0)
    expect(sim.rune(id)!.linkedObstacleId).toBeNull()
    stepFor(sim, 15)
    sim.detonate(id)
    expect(sim.state.obstacles[0].hp).toBe(10)
    expect(sim.state.motes.filter((m) => m.color === 'blue')).toHaveLength(4)
  })

  it('a rune with no layer left is spent', () => {
    const sim = mk({ ...level, hand: [{ layers: [layer(4, 40, 'red')] }] })
    const id = placeSlot(sim, 0)
    stepFor(sim, 15)
    sim.detonate(id)
    expect(sim.rune(id)!.state).toBe('spent')
  })

  it('annihilating releases destroy their motes', () => {
    const sim = mk({ ...level, hand: [{ layers: [layer(4, 40, 'red', 'annihilating'), layer(3, 30, 'red')] }] })
    const id = placeSlot(sim, 0)
    stepFor(sim, 15)
    sim.detonate(id)
    expect(sim.state.motes).toHaveLength(1)
  })
})

describe('burst clamping', () => {
  it('released motes land inside the field', () => {
    const field = { x: 100, y: 400, w: 200, h: 200 }
    const at = { x: 100 + 45, y: 400 + 45 }
    const sim = mk(
      testLevel({ field, hand: [{ layers: [layer(4, 40, 'red'), layer(3, 30, 'red')] }], motes: ring('red', at.x, at.y, 40, 4, 0.9) }),
    )
    const id = placeSlot(sim, 0, at)
    stepFor(sim, 15)
    sim.detonate(id)
    for (const m of sim.state.motes) {
      expect(m.home.x).toBeGreaterThanOrEqual(field.x)
      expect(m.home.y).toBeGreaterThanOrEqual(field.y)
    }
  })
})

describe('obstacles', () => {
  it('excess damage does not carry into the next layer; links follow the new shape', () => {
    const sim = mk(
      testLevel({
        obstacles: [obstacle(200, 150, [3, 2], [4, 9])],
        hand: [{ layers: [layer(5, 40, 'red'), layer(3, 30, 'red')] }, { layers: [layer(4, 40, 'red'), layer(4, 30, 'red')] }],
        motes: ring('red', 110, 500, 40, 5),
      }),
    )
    const a = placeSlot(sim, 0, { x: 110, y: 500 })
    const b = placeSlot(sim, 1, { x: 290, y: 500 })
    expect(sim.rune(b)!.linkedObstacleId).toBeNull()
    stepFor(sim, 15)
    sim.detonate(a)
    const o = sim.state.obstacles[0]
    expect(o.index).toBe(1)
    expect(o.hp).toBe(9)
    expect(sim.rune(b)!.linkedObstacleId).toBe(o.id)
  })

  it('placement rejects overlap, blockers and the field edge', () => {
    const sim = mk(
      testLevel({
        blockers: [{ x: 0, y: 600, w: 400, h: 20 }],
        hand: [{ layers: [layer(4, 40, 'red')] }, { layers: [layer(4, 40, 'red')] }],
      }),
    )
    const [r0, r1] = sim.state.runes
    expect(sim.canPlace(r0.id, { x: 20, y: 500 })).toBe(false)
    expect(sim.canPlace(r0.id, { x: 200, y: 590 })).toBe(false)
    expect(sim.place(r0.id, C)).toBe(true)
    expect(sim.canPlace(r1.id, { x: C.x + 60, y: C.y })).toBe(false)
    expect(sim.canPlace(r1.id, { x: C.x + 100, y: C.y })).toBe(true)
  })
})

describe('undo', () => {
  it('restores the exact prior board, keeping fresh randomness', () => {
    const sim = mk(
      testLevel({ hand: [{ layers: [layer(4, 40, 'red'), layer(3, 30, 'red')] }], motes: [...ring('red', C.x, C.y, 40, 4), mote('blue', 80, 400, 8)] }),
      { seed: 42 },
    )
    stepFor(sim, 2)
    const before = structuredClone(sim.state)
    placeSlot(sim, 0)
    stepFor(sim, 15)
    sim.detonate(sim.state.runes[0].id)
    expect(sim.undo()).toBe(true) // undo the detonation
    expect(sim.state.runes[0].state).toBe('full')
    expect(sim.undo()).toBe(true) // undo the placement
    const { rng: _a, ...now } = sim.state
    const { rng: _b, ...was } = before
    expect(now).toEqual(was)
    expect(sim.undo()).toBe(false)
  })
})

describe('loss check', () => {
  it('both debug fail levels lose on their obvious play', () => {
    for (const level of DEBUG_PACK) {
      const res = runScript(level, [{ place: 0, at: { x: 200, y: 500 } }], { settle: 10 })
      expect(res.status, level.id).toBe('lost')
    }
  })

  it('never fires while a winning line exists', () => {
    const level: LevelData = testLevel({
      obstacles: [obstacle(200, 150, [3, 4])],
      hand: [{ layers: [layer(4, 40, 'red'), layer(3, 30, 'red')] }],
      motes: ring('red', C.x, C.y, 40, 4),
    })
    // Waiting around before acting must not trigger a loss.
    const res = runScript(level, [{ wait: 10 }, { place: 0, at: C }, { wait: 5 }, { tap: 0 }])
    expect(res.error).toBeUndefined()
    expect(res.status).toBe('won')
  })

  it('declares a loss when too little damage remains for a shape', () => {
    const level = testLevel({
      obstacles: [obstacle(200, 150, [3, 9])],
      hand: [{ layers: [layer(4, 40, 'red'), layer(3, 30, 'red')] }],
      motes: ring('red', C.x, C.y, 40, 4),
    })
    const sim = new Sim(level)
    sim.checkLoss()
    expect(sim.state.status).toBe('lost')
  })

  it('a rune placed away from its motes is not a loss: motes can be kicked to it', () => {
    const level = testLevel({
      obstacles: [obstacle(200, 150, [3, 4])],
      hand: [{ layers: [layer(4, 40, 'red'), layer(3, 30, 'red')] }],
      motes: ring('red', C.x, C.y, 40, 4),
    })
    const res = runScript(level, [{ place: 0, at: { x: 330, y: 650 } }], { settle: 5 })
    expect(res.status).toBe('playing')
  })

  it('declares a loss when no rune can ever fill from the remaining colors', () => {
    const level = testLevel({
      obstacles: [obstacle(200, 150, [3, 4])],
      hand: [{ layers: [layer(4, 40, 'red'), layer(3, 30, 'red')] }],
      motes: [...ring('red', C.x, C.y, 40, 3), mote('blue', 80, 400)],
    })
    const res = runScript(level, [{ place: 0, at: C }], { settle: 5 })
    expect(res.status).toBe('lost')
  })
})
