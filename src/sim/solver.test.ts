import { describe, expect, it } from 'vitest'
import { ECONOMY_COLORS, EconomySolver, damageShort, economyLost, economyWon, initialEconomy, moveLabel, profileLevel, replay, tensionAlong, transitions, type Economy } from './solver'
import { tensionShape } from './solverReport'
import { loadLevel } from './loadLevel'
import { isCertainLoss } from './progress'
import { runScript } from './headless'
import { layer, mote, obstacle, testLevel } from './testFixtures'
import type { Hue, MoteColor, ReleaseColor, RuneLayerSpec } from './types'

// Mixed-node layer: [count, catch, release] groups.
function mixed(sides: number, ...groups: [number, Hue, ReleaseColor][]): RuneLayerSpec {
  return { sides, radius: 40, nodes: groups.flatMap(([n, c, r]) => Array.from({ length: n }, () => ({ catch: c, release: r }))) }
}
const motes = (spec: Partial<Record<MoteColor, number>>) =>
  Object.entries(spec).flatMap(([color, n]) => Array.from({ length: n }, (_, i) => mote(color as MoteColor, 60 + i * 10, 400)))
const pool = (s: Economy) => Object.fromEntries(ECONOMY_COLORS.map((c, i) => [c, s.pool[i]]).filter(([, n]) => n))
const labels = (level: Parameters<typeof transitions>[0], s: Economy) => transitions(level, s).map((t) => moveLabel(t.move))
const after = (level: Parameters<typeof transitions>[0], s: Economy, label: string) => transitions(level, s).find((t) => moveLabel(t.move) === label)!.next

describe('economy moves', () => {
  it('fills from exact colors first; generics cover only the shortfall', () => {
    const level = testLevel({ motes: motes({ red: 1, blue: 2, generic: 2 }), hand: [{ layers: [mixed(3, [2, 'red', 'red'], [1, 'blue', 'blue']), layer(3, 36, 'red')] }] })
    const fill = transitions(level, initialEconomy(level))[0]
    expect(moveLabel(fill.move)).toBe('fill R0.0')
    expect(pool(fill.next)).toEqual({ blue: 1, generic: 1 })
  })

  it('cannot fill a layer the free colors cannot cover', () => {
    const level = testLevel({ motes: motes({ red: 2, generic: 1 }), hand: [{ layers: [layer(4, 40, 'red'), layer(3, 36, 'red')] }] })
    expect(transitions(level, initialEconomy(level))).toEqual([])
  })

  it("a stack's final entry is never cast: it is only the shape the layer above it strikes", () => {
    const level = testLevel({ motes: motes({ red: 9 }), hand: [{ layers: [layer(4, 40, 'red'), layer(3, 36, 'red')] }] })
    expect(labels(level, initialEconomy(level))).toEqual(['fill R0.0'])
  })

  it('links only to obstacles whose current layer matches the energy, else fires unlinked', () => {
    const level = testLevel({
      motes: motes({ red: 8 }),
      obstacles: [obstacle(100, 150, [3, 5]), obstacle(300, 150, [4, 5]), obstacle(200, 150, [3, 5])],
      hand: [{ layers: [layer(4, 40, 'red'), layer(3, 36, 'red')] }, { layers: [layer(4, 40, 'red'), layer(5, 36, 'red')] }],
    })
    let s = initialEconomy(level)
    for (const r of [0, 1]) s = after(level, s, `fill R${r}.0`)
    expect(labels(level, s)).toEqual(['R0.0->O0', 'R0.0->O2', 'R1.0 unlinked'])
  })

  it('damage never carries into the next layer; the excess is wasted', () => {
    const level = testLevel({ motes: motes({ red: 4 }), obstacles: [obstacle(200, 150, [3, 2], [3, 5])], hand: [{ layers: [layer(4, 40, 'red'), layer(3, 36, 'red')] }] })
    const end = transitions(level, after(level, initialEconomy(level), 'fill R0.0'))[0]
    expect(end.blow).toMatchObject({ damage: 2, wasted: 2, target: 0, targetLayer: 0, unlinked: false })
    expect(end.next.obstacles[0]).toEqual({ index: 1, hp: 5 })
  })

  it('releases recolor by node; annihilating nodes destroy their motes; the piece is used up', () => {
    const level = testLevel({ motes: motes({ red: 4 }), hand: [{ layers: [mixed(4, [2, 'red', 'gold'], [1, 'red', 'generic'], [1, 'red', 'annihilating']), layer(3, 36, 'red')] }] })
    const fired = transitions(level, after(level, initialEconomy(level), 'fill R0.0'))[0]
    expect(pool(fired.next)).toEqual({ gold: 2, generic: 1 })
    expect(fired.next.pieces).toEqual([])
    expect(fired.next.hand).toEqual([1])
  })

  it('filling a deeper layer digs: the layers above it go down as empty pieces', () => {
    const level = testLevel({ motes: motes({ blue: 3 }), hand: [{ layers: [layer(4, 40, 'red'), layer(3, 66, 'blue'), layer(3, 30, 'red')] }] })
    const s = initialEconomy(level)
    expect(labels(level, s)).toEqual(['fill R0.1']) // the square can't fill, the triangle can
    const dug = after(level, s, 'fill R0.1')
    expect(dug.hand).toEqual([2])
    expect(dug.pieces).toEqual([
      { rune: 0, layer: 0, full: false },
      { rune: 0, layer: 1, full: true },
    ])
    // Room for one piece only: no digging.
    expect(transitions(level, s, { maxPlaced: 1 })).toEqual([])
  })

  it('with a fuse, digging burns the layers above: gone for good, and taking no room', () => {
    const level = testLevel({ fuse: 10, motes: motes({ red: 4, blue: 3 }), hand: [{ layers: [layer(4, 40, 'red'), layer(3, 66, 'blue'), layer(3, 30, 'red')] }] })
    const s = initialEconomy(level)
    expect(labels(level, s)).toEqual(['fill R0.0', 'fill R0.1'])
    const dug = after(level, s, 'fill R0.1')
    expect(dug.hand).toEqual([2])
    expect(dug.pieces).toEqual([{ rune: 0, layer: 1, full: true }])
    expect(labels(level, dug)).toEqual(['R0.1->O0']) // the square burned: it can never fill now
    expect(transitions(level, s, { maxPlaced: 1 }).map((t) => moveLabel(t.move))).toEqual(['fill R0.0', 'fill R0.1'])
  })
})

