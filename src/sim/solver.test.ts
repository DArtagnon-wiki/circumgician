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

describe('economy moves', () => {
  it('fills from exact colors first; generics cover only the shortfall', () => {
    const level = testLevel({ motes: motes({ red: 1, blue: 2, generic: 2 }), hand: [{ layers: [mixed(3, [2, 'red', 'red'], [1, 'blue', 'blue']), layer(3, 36, 'red')] }] })
    const fill = transitions(level, initialEconomy(level))[0]
    expect(moveLabel(fill.move)).toBe('fill R0')
    expect(pool(fill.next)).toEqual({ blue: 1, generic: 1 })
  })

  it('cannot fill a layer the free colors cannot cover', () => {
    const level = testLevel({ motes: motes({ red: 2, generic: 1 }), hand: [{ layers: [layer(4, 40, 'red'), layer(3, 36, 'red')] }] })
    expect(transitions(level, initialEconomy(level))).toEqual([])
  })

  it('links only to obstacles whose current layer matches the middle, else fires unlinked', () => {
    const level = testLevel({
      motes: motes({ red: 8 }),
      obstacles: [obstacle(100, 150, [3, 5]), obstacle(300, 150, [4, 5]), obstacle(200, 150, [3, 5])],
      hand: [{ layers: [layer(4, 40, 'red'), layer(3, 36, 'red')] }, { layers: [layer(4, 40, 'red'), layer(5, 36, 'red')] }],
    })
    let s = initialEconomy(level)
    for (const r of [0, 1]) s = transitions(level, s).find((t) => moveLabel(t.move) === `fill R${r}`)!.next
    expect(labels(level, s)).toEqual(['R0->O0', 'R0->O2', 'R1 unlinked'])
  })

  it('damage never carries into the next layer; the excess is wasted', () => {
    const level = testLevel({ motes: motes({ red: 4 }), obstacles: [obstacle(200, 150, [3, 2], [3, 5])], hand: [{ layers: [layer(4, 40, 'red'), layer(3, 36, 'red')] }] })
    const end = transitions(level, transitions(level, initialEconomy(level))[0].next)[0]
    expect(end.blow).toMatchObject({ damage: 2, wasted: 2, target: 0, targetLayer: 0, unlinked: false })
    expect(end.next.obstacles[0]).toEqual({ index: 1, hp: 5 })
  })

  it('releases recolor by node; annihilating nodes destroy their motes', () => {
    const level = testLevel({ motes: motes({ red: 4 }), hand: [{ layers: [mixed(4, [2, 'red', 'gold'], [1, 'red', 'generic'], [1, 'red', 'annihilating'])] }] })
    const fired = transitions(level, transitions(level, initialEconomy(level))[0].next)[0]
    expect(pool(fired.next)).toEqual({ gold: 2, generic: 1 })
    expect(fired.next.runes[0]).toEqual({ index: 1, full: false })
  })

  it('a last layer fires unlinked without counting as a wasted link', () => {
    const level = testLevel({ motes: motes({ red: 3 }), hand: [{ layers: [layer(3, 36, 'red')] }] })
    const fired = transitions(level, transitions(level, initialEconomy(level))[0].next)[0]
    expect(fired.blow).toMatchObject({ target: null, damage: 0, unlinked: false })
  })

  it('maxPlaced limits how many runes can sit on the field', () => {
    const level = testLevel({ motes: motes({ red: 6 }), hand: [{ layers: [layer(3, 36, 'red')] }, { layers: [layer(3, 36, 'red')] }] })
    const one = transitions(level, initialEconomy(level), { maxPlaced: 1 })[0].next
    expect(transitions(level, one, { maxPlaced: 1 }).map((t) => moveLabel(t.move))).toEqual(['R0 unlinked'])
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

// Three triangles (6, 5, 4 HP) and four blows that can only hit triangles
// (5, 4, 3, 3). Damage equals HP exactly, so the blows must be packed:
// greedy aim (the biggest blow at the biggest obstacle) looks fine until
// the last blow has nowhere to land without waste.
const WEIGHING = testLevel({
  motes: motes({ red: 5 }),
  obstacles: [obstacle(70, 150, [3, 6]), obstacle(200, 150, [3, 5]), obstacle(330, 150, [3, 4])],
  hand: [
    { layers: [layer(5, 40, 'red', 'gold'), layer(3, 36, 'violet')] },
    { layers: [layer(4, 40, 'gold', 'blue'), layer(3, 36, 'violet')] },
    { layers: [layer(3, 36, 'blue', 'red'), layer(3, 36, 'red', 'gold'), layer(3, 36, 'violet')] },
  ],
})

describe('profile', () => {
  it('finds the single packing that wins, and the greedy trap that hides', () => {
    const p = profileLevel(WEIGHING)
    expect(p.winnable).toBe(true)
    expect(p.plans.map((plan) => plan.blows.map((b) => `R${b.rune}->O${b.target}`).join(' '))).toEqual(['R0->O1 R1->O2 R2->O0 R2->O0'])
    expect(p.plans[0].wasted).toBe(0)
    const greedy = p.traps.find((t) => t.after.length === 0 && t.move === 'R0->O0')
    expect(greedy?.revealedAfter).toBeGreaterThanOrEqual(2)
    expect(p.traps.find((t) => t.after.length === 0 && t.move === 'R0->O2')?.revealedAfter).toBe(0) // 5 into 4 wastes at once
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
    const start = initialEconomy(WEIGHING)
    const filled = solver.moves(start).find((t) => moveLabel(t.move) === 'fill R0')!.next
    const greedy = solver.moves(filled).find((t) => moveLabel(t.move) === 'R0->O0')!.next
    expect(solver.canWin(greedy)).toBe(false)
    expect(solver.revealDepth(greedy)).toBeGreaterThanOrEqual(2)
  })

  it('replay follows legal moves and rejects impossible ones', () => {
    const won = replay(WEIGHING, [
      { kind: 'fill', rune: 0 },
      { kind: 'fire', rune: 0, target: 1 },
      { kind: 'fill', rune: 1 },
      { kind: 'fire', rune: 1, target: 2 },
      { kind: 'fill', rune: 2 },
      { kind: 'fire', rune: 2, target: 0 },
      { kind: 'fill', rune: 2 },
      { kind: 'fire', rune: 2, target: 0 },
    ])
    expect(won && economyWon(WEIGHING, won)).toBe(true)
    expect(replay(WEIGHING, [{ kind: 'fill', rune: 1 }])).toBeNull() // no gold yet
  })
})
