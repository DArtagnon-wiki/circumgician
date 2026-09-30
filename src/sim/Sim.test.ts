import { describe, expect, it } from 'vitest'
import { Sim, type SimOptions } from './Sim'
import { BURST_GAP, FLICK_MAX, FROZEN_INSET, ICE_RADIUS, KICK_MIN, MOTE_FRICTION, REACH, THAW_LAG } from './constants'
import type { DetonationInfo } from './events'
import { dist, nodePositions, strikeTime } from './geometry'
import { layer, mote, obstacle, ring, testLevel } from './testFixtures'
import { runScript } from './headless'
import { DEBUG_PACK } from '../data/levels/pack'
import type { LevelData, ObstacleSpec, ReleaseColor, RuneLayerSpec } from './types'

const DT = 1 / 30
const C = { x: 200, y: 500 }
const mk = (level: LevelData, opts: SimOptions = {}) => new Sim(level, { lossCheck: false, ...opts })

function stepFor(sim: Sim, seconds: number) {
  for (let t = 0; t < seconds; t += DT) sim.step(DT)
}
// Casts the layer in hand from `slot`; returns the new piece's id.
function placeSlot(sim: Sim, slot: number, at = C) {
  const rune = sim.state.runes.find((r) => r.slot === slot)!
  const piece = sim.place(rune.id, at)
  expect(piece).not.toBeNull()
  return piece!.id
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
    expect(onRing.pieceId).toBe(id)
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

  it('a full piece has no hungry nodes, so even matching motes are pushed out', () => {
    const sim = mk(testLevel({ hand: level.hand, motes: [...ring('red', C.x, C.y, 40, 4), mote('red', C.x + 3, C.y + 2)] }))
    const id = placeSlot(sim, 0)
    const inner = sim.state.motes[4]
    // Fill from the ring first: hold the inner mote still until the piece is full.
    for (let t = 0; t < 15 && sim.piece(id)!.state !== 'full'; t += DT) {
      inner.pos = { x: C.x + 3, y: C.y + 2 }
      delete inner.vel
      sim.step(DT)
    }
    expect(sim.piece(id)!.state).toBe('full')
    expect(inner.state).toBe('free')
    stepFor(sim, 6)
    expect(inner.state).toBe('free')
    expect(dist(inner.home, C)).toBeGreaterThanOrEqual(40 - REACH / 2)
  })

  it('regression: motes a rune cannot catch are pushed fully clear of it (Hungry Circle softlock)', () => {
    // The board that softlocked: five reds on a 40px ring, and a blue pentagon of radius 66 over them.
    const level = testLevel({
      field: { x: 40, y: 380, w: 320, h: 250 },
      motes: [mote('red', 178.2, 511.8, 8), mote('red', 140.6, 540, 8), mote('red', 102.1, 512.9, 8), mote('red', 116, 468, 8), mote('red', 163.1, 467.3, 8)],
      hand: [{ layers: [layer(3, 40, 'red'), layer(3, 30, 'red')] }, { layers: [layer(5, 66, 'blue', 'teal'), layer(5, 92, 'teal')] }],
    })
    const sim = mk(level, { seed: 4 })
    const big = sim.state.runes[1] // 5-gon R66, catches blue; reds sit at r40 under it
    const P = { x: 140, y: 500 }
    expect(sim.place(big.id, P)).not.toBeNull()
    stepFor(sim, 8)
    for (const m of sim.state.motes) {
      expect(m.vel, 'settled').toBeUndefined()
      // Clear of the outline and catch ring, even at the edge of its drift.
      expect(dist(m.home, P) - m.tether).toBeGreaterThanOrEqual(66 + REACH - 0.5)
    }
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

  // One red node among blues, and a red mote 110px to the right of the rune.
  const mixed = () => {
    const l = layer(4, 40, 'blue')
    l.nodes[0] = { catch: 'red', release: 'red' }
    return l
  }
  const aimed = (hand: LevelData['hand']) => {
    const sim = mk(testLevel({ hand, motes: [mote('red', C.x + 110, C.y)] }))
    const id = placeSlot(sim, 0)
    const m = sim.state.motes[0]
    sim.kick(m.id, { x: m.pos.x + 25, y: m.pos.y }) // straight at the rune
    return { sim, id, m }
  }

  it('a mote kicked into a rune is drawn straight to the node that can hold it', () => {
    const { sim, id, m } = aimed([{ layers: [mixed(), layer(3, 30, 'red')] }])
    const claimed: number[] = []
    sim.bus.on('mote:claimed', ({ node }) => claimed.push(node))
    stepFor(sim, 1) // well under a turn of the rune: it did not wait for the sweep
    expect(claimed).toEqual([0])
    expect(m.pieceId).toBe(id)
    expect(m.kicked).toBeUndefined()
    stepFor(sim, 0.5)
    expect(m.state).toBe('held')
  })

  it('a kicked mote no node can hold is still pushed clear', () => {
    const { sim, m } = aimed([{ layers: [layer(4, 40, 'blue'), layer(3, 30, 'blue')] }])
    stepFor(sim, 5)
    expect(m.state).toBe('free')
    expect(m.kicked).toBeUndefined()
    expect(dist(m.pos, C)).toBeGreaterThanOrEqual(40 + REACH)
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
    sim.bus.on('mote:claimed', ({ piece, node, mote: m }) => {
      claimedBy = piece.id
      const other = sim.state.pieces.find((p) => p.id !== piece.id)!
      const own = dist(m.pos, nodePositions(piece, sim.state.time)[node])
      const rival = Math.min(...nodePositions(other, sim.state.time).map((p) => dist(p, m.pos)))
      claimNodeDist = piece.id === idA ? { a: own, b: rival } : { a: rival, b: own }
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
    const piece = sim.piece(id)!
    expect(piece.state).toBe('full')
    expect(sim.state.motes.filter((m) => m.state === 'held')).toHaveLength(4)
    expect(sim.state.motes.filter((m) => m.state === 'free')).toHaveLength(1)
    stepFor(sim, 5)
    expect(piece.state).toBe('full') // never auto-detonates
  })

  it('casting brings the next layer into hand at once', () => {
    const sim = mk(level)
    const rune = sim.state.runes[0]
    const id = placeSlot(sim, 0)
    const piece = sim.piece(id)!
    expect(piece.layer.sides).toBe(4)
    expect(piece.energy.sides).toBe(3) // strikes what was its middle
    expect(rune.index).toBe(1)
    expect(rune.state).toBe('idle') // the triangle is in hand already
    // ...and can be cast while the square still sits on the field.
    const second = placeSlot(sim, 0, { x: 300, y: 620 })
    expect(sim.state.pieces.map((p) => p.id)).toEqual([id, second])
    expect(sim.piece(second)!.energy.sides).toBe(5)
  })

  it('the final entry is never cast: it is what the layer above it strikes', () => {
    const sim = mk(level)
    const rune = sim.state.runes[0]
    placeSlot(sim, 0)
    placeSlot(sim, 0, { x: 300, y: 620 }) // the triangle, striking pentagons
    expect(rune.state).toBe('spent')
    expect(sim.canPlace(rune.id, { x: 100, y: 620 })).toBe(false)
  })

  it('links, damages by its node count, recolors, bursts and is used up', () => {
    const sim = mk(level)
    const id = placeSlot(sim, 0)
    const piece = sim.piece(id)!
    expect(piece.linkedObstacleId).toBe(sim.state.obstacles[0].id)
    stepFor(sim, 15)
    expect(sim.detonate(id)).toBe(true)
    expect(sim.state.obstacles[0].hp).toBe(6)
    expect(sim.state.stats).toEqual({ detonations: 1, landed: 4, wasted: 0, unlinked: 0, destroyed: 0 })
    expect(sim.piece(id)).toBeUndefined()
    expect(sim.state.runes[0].index).toBe(1) // unchanged: it moved on when cast
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
    expect(sim.piece(id)!.linkedObstacleId).toBeNull()
    stepFor(sim, 15)
    sim.detonate(id)
    expect(sim.state.obstacles[0].hp).toBe(10)
    expect(sim.state.motes.filter((m) => m.color === 'blue')).toHaveLength(4)
    expect(sim.state.stats).toMatchObject({ detonations: 1, landed: 0, unlinked: 1 })
  })

  it('annihilating releases destroy their motes', () => {
    const sim = mk({ ...level, hand: [{ layers: [layer(4, 40, 'red', 'annihilating'), layer(3, 30, 'red')] }] })
    const id = placeSlot(sim, 0)
    stepFor(sim, 15)
    sim.detonate(id)
    expect(sim.state.motes).toHaveLength(1)
    expect(sim.state.stats.destroyed).toBe(4)
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
  it('excess damage does not carry into the next layer (it is counted as wasted); links follow the new shape', () => {
    const sim = mk(
      testLevel({
        obstacles: [obstacle(200, 150, [3, 2], [4, 9])],
        hand: [{ layers: [layer(5, 40, 'red'), layer(3, 30, 'red')] }, { layers: [layer(4, 40, 'red'), layer(4, 30, 'red')] }],
        motes: ring('red', 110, 500, 40, 5),
      }),
    )
    const a = placeSlot(sim, 0, { x: 110, y: 500 })
    const b = placeSlot(sim, 1, { x: 290, y: 500 })
    expect(sim.piece(b)!.linkedObstacleId).toBeNull()
    stepFor(sim, 15)
    sim.detonate(a)
    const o = sim.state.obstacles[0]
    expect(o.index).toBe(1)
    expect(o.hp).toBe(9)
    expect(sim.state.stats).toMatchObject({ landed: 2, wasted: 3 })
    expect(sim.piece(b)!.linkedObstacleId).toBe(o.id)
  })

  it('placement rejects overlap, blockers and the field edge', () => {
    const sim = mk(
      testLevel({
        blockers: [{ x: 0, y: 600, w: 400, h: 20 }],
        hand: [{ layers: [layer(4, 40, 'red'), layer(3, 30, 'red')] }, { layers: [layer(4, 40, 'red'), layer(3, 30, 'red')] }],
      }),
    )
    const [r0, r1] = sim.state.runes
    expect(sim.canPlace(r0.id, { x: 20, y: 500 })).toBe(false)
    expect(sim.canPlace(r0.id, { x: 200, y: 590 })).toBe(false)
    expect(sim.place(r0.id, C)).not.toBeNull()
    expect(sim.canPlace(r1.id, { x: C.x + 60, y: C.y })).toBe(false)
    expect(sim.canPlace(r1.id, { x: C.x + 100, y: C.y })).toBe(true)
  })
})

describe('fuse (endless)', () => {
  // A square that only half fills, and a pentagon whose energy is a square.
  const B = { x: 300, y: 640 }
  const level = testLevel({
    hand: [{ layers: [layer(4, 40, 'red'), layer(3, 30, 'red'), layer(6, 20, 'red')] }, { layers: [layer(5, 40, 'blue'), layer(4, 30, 'blue')] }],
    motes: [...ring('red', C.x, C.y, 40, 4).slice(0, 2), ...ring('blue', B.x, B.y, 40, 5)],
  })

  it('without a fuse (puzzle levels) a piece waits forever', () => {
    const sim = mk(level)
    const id = placeSlot(sim, 0)
    expect(sim.piece(id)!.freezeAt).toBeUndefined()
    stepFor(sim, 30)
    expect(sim.piece(id)!.state).toBe('charging')
  })

  it('a piece not detonated in time freezes into an obstacle of its shape, holding its motes', () => {
    const sim = mk(level, { fuse: 10 })
    const frozen: string[] = []
    sim.bus.on('piece:frozen', ({ piece }) => frozen.push(piece.id))
    const id = placeSlot(sim, 0)
    stepFor(sim, 9.5)
    expect(sim.piece(id)).toBeDefined()
    stepFor(sim, 1)
    expect(frozen).toEqual([id])
    expect(sim.piece(id)).toBeUndefined()
    const o = sim.state.obstacles.find((x) => x.frozen)!
    expect(o.pos).toEqual(C)
    expect(o.layers).toEqual([{ sides: 4, radius: 40, hp: 4 }])
    expect(o.hp).toBe(4)
    expect(o.frozen!.motes).toHaveLength(2)
    for (const m of sim.state.motes.filter((x) => x.color === 'red')) {
      expect(m.state).toBe('frozen')
      expect(m.frozenIn).toBe(o.id)
      expect(dist(m.pos, C)).toBeLessThan(40)
    }
    stepFor(sim, 5)
    expect(sim.state.motes.filter((x) => x.state === 'frozen')).toHaveLength(2) // held until broken
    // It blocks casting like a piece does.
    const r1 = sim.state.runes.find((r) => r.slot === 1)!
    expect(sim.canPlace(r1.id, { x: C.x + 70, y: C.y })).toBe(false)
    expect(sim.canPlace(r1.id, { x: C.x + 100, y: C.y })).toBe(true)
  })

  it('a full piece freezes too if it is never tapped', () => {
    const sim = mk({ ...level, motes: ring('red', C.x, C.y, 40, 4) }, { fuse: 10 })
    const id = placeSlot(sim, 0)
    stepFor(sim, 5)
    expect(sim.piece(id)!.state).toBe('full')
    stepFor(sim, 6)
    expect(sim.piece(id)).toBeUndefined()
    expect(sim.state.obstacles.find((o) => o.frozen)!.frozen!.motes).toHaveLength(4)
  })

  it('free motes are pushed clear of a frozen piece', () => {
    const sim = mk({ ...level, motes: [...level.motes, mote('gold', C.x + 30, C.y)] }, { fuse: 1 })
    placeSlot(sim, 0)
    stepFor(sim, 6)
    const gold = sim.state.motes.find((m) => m.color === 'gold')!
    expect(dist(gold.pos, C)).toBeGreaterThanOrEqual(40 + REACH)
  })

  it('a matching energy links to it; breaking it frees its motes unchanged, for no score', () => {
    const sim = mk(level, { fuse: 10 })
    placeSlot(sim, 0)
    stepFor(sim, 10.5)
    const o = sim.state.obstacles.find((x) => x.frozen)!
    const id = placeSlot(sim, 1, B)
    expect(sim.piece(id)!.linkedObstacleId).toBe(o.id)
    stepFor(sim, 5)
    expect(sim.detonate(id)).toBe(true)
    expect(o.cleared).toBe(true)
    expect(sim.state.stats).toMatchObject({ landed: 4, wasted: 1 })
    expect(sim.state.broken).toBe(0)
    expect(sim.state.score).toBe(0)
    const red = sim.state.motes.filter((m) => m.color === 'red')
    stepFor(sim, 0.3)
    for (const m of red) expect(dist(m.pos, C)).toBeLessThan(40) // waiting for the blow to land
    stepFor(sim, 1.2)
    expect(red).toHaveLength(2)
    for (const m of red) {
      expect(m.state).toBe('free')
      expect(m.frozenIn).toBeUndefined()
      expect(dist(m.pos, C)).toBeCloseTo(40 + BURST_GAP, 0)
    }
    expect(sim.canPlace(sim.state.runes.find((r) => r.slot === 0)!.id, C)).toBe(true) // the ground is clear again
  })
})

describe('flick', () => {
  it('sends a free mote along the swipe, its speed clamped, and it coasts to a stop', () => {
    const sim = mk(testLevel({ hand: [{ layers: [layer(4, 40, 'red'), layer(3, 30, 'red')] }], motes: [mote('red', 100, 500), mote('blue', 60, 620)] }))
    const [slow, fast] = sim.state.motes
    expect(sim.flick(slow.id, { x: 0, y: -10 })).toBe(true) // too gentle: at least KICK_MIN
    expect(sim.flick(fast.id, { x: 3000, y: 0 })).toBe(true) // too hard: at most FLICK_MAX
    expect(Math.hypot(slow.vel!.x, slow.vel!.y)).toBeCloseTo(KICK_MIN)
    expect(fast.vel!.x).toBeCloseTo(FLICK_MAX)
    stepFor(sim, 4)
    expect(slow.vel).toBeUndefined()
    expect(slow.pos.x).toBeCloseTo(100, 0)
    expect(500 - slow.pos.y).toBeCloseTo(KICK_MIN / MOTE_FRICTION, -1)
    expect(fast.pos.x - 60).toBeCloseTo(FLICK_MAX / MOTE_FRICTION, -1)
    expect(slow.home).toEqual(slow.pos) // where it came to rest
  })

  it('moves only free motes', () => {
    const sim = mk(testLevel({ hand: [{ layers: [layer(4, 40, 'red'), layer(3, 30, 'red')] }], motes: ring('red', C.x, C.y, 40, 4) }))
    placeSlot(sim, 0)
    stepFor(sim, 5)
    expect(sim.flick(sim.state.motes[0].id, { x: 200, y: 0 })).toBe(false)
  })
})

describe('ice', () => {
  const I = { x: 100, y: 420 }
  // A square whose energy is a square: the ice's shape.
  const level = testLevel({
    hand: [{ layers: [layer(4, 40, 'red'), layer(4, 30, 'red')] }],
    motes: ring('red', C.x, C.y, 40, 4),
    obstacles: [obstacle(200, 150, [3, 4])],
    ice: [{ x: I.x, y: I.y, sides: 4, motes: ['gold', 'gold'] }],
  })

  it("a level's ice holds its motes, after the free ones, and blocks casting", () => {
    const sim = mk(level)
    const ice = sim.state.obstacles.find((o) => o.frozen)!
    expect(ice.layers).toEqual([{ sides: 4, radius: ICE_RADIUS, hp: 4 }])
    expect(sim.state.motes.map((m) => [m.id, m.color, m.state])).toEqual([
      ['mote-0', 'red', 'free'],
      ['mote-1', 'red', 'free'],
      ['mote-2', 'red', 'free'],
      ['mote-3', 'red', 'free'],
      ['mote-4', 'gold', 'frozen'],
      ['mote-5', 'gold', 'frozen'],
    ])
    expect(ice.frozen!.motes).toEqual(['mote-4', 'mote-5'])
    expect(sim.state.seenHues).toContain('gold')
    const rune = sim.state.runes[0]
    expect(sim.canPlace(rune.id, { x: I.x + 60, y: I.y })).toBe(false)
    expect(sim.canPlace(rune.id, { x: I.x + 90, y: I.y })).toBe(true)
    stepFor(sim, 5)
    for (const m of sim.state.motes.filter((x) => x.color === 'gold')) {
      expect(m.state).toBe('frozen')
      expect(dist(m.pos, I)).toBeCloseTo(ICE_RADIUS * FROZEN_INSET, 5)
    }
  })

  it('a blow of its shape breaks it: its motes burst out unchanged once the blow lands', () => {
    const sim = mk(level)
    const ice = sim.state.obstacles.find((o) => o.frozen)!
    const id = placeSlot(sim, 0)
    expect(sim.piece(id)!.linkedObstacleId).toBe(ice.id)
    stepFor(sim, 5)
    sim.detonate(id)
    expect(ice.cleared).toBe(true)
    expect(sim.state.stats).toMatchObject({ landed: 4, wasted: 0 })
    expect(sim.state.broken).toBe(0)
    const gold = sim.state.motes.filter((m) => m.color === 'gold')
    expect(gold.map((m) => m.state)).toEqual(['ejecting', 'ejecting'])
    stepFor(sim, strikeTime(C, I) - 0.05)
    for (const m of gold) expect(dist(m.pos, I)).toBeCloseTo(ICE_RADIUS * FROZEN_INSET, 5)
    stepFor(sim, 1)
    for (const m of gold) {
      expect(m.state).toBe('free')
      expect(dist(m.home, I)).toBeCloseTo(ICE_RADIUS + BURST_GAP, 5)
    }
    expect(sim.state.status).toBe('playing') // the obstacle still stands
  })

  it('is never needed to win', () => {
    const sim = mk({ ...level, obstacles: [obstacle(200, 150, [4, 4])], ice: [{ x: I.x, y: I.y, sides: 5 }] })
    const id = placeSlot(sim, 0)
    stepFor(sim, 5)
    sim.detonate(id)
    expect(sim.state.status).toBe('won')
  })

  it('motes locked in ice cannot fill anything: with nothing else to do, the level is lost', () => {
    const sim = new Sim({ ...level, motes: [], obstacles: [obstacle(200, 150, [4, 4])], ice: [{ x: I.x, y: I.y, sides: 4, motes: ['red', 'red', 'red', 'red'] }] })
    sim.checkLoss()
    expect(sim.state.lostBecause).toBe('stuck')
  })
})

describe('frost', () => {
  const B = { x: 300, y: 640 }
  const frostBoss: ObstacleSpec = {
    x: 200,
    y: 150,
    layers: [
      { sides: 3, radius: 30, hp: 6, frost: true },
      { sides: 4, radius: 30, hp: 3 },
    ],
  }
  const turn = (release: ReleaseColor[]): RuneLayerSpec => ({ sides: 4, radius: 40, nodes: release.map((r) => ({ catch: 'red', release: r })) })
  const level = testLevel({
    obstacles: [frostBoss],
    hand: [
      { layers: [turn(['blue', 'blue', 'blue', 'blue']), layer(3, 30, 'red')] }, // strikes for 4: short of 6
      { layers: [layer(3, 40, 'gold'), layer(3, 30, 'gold')] }, // strikes for 3
      { layers: [layer(4, 40, 'gold'), layer(4, 30, 'gold')] }, // a square's energy: breaks a frozen square
    ],
    motes: [...ring('red', C.x, C.y, 40, 4), ...ring('gold', B.x, B.y, 40, 3)],
  })

  function frostbitten(lvl = level) {
    const sim = mk(lvl)
    const infos: DetonationInfo[] = []
    sim.bus.on('piece:detonated', ({ info }) => infos.push(info))
    const id = placeSlot(sim, 0)
    stepFor(sim, 5)
    sim.detonate(id)
    const boss = sim.state.obstacles[0]
    const ice = sim.state.obstacles.find((o) => o.frozen)
    return { sim, infos, boss, ice }
  }

  it('a blow that leaves a frost layer standing freezes the piece where it stood, holding its transformed motes', () => {
    const { sim, infos, boss, ice } = frostbitten()
    expect(boss.hp).toBe(2) // the damage still lands
    expect(boss.index).toBe(0)
    expect(ice).toBeDefined()
    expect(infos[0].frozeInto).toBe(ice!.id)
    expect(ice!.pos).toEqual(C)
    expect(ice!.layers).toEqual([{ sides: 4, radius: 40, hp: 4 }])
    expect(ice!.frozen!.by).toEqual({ obstacle: boss.id, layer: 0 })
    const locked = sim.state.motes.filter((m) => ice!.frozen!.motes.includes(m.id))
    expect(locked).toHaveLength(4)
    for (const m of locked) {
      expect(m.color).toBe('blue')
      expect(m.state).toBe('frozen')
      expect(m.frozenIn).toBe(ice!.id)
    }
    expect(sim.state.seenHues).toContain('blue')
    stepFor(sim, 5)
    expect(locked.every((m) => m.state === 'frozen')).toBe(true)
  })

  it("the frost layer's fall thaws every piece it froze", () => {
    const { sim, boss, ice } = frostbitten()
    const thawed: string[] = []
    sim.bus.on('ice:thawed', ({ ice: i, by }) => thawed.push(`${i.id}<${by.id}`))
    const id = placeSlot(sim, 1, B)
    expect(sim.piece(id)!.linkedObstacleId).toBe(boss.id)
    stepFor(sim, 5)
    sim.detonate(id) // 3 >= 2: the frost layer falls
    expect(boss.index).toBe(1)
    expect(thawed).toEqual([`${ice!.id}<${boss.id}`])
    expect(ice!.cleared).toBe(true)
    const blue = sim.state.motes.filter((m) => m.color === 'blue')
    stepFor(sim, strikeTime(B, boss.pos) + THAW_LAG - 0.05)
    for (const m of blue) expect(m.state).toBe('ejecting') // still waiting in the ice
    stepFor(sim, 1)
    for (const m of blue) {
      expect(m.state).toBe('free')
      expect(dist(m.pos, C)).toBeCloseTo(40 + BURST_GAP, 0)
    }
  })

  it('breaking the frozen piece frees its motes; the frost layer stands', () => {
    const { sim, boss, ice } = frostbitten({ ...level, motes: [...ring('red', C.x, C.y, 40, 4), ...ring('gold', B.x, B.y, 40, 4)] })
    const id = placeSlot(sim, 2, B)
    expect(sim.piece(id)!.linkedObstacleId).toBe(ice!.id)
    stepFor(sim, 5)
    sim.detonate(id)
    expect(ice!.cleared).toBe(true)
    expect(boss.hp).toBe(2)
    stepFor(sim, 2)
    expect(sim.state.motes.filter((m) => m.color === 'blue').map((m) => m.state)).toEqual(['free', 'free', 'free', 'free'])
  })

  it('annihilating tubes burn their motes at the strike', () => {
    const { sim, ice } = frostbitten({ ...level, hand: [{ layers: [turn(['annihilating', 'blue', 'annihilating', 'blue']), layer(3, 30, 'red')] }, ...level.hand.slice(1)] })
    expect(ice!.frozen!.motes).toHaveLength(2)
    expect(sim.state.stats.destroyed).toBe(2)
    expect(sim.state.motes.filter((m) => m.color === 'red')).toHaveLength(0)
  })

  it('a blow that breaks the frost layer outright is an ordinary blow', () => {
    const { sim, boss, ice } = frostbitten({ ...level, obstacles: [{ ...frostBoss, layers: [{ ...frostBoss.layers[0], hp: 4 }, frostBoss.layers[1]] }] })
    expect(boss.index).toBe(1)
    expect(ice).toBeUndefined()
    stepFor(sim, 2)
    expect(sim.state.motes.filter((m) => m.color === 'blue').map((m) => m.state)).toEqual(['free', 'free', 'free', 'free'])
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
    sim.detonate(sim.state.pieces[0].id)
    expect(sim.undo()).toBe(true) // undo the detonation
    expect(sim.state.pieces[0].state).toBe('full')
    expect(sim.state.stats.detonations).toBe(0) // its stats go with it
    expect(sim.undo()).toBe(true) // undo the cast, and the promotion with it
    expect(sim.state.runes[0].index).toBe(0)
    const { rng: _a, ...now } = sim.state
    const { rng: _b, ...was } = before
    expect(now).toEqual(was)
    expect(sim.undo()).toBe(false)
  })
})

describe('loss check', () => {
  it('both debug fail levels lose on their obvious play', () => {
    for (const level of DEBUG_PACK.filter((l) => l.id.startsWith('fail-'))) {
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

  it('a rune whose layer in hand cannot fill is still alive if a deeper layer can (dig to it)', () => {
    const level = testLevel({
      obstacles: [obstacle(200, 150, [3, 3])],
      hand: [{ layers: [layer(4, 40, 'red'), layer(3, 66, 'blue'), layer(3, 30, 'red')] }],
      motes: ring('blue', C.x, C.y, 66, 3),
    })
    const sim = new Sim(level)
    sim.checkLoss()
    expect(sim.state.status).toBe('playing')
    // Dig: the square goes down empty, away from the blues; the triangle
    // then catches them and strikes.
    const res = runScript(level, [{ place: 0, at: { x: 80, y: 400 } }, { place: 0, at: C }, { tap: 0, layer: 1 }])
    expect(res.error).toBeUndefined()
    expect(res.status).toBe('won')
    expect(res.sim.state.pieces.map((p) => p.state)).toEqual(['charging']) // the square still sits there, empty
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