describe('loss test', () => {
  it('too little damage left means no win, though the game plays on while moves remain', () => {
    const level = testLevel({ motes: motes({ red: 4 }), obstacles: [obstacle(200, 150, [3, 5])], hand: [{ layers: [layer(4, 40, 'red'), layer(3, 36, 'red')] }] })
    const s = initialEconomy(level)
    expect(damageShort(level, s)).toBe(true)
    expect(economyLost(level, s)).toBe(false) // the square can still fill and burst
    expect(isCertainLoss(loadLevel(level))).toBe(false)
    const struck = after(level, after(level, s, 'fill R0.0'), 'R0.0->O0')
    expect(economyLost(level, struck)).toBe(true) // nothing left to do: the game ends here
    const enough = { ...level, obstacles: [obstacle(200, 150, [3, 4])] }
    expect(damageShort(enough, initialEconomy(enough))).toBe(false)
  })
})

// Two triangles (7 and 5 HP) and three runes, each with a single layer to
// cast: blows of 5, 4 and 3, all at triangles. Damage equals HP exactly, so
// the blows must be packed 5 = 5 and 4 + 3 = 7: greedy aim (the biggest
// blow at the biggest obstacle) looks fine until the last blow has nowhere
// to land without waste.
const WEIGHING = testLevel({
  motes: motes({ red: 5, gold: 4, blue: 3 }),
  obstacles: [obstacle(110, 150, [3, 7]), obstacle(290, 150, [3, 5])],
  hand: [
    { layers: [layer(5, 40, 'red'), layer(3, 40, 'red')] },
    { layers: [layer(4, 40, 'gold'), layer(3, 40, 'gold')] },
    { layers: [layer(3, 40, 'blue'), layer(3, 40, 'blue')] },
  ],
})

