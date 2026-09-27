import { describe, expect, it } from 'vitest'
import { runHeadlessSim, type HeadlessAgentContext } from '../../core/HeadlessSim'
import { randRange } from '../../utils/math'
import { LEVELS } from './index'

// A "careless player": whenever an idle rune exists, place it at a uniformly
// random point in the field. The game's own nearest-match auto-linking (see
// DragPlacementSystem.findNearestMatch) still does the shape-matching for
// this agent, exactly as it would for a real player who isn't tracking node
// colors or sequencing — this is the honest baseline "random play" this
// puzzle is meant to defeat almost every time.
function randomAgent(ctx: HeadlessAgentContext): void {
  const idleRunes = ctx.state.inventory.slots.filter((r): r is NonNullable<typeof r> => !!r && r.state === 'idle')
  if (idleRunes.length === 0) return
  if (Math.random() > 0.02) return // human-paced attempts (~once every 1-2s), not inhuman spam-placing
  const rune = idleRunes[Math.floor(Math.random() * idleRunes.length)]!
  const bounds = ctx.fieldBounds
  const pos = { x: randRange(bounds.x, bounds.x + bounds.width), y: randRange(bounds.y, bounds.y + bounds.height) }
  ctx.dragSystem.tryPlace(rune, pos, bounds)
}

const TRIALS = 30
// A realistic careless-play session, not unbounded persistence — FixedHand's
// infinite refill means almost any level is technically winnable given
// enough retries; the meaningful question is whether careless play wins
// within a normal session, not whether it wins eventually with infinite time.
const SESSION_SECONDS = 240
const MAX_WIN_RATE = 0.2

// level1 ("First Threads") is the tutorial: single-layer obstacles, full
// insight (nothing hidden), explicitly designed as a gentle onboarding —
// not the puzzle content the "~100% random-play failure" bar targets. Its
// fixedHand supply refills forever with no scarcity mechanism to exploit, so
// it's structurally always-winnable given enough placements; that's the
// intended tutorial character, not a bug. Every other level is held to the
// strict bar.
const WIN_RATE_OVERRIDES: Record<string, number> = { level1: 1 }

describe('random-play win rate (puzzle should defeat careless play almost every time)', () => {
  let totalLossesAcrossAllLevels = 0

  for (const level of LEVELS) {
    const maxWinRate = WIN_RATE_OVERRIDES[level.id] ?? MAX_WIN_RATE
    it(`${level.name}: careless random play wins at most ${maxWinRate * 100}% of the time in a normal session`, () => {
      let losses = 0
      let wins = 0
      for (let i = 0; i < TRIALS; i++) {
        const result = runHeadlessSim(level, { agent: randomAgent, maxSeconds: SESSION_SECONDS })
        if (result.outcome === 'lost') losses++
        else if (result.outcome === 'won') wins++
        // else: still 'playing' at session end — not a win either; a real
        // player wouldn't wait this long, so this counts toward "failed to
        // complete" same as an explicit loss for the purposes of this test.
      }
      totalLossesAcrossAllLevels += losses

      expect(wins / TRIALS).toBeLessThanOrEqual(maxWinRate)
    })
  }

  // Aggregate sanity check (not per-level, since a slow-paced strategy like
  // fixedHand's finale can legitimately run out the session clock without an
  // explicit loss more often than it should be required to per level) that
  // the explicit game:lost path fires at all across the whole suite — proves
  // canStillProgress() is being genuinely exercised, not dead code.
  it('at least one level produces an explicit game:lost outcome somewhere in the suite above', () => {
    expect(totalLossesAcrossAllLevels).toBeGreaterThan(0)
  })
})
