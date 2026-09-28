// Adaptive detail. The governor watches the rolling frame interval (which
// includes GPU-bound slowness, unlike timing our own code) and steps the
// detail tier down when frames run long, and back up after a sustained
// fast stretch. Views read `quality.settings` each frame.

export type Tier = 0 | 1 | 2

export interface TierSettings {
  smokeRate: number // emission multiplier
  smokeCap: number // live puffs
  stars: number // drifting star sprites
  glows: boolean // secondary glows: mote halos, rune auras, bowl glow
  maxResolution: number // renderer resolution cap (fill rate)
}

export const TIERS: Record<Tier, TierSettings> = {
  2: { smokeRate: 1, smokeCap: 480, stars: 48, glows: true, maxResolution: 2 },
  1: { smokeRate: 0.6, smokeCap: 280, stars: 28, glows: true, maxResolution: 2 },
  0: { smokeRate: 0.3, smokeCap: 120, stars: 12, glows: false, maxResolution: 1.5 },
}

export const quality = { tier: 2 as Tier, settings: TIERS[2] }

const SLOW_MS = 18 // average frame interval that counts as missing 60fps
const FAST_MS = 17.5 // ...and as holding it (vsync caps a 60Hz screen at 16.7)
const DROP_AFTER = 2 // seconds of slow average before stepping down
const CLIMB_AFTER = 8 // seconds of fast average before trying a step up
const SMOOTHING = 0.5 // seconds, time constant of the moving average
const HITCH_MS = 100 // longer frames (tab switches, GC) are ignored
const WARMUP = 1 // seconds ignored after a (re)start: uploads and JIT
const FAILED_CLIMB = 6 // a drop this soon after a climb means it failed
const MAX_CLIMB_AFTER = 120

export class QualityGovernor {
  avgMs = 1000 / 60
  private slowFor = 0
  private fastFor = 0
  private climbAfter = CLIMB_AFTER
  private sinceClimb = Infinity
  private warmup = WARMUP
  pinned: Tier | null = null // debug: hold a tier, no adapting
  onChange: (tier: Tier) => void

  constructor(onChange: (tier: Tier) => void = () => {}) {
    this.onChange = onChange
  }

  get fps(): number {
    return 1000 / this.avgMs
  }

  // Skip the next moments (a scene just started).
  restart(): void {
    this.warmup = WARMUP
    this.slowFor = 0
    this.fastFor = 0
  }

  sample(frameMs: number): void {
    if (!(frameMs > 0) || frameMs > HITCH_MS) return
    const dt = frameMs / 1000
    if (this.warmup > 0) {
      this.warmup -= dt
      return
    }
    this.avgMs += (frameMs - this.avgMs) * (1 - Math.exp(-dt / SMOOTHING))
    this.sinceClimb += dt
    if (this.pinned !== null) return
    if (this.avgMs > SLOW_MS) {
      this.slowFor += dt
      this.fastFor = 0
      if (this.slowFor >= DROP_AFTER && quality.tier > 0) {
        // Failing soon after a climb means that tier is too rich here:
        // wait twice as long before trying it again.
        if (this.sinceClimb < FAILED_CLIMB) this.climbAfter = Math.min(MAX_CLIMB_AFTER, this.climbAfter * 2)
        this.set((quality.tier - 1) as Tier)
      }
    } else {
      this.slowFor = 0
      if (this.avgMs < FAST_MS) this.fastFor += dt
      if (this.fastFor >= this.climbAfter && quality.tier < 2) {
        this.sinceClimb = 0
        this.set((quality.tier + 1) as Tier)
      }
    }
  }

  pin(tier: Tier | null): void {
    this.pinned = tier
    if (tier !== null) this.set(tier)
  }

  private set(tier: Tier): void {
    this.slowFor = 0
    this.fastFor = 0
    if (tier === quality.tier) return
    quality.tier = tier
    quality.settings = TIERS[tier]
    this.onChange(tier)
  }
}

// The session's governor; AppShell feeds it frames while a level runs.
export const governor = new QualityGovernor()