describe('profile', () => {
  it('finds the single packing that wins, and the greedy trap that hides', () => {
    const p = profileLevel(WEIGHING)
    expect(p.winnable).toBe(true)
    expect(p.plans).toHaveLength(1)
    expect(new Set(p.plans[0].blows.map((b) => `R${b.rune}->O${b.target}`))).toEqual(new Set(['R0->O1', 'R1->O0', 'R2->O0']))
    expect(p.plans[0].wasted).toBe(0)
    const greedy = p.traps.find((t) => t.after.length === 0 && t.move === 'R0.0->O0')
    expect(greedy?.revealedAfter).toBeGreaterThanOrEqual(2)
    expect(p.blindLuck).toBeLessThan(0.5)
  })

  it('reports an unwinnable level', () => {
    const level = testLevel({ motes: motes({ red: 2 }), hand: [{ layers: [layer(3, 36, 'red'), layer(3, 36, 'red')] }] })
    const p = profileLevel(level)
    expect(p.winnable).toBe(false)
    expect(p.plans).toEqual([])
  })

  it('counts reorderings of the same blows as one plan', () => {
    const level = testLevel({
      motes: motes({ red: 6 }),
      obstacles: [obstacle(100, 150, [3, 3]), obstacle(300, 150, [4, 3])],
      hand: [{ layers: [layer(3, 36, 'red'), layer(3, 36, 'violet')] }, { layers: [layer(3, 36, 'red'), layer(4, 36, 'violet')] }],
    })
    const p = profileLevel(level)
    expect(p.plans).toHaveLength(1)
    expect(p.blindLuck).toBe(1)
  })
})

describe('solver queries', () => {
  it('reveal depth counts the moves left before the game notices', () => {
    const solver = new EconomySolver(WEIGHING)
    const greedy = after(WEIGHING, after(WEIGHING, initialEconomy(WEIGHING), 'fill R0.0'), 'R0.0->O0')
    expect(solver.canWin(greedy)).toBe(false)
    expect(solver.revealDepth(greedy)).toBeGreaterThanOrEqual(2)
  })

  it('replay follows legal moves and rejects impossible ones', () => {
    const won = replay(WEIGHING, [
      { kind: 'fill', rune: 0, layer: 0 },
      { kind: 'fire', rune: 0, layer: 0, target: 1 },
      { kind: 'fill', rune: 1, layer: 0 },
      { kind: 'fire', rune: 1, layer: 0, target: 0 },
      { kind: 'fill', rune: 2, layer: 0 },
      { kind: 'fire', rune: 2, layer: 0, target: 0 },
    ])
    expect(won && economyWon(WEIGHING, won)).toBe(true)
    expect(replay(WEIGHING, [{ kind: 'fire', rune: 1, layer: 0, target: 0 }])).toBeNull() // nothing full yet
  })
})

describe('tension', () => {
  // One triangle to break with a red square; spare reds make it relaxed.
  const board = (reds: number) => testLevel({ obstacles: [obstacle(200, 150, [3, 4])], motes: motes({ red: reds, blue: 2 }), hand: [{ layers: [layer(4, 40, 'red'), layer(3, 36, 'red')] }] })

  it('scarcity: exactly enough of a color is as tense as it gets; spares ease it; unneeded colors do not count', () => {
    const tight = new EconomySolver(board(4)).tension(initialEconomy(board(4)))
    expect(tight).toMatchObject({ margin: 0, tight: 'red', scarcity: 1, tension: 1 })
    const easy = new EconomySolver(board(6)).tension(initialEconomy(board(6)))
    expect(easy).toMatchObject({ margin: 2, tight: 'red', peril: 0 })
    expect(easy.tension).toBeCloseTo(1 / 3)
  })

  it('peril: the share of moves that lose', () => {
    // Two squares strike the triangle; one of them annihilates the reds the other needs.
    const level = testLevel({
      obstacles: [obstacle(200, 150, [3, 4], [3, 4])],
      motes: motes({ red: 8 }),
      hand: [{ layers: [layer(4, 40, 'red'), layer(3, 36, 'red')] }, { layers: [layer(4, 40, 'red', 'annihilating'), layer(3, 36, 'red')] }],
    })
    const t = new EconomySolver(level).tension(initialEconomy(level))
    expect(t.moves).toBe(2)
    expect(t.losing).toBe(0) // either order still wins: 8 reds feed both
    const first = after(level, after(level, initialEconomy(level), 'fill R1.0'), 'R1.0->O0')
    expect(new EconomySolver(level).tension(first)).toMatchObject({ margin: 0, tension: 1 }) // four reds left for the last square
  })

  it('is sampled at the start and after each detonation, and releases are counted', () => {
    const level = board(6)
    const moves = [{ kind: 'fill', rune: 0, layer: 0 } as const, { kind: 'fire', rune: 0, layer: 0, target: 0 } as const]
    const points = tensionAlong(level, moves)!
    expect(points.map((p) => p.after && moveLabel(p.after))).toEqual([null, 'R0.0->O0'])
    expect(points[1].tension.tension).toBe(0) // won
    const fake = (ts: number[]) => ts.map((t) => ({ after: null, tension: { ...points[0].tension, tension: t } }))
    expect(tensionShape(fake([0.3, 1, 0.5, 0.9, 0.2, 0]))).toEqual({ peaks: [1, 0.9], releases: 2 })
    expect(tensionShape(fake([1, 1, 1, 0]))).toEqual({ peaks: [1], releases: 0 })
  })
})

