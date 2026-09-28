import { describe, expect, it } from 'vitest'
import { ECONOMY_COLORS, EconomySolver, damageShort, economyWon, initialEconomy, moveLabel, profileLevel, replay, transitions, type Economy } from './solver'
import { loadLevel } from './loadLevel'
import { isCertainLoss } from './progress'
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
})

describe('loss test', () => {
  it("matches the game's damage check on the same board", () => {
    const level = testLevel({ motes: motes({ red: 4 }), obstacles: [obstacle(200, 150, [3, 5])], hand: [{ layers: [layer(4, 40, 'red'), layer(3, 36, 'red')] }] })
    expect(damageShort(level, initialEconomy(level))).toBe(true)
    expect(isCertainLoss(loadLevel(level))).toBe(true)
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