describe('ice and frost', () => {
  const C = { x: 200, y: 500 }
  const B = { x: 300, y: 640 }
  const ring = (color: MoteColor, at: { x: number; y: number }, n: number) =>
    Array.from({ length: n }, (_, i) => mote(color, at.x + Math.cos(0.3 + (i / n) * Math.PI * 2) * 40, at.y + Math.sin(0.3 + (i / n) * Math.PI * 2) * 40))
  const frostBoss = { x: 200, y: 150, layers: [{ sides: 3, radius: 30, hp: 6, frost: true }, { sides: 4, radius: 30, hp: 3 }] }
  const level = testLevel({
    obstacles: [frostBoss],
    hand: [
      { layers: [mixed(4, [4, 'red', 'blue']), layer(3, 30, 'red')] }, // strikes for 4: short of 6
      { layers: [layer(3, 40, 'gold'), layer(3, 30, 'gold')] }, // strikes for 3
      { layers: [layer(4, 40, 'gold'), layer(4, 30, 'gold')] }, // energy of a square
    ],
    motes: [...ring('red', C, 4), ...ring('gold', B, 3)],
  })

  it("a level's ice is struck by its shape and frees its motes; it never counts toward the win", () => {
    const iced = testLevel({
      obstacles: [obstacle(200, 150, [3, 4])],
      ice: [{ x: 100, y: 420, sides: 4, motes: ['gold', 'gold'] }],
      motes: motes({ red: 4 }),
      hand: [{ layers: [layer(4, 40, 'red'), layer(4, 30, 'red')] }],
    })
    const full = after(iced, initialEconomy(iced), 'fill R0.0')
    expect(labels(iced, full)).toEqual(['R0.0->I0'])
    const broke = after(iced, full, 'R0.0->I0')
    expect(pool(broke)).toEqual({ red: 4, gold: 2 })
    expect(broke.ice[0].hp).toBe(0)
    expect(economyWon(iced, broke)).toBe(false)
  })

  it('a blow short of a frost layer freezes the piece with what it released; the layer falling thaws it', () => {
    const bitten = after(level, after(level, initialEconomy(level), 'fill R0.0'), 'R0.0->O0')
    expect(bitten.obstacles[0]).toEqual({ index: 0, hp: 2 })
    expect(bitten.ice).toEqual([{ sides: 4, hp: 4, motes: [0, 4, 0, 0, 0, 0, 0, 0], by: [0, 0] }])
    expect(pool(bitten)).toEqual({ gold: 3 })
    const thawed = after(level, after(level, bitten, 'fill R1.0'), 'R1.0->O0')
    expect(thawed.obstacles[0]).toEqual({ index: 1, hp: 3 })
    expect(thawed.ice[0].hp).toBe(0)
    expect(pool(thawed)).toEqual({ blue: 4, gold: 3 })
  })

  it('the frozen piece can be broken instead', () => {
    const lvl = { ...level, motes: [...ring('red', C, 4), ...ring('gold', B, 4)] }
    const bitten = after(lvl, after(lvl, initialEconomy(lvl), 'fill R0.0'), 'R0.0->O0')
    const full = after(lvl, bitten, 'fill R2.0')
    expect(labels(lvl, full)).toContain('R2.0->I0')
    const freed = after(lvl, full, 'R2.0->I0')
    expect(pool(freed)).toEqual({ blue: 4, gold: 4 })
    expect(freed.obstacles[0]).toEqual({ index: 0, hp: 2 })
  })

  it("a sim run's moves replay in the model, ice and all", () => {
    const run = runScript(level, [{ place: 0, at: C }, { tap: 0 }, { place: 1, at: B }, { tap: 1 }], { lossCheck: false, settle: 3 })
    expect(run.error).toBeUndefined()
    expect(run.moves.map(moveLabel)).toEqual(['fill R0.0', 'R0.0->O0', 'fill R1.0', 'R1.0->O0'])
    const end = replay(level, run.moves)!
    expect(end.ice[0].hp).toBe(0)
    expect(pool(end)).toEqual({ blue: 4, gold: 3 })
    const sim = run.sim.state
    expect(sim.motes.filter((m) => m.state === 'free').map((m) => m.color).sort()).toEqual(['blue', 'blue', 'blue', 'blue', 'gold', 'gold', 'gold'])
  })
})

describe('null and void motes, prefilled bowls', () => {
  it('a bowl can take a null or a void instead of its color: each way is a move, and blanks add no power', () => {
    const level = testLevel({ motes: motes({ red: 3, null: 1, void: 1 }), obstacles: [obstacle(200, 150, [3, 4])], hand: [{ layers: [layer(4, 40, 'red', 'blue'), layer(3, 36, 'red')] }] })
    const s = initialEconomy(level)
    expect(labels(level, s).sort()).toEqual(['fill R0.0 ...n', 'fill R0.0 ...v', 'fill R0.0 ..nv'])
    // The null comes back in its bowl's color; the void comes back a void.
    const nulled = transitions(level, after(level, s, 'fill R0.0 ...n'))[0]
    expect(nulled.blow).toMatchObject({ damage: 3, wasted: 0 })
    expect(pool(nulled.next)).toEqual({ blue: 4, void: 1 })
    const voided = transitions(level, after(level, s, 'fill R0.0 ..nv'))[0]
    expect(voided.blow).toMatchObject({ damage: 2 })
    expect(pool(voided.next)).toEqual({ red: 1, blue: 3, void: 1 }) // one red was left over
  })

  it('an ash bowl destroys a void; nothing else does', () => {
    const level = testLevel({ motes: motes({ red: 2, void: 1 }), hand: [{ layers: [mixed(3, [2, 'red', 'red'], [1, 'red', 'annihilating']), layer(3, 36, 'red')] }] })
    const fills = transitions(level, initialEconomy(level))
    expect(fills.map((t) => moveLabel(t.move)).sort()).toEqual(['fill R0.0 ..v', 'fill R0.0 .v.'])
    const burst = (label: string) => pool(transitions(level, after(level, initialEconomy(level), label))[0].next)
    expect(burst('fill R0.0 ..v')).toEqual({ red: 2 }) // the ash bowl took the void
    expect(burst('fill R0.0 .v.')).toEqual({ red: 1, void: 1 }) // a red bowl let it out again
  })

  it('prefilled bowls start full: fewer motes to catch, and theirs come out at the burst', () => {
    const spec: RuneLayerSpec = { sides: 4, radius: 40, nodes: [{ catch: 'red', release: 'red', prefilled: 'real' }, { catch: 'red', release: 'red' }, { catch: 'red', release: 'red' }, { catch: 'red', release: 'red', prefilled: 'null' }] }
    const level = testLevel({ motes: motes({ red: 2 }), obstacles: [obstacle(200, 150, [3, 5])], hand: [{ layers: [spec, layer(3, 36, 'red')] }] })
    const s = initialEconomy(level)
    expect(labels(level, s)).toEqual(['fill R0.0 ...n'])
    const fired = transitions(level, after(level, s, 'fill R0.0 ...n'))[0]
    expect(fired.blow).toMatchObject({ damage: 3 }) // the real one counts, the null does not
    expect(pool(fired.next)).toEqual({ red: 4 }) // two caught, two it brought
  })

  it("a sim run's fills with blanks replay in the model", () => {
    const C = { x: 200, y: 500 }
    const level = testLevel({ motes: [mote('red', C.x - 8, C.y), mote('red', C.x + 8, C.y), mote('red', C.x, C.y - 8), mote('null', C.x, C.y + 8)], obstacles: [obstacle(200, 150, [3, 3])], hand: [{ layers: [layer(4, 40, 'red', 'blue'), layer(3, 36, 'red')] }] })
    const run = runScript(level, [{ place: 0, at: C }, { tap: 0 }], { settle: 3 })
    expect(run.error).toBeUndefined()
    expect(run.moves.map(moveLabel)).toEqual(['fill R0.0 ...n', 'R0.0->O0'])
    expect(run.status).toBe('won')
    expect(economyWon(level, replay(level, run.moves)!)).toBe(true)
  })
})

describe('two-shape layers', () => {
  const A = { x: 110, y: 500 }
  const B = { x: 290, y: 500 }
  const around = (color: MoteColor, at: { x: number; y: number }, n: number) => Array.from({ length: n }, (_, i) => mote(color, at.x + Math.cos(i * 1.6) * 10, at.y + Math.sin(i * 1.6) * 10))
  const twoShape = (hp: number) => ({ x: 200, y: 150, layers: [{ sides: 3, pair: 4, radius: 30, hp }] })
  const redSquare = { layers: [layer(4, 40, 'red'), layer(3, 36, 'red')] } // strikes as a triangle
  const blueTriangle = { layers: [layer(3, 40, 'blue'), layer(4, 36, 'blue')] } // strikes as a square
  const level = testLevel({ motes: [...around('red', A, 4), ...around('blue', B, 3)], obstacles: [twoShape(6)], hand: [redSquare, blueTriangle] })
  const play = (lvl: typeof level, ...moves: string[]) => moves.reduce((s, m) => after(lvl, s, m), initialEconomy(lvl))

  it('a full piece of either shape goes into stasis there, and never bursts alone', () => {
    const s = play(level, 'fill R0.0')
    expect(labels(level, s)).toEqual(['fill R1.0', 'R0.0=>O0'])
    expect(labels(level, after(level, s, 'R0.0=>O0'))).toEqual(['fill R1.0'])
  })

  it('the pair bursts as one blow of their combined power', () => {
    const s = play(level, 'fill R0.0', 'R0.0=>O0', 'fill R1.0', 'R1.0=>O0')
    const [pair, ...rest] = transitions(level, s)
    expect(rest).toEqual([])
    expect(moveLabel(pair.move)).toBe('R0.0+R1.0->O0')
    expect(pair.blow).toMatchObject({ damage: 6, wasted: 1, with: { rune: 1, layer: 0 } })
    expect(economyWon(level, pair.next)).toBe(true)
    expect(pool(pair.next)).toEqual({ red: 4, blue: 3 })
    expect(profileLevel(level).plans.map((p) => p.blows.length)).toEqual([1])
  })

  it('with its place held, another piece of that shape goes unlinked; with no partner to come, it is lost', () => {
    const twins = testLevel({ motes: motes({ red: 8 }), obstacles: [twoShape(6)], hand: [redSquare, redSquare] })
    const s = play(twins, 'fill R0.0', 'R0.0=>O0', 'fill R1.0')
    expect(labels(twins, s)).toEqual(['R1.0 unlinked'])
    expect(economyLost(twins, after(twins, s, 'R1.0 unlinked'))).toBe(true)
  })

  it('a two-shape layer takes its strength from both its shapes', () => {
    expect(damageShort(level, initialEconomy(level))).toBe(false) // 4 + 3 against 6
    const strong = { ...level, obstacles: [twoShape(8)] }
    expect(damageShort(strong, initialEconomy(strong))).toBe(true)
  })

  it("a sim run's stasis and pair burst replay in the model", () => {
    const run = runScript(level, [{ place: 0, at: A }, { place: 1, at: B }, { tap: 1 }], { settle: 3 })
    expect(run.error).toBeUndefined()
    expect(run.status).toBe('won')
    const labelsRun = run.moves.map(moveLabel)
    expect(labelsRun.slice(-1)).toEqual(['R0.0+R1.0->O0'])
    expect([...labelsRun].sort()).toEqual(['R0.0+R1.0->O0', 'R0.0=>O0', 'R1.0=>O0', 'fill R0.0', 'fill R1.0'])
    expect(economyWon(level, replay(level, run.moves)!)).toBe(true)
  })
})

describe('shields', () => {
  const A = { x: 110, y: 500 }
  const B = { x: 290, y: 500 }
  const around = (colors: MoteColor[], at: { x: number; y: number }) => colors.map((c, i) => mote(c, at.x + Math.cos(i * 1.6) * 10, at.y + Math.sin(i * 1.6) * 10))
  const mixedSquare = (a: Hue, b: Hue): RuneLayerSpec => ({ sides: 4, radius: 40, nodes: [a, a, b, b].map((c) => ({ catch: c, release: c })) })
  // O0: a triangle (strength 4) behind a ruby shield, then a triangle (3).
  const shielded = (strength: number) => ({ x: 200, y: 150, layers: [{ sides: 3, radius: 30, hp: 4, shields: [{ color: 'red' as const, strength }] }, { sides: 3, radius: 30, hp: 3 }] })
  const puller = { layers: [mixedSquare('red', 'blue'), layer(3, 36, 'red')] } // two ruby bowls, two sapphire
  const striker = { layers: [layer(4, 40, 'blue'), layer(3, 36, 'blue')] }
  const level = testLevel({ motes: [...around(['red', 'red', 'blue', 'blue'], A), ...around(['blue', 'blue', 'blue', 'blue'], B)], obstacles: [shielded(2)], hand: [puller, striker] })
  const play = (lvl: typeof level, ...moves: string[]) => moves.reduce((s, m) => after(lvl, s, m), initialEconomy(lvl))

  it("a layer with bowls of a shield's color can be cast as a puller, filling just those bowls", () => {
    const s = initialEconomy(level)
    expect(labels(level, s)).toEqual(['fill R0.0', 'pull R0.0=>O0', 'fill R1.0'])
    const pulled = after(level, s, 'pull R0.0=>O0')
    expect(pulled.pieces).toEqual([{ rune: 0, layer: 0, full: false, pulling: 0, hold: '..__' }])
    expect(pool(pulled)).toEqual({ blue: 6 })
  })

  it('while a shield is up nothing strikes the layer: a striker waits; pulled down, it strikes', () => {
    const s = play(level, 'fill R1.0')
    expect(labels(level, s)).not.toContain('R1.0->O0')
    expect(labels(level, s)).not.toContain('R1.0 unlinked')
    const down = after(level, s, 'pull R0.0=>O0')
    expect(labels(level, down)).toContain('R1.0->O0')
  })

  it('pullers never burst; the fall frees them, to be filled and fired', () => {
    let s = play(level, 'pull R0.0=>O0', 'fill R0.0')
    expect(labels(level, s)).toEqual(['fill R1.0']) // the full puller has nothing to do
    s = play(level, 'pull R0.0=>O0', 'fill R1.0', 'R1.0->O0')
    expect(s.obstacles[0]).toEqual({ index: 1, hp: 3 })
    expect(s.pieces).toEqual([{ rune: 0, layer: 0, full: false, hold: '..__' }])
    s = after(level, s, 'fill R0.0')
    expect(labels(level, s)).toEqual(['R0.0->O0'])
    expect(economyWon(level, after(level, s, 'R0.0->O0'))).toBe(true)
  })

  it('pullers add up, and a full piece can latch on as it is', () => {
    const strong = testLevel({ motes: [...around(['red', 'red', 'blue', 'blue'], A), ...around(['red', 'red', 'blue', 'blue'], B), ...around(['blue', 'blue', 'blue', 'blue'], { x: 200, y: 650 })], obstacles: [shielded(4)], hand: [puller, puller, striker] })
    const one = play(strong, 'pull R0.0=>O0', 'fill R2.0')
    expect(labels(strong, one)).not.toContain('R2.0->O0') // still up: two of four
    const full = after(strong, one, 'fill R1.0')
    expect(labels(strong, full)).toContain('pull R1.0=>O0')
    expect(labels(strong, after(strong, full, 'pull R1.0=>O0'))).toContain('R2.0->O0')
  })

  it("a sim run's pulls replay in the model", () => {
    const run = runScript(level, [{ place: 0, at: A }, { place: 1, at: B }, { wait: 1 }, { tap: 1 }, { tap: 0 }], { settle: 3 })
    expect(run.error).toBeUndefined()
    expect(run.status).toBe('won')
    expect(run.moves.map(moveLabel)).toEqual(['pull R0.0=>O0', 'fill R0.0', 'fill R1.0', 'R1.0->O0', 'R0.0->O0'])
    expect(economyWon(level, replay(level, run.moves)!)).toBe(true)
  })
})
