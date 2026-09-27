import type { MiasmaPuff } from '../model/MiasmaPuff'
import type { Rect } from '../core/Layout'
import { clamp, randRange } from '../utils/math'

const WANDER_JITTER = 40 // px/s^2, keeps free puffs meandering rather than gliding straight
const MAX_SPEED = 26 // px/s

// A freshly-detonated puff decays from DetonationSystem's EJECT_SPEED launch
// down toward ambient MAX_SPEED — friction-based, not the wander jitter
// above (which would take forever to bleed off a fast launch), and capped
// by EJECT_MAX_SECONDS so a puff that (rarely) never quite decays below
// MAX_SPEED still hands off to normal wander instead of drifting fast forever.
const EJECT_FRICTION = 2.4 // 1/s — higher = snappier decay
const EJECT_MAX_SECONDS = 1.2

// Ambient drift for puffs not currently being pulled toward a rune.
export class MiasmaFieldSystem {
  update(puffs: MiasmaPuff[], dt: number, bounds: Rect): void {
    const minX = bounds.x
    const maxX = bounds.x + bounds.width
    const minY = bounds.y
    const maxY = bounds.y + bounds.height

    for (const puff of puffs) {
      if (puff.state === 'ejecting') {
        this.advanceEjecting(puff, dt, minX, maxX, minY, maxY)
        continue
      }
      if (puff.state !== 'free') continue

      puff.velocity.x += randRange(-WANDER_JITTER, WANDER_JITTER) * dt
      puff.velocity.y += randRange(-WANDER_JITTER, WANDER_JITTER) * dt
      const speed = Math.hypot(puff.velocity.x, puff.velocity.y)
      if (speed > MAX_SPEED) {
        puff.velocity.x = (puff.velocity.x / speed) * MAX_SPEED
        puff.velocity.y = (puff.velocity.y / speed) * MAX_SPEED
      }

      puff.position.x = clamp(puff.position.x + puff.velocity.x * dt, minX, maxX)
      puff.position.y = clamp(puff.position.y + puff.velocity.y * dt, minY, maxY)
      if (puff.position.x <= minX || puff.position.x >= maxX) puff.velocity.x *= -1
      if (puff.position.y <= minY || puff.position.y >= maxY) puff.velocity.y *= -1
    }
  }

  private advanceEjecting(puff: MiasmaPuff, dt: number, minX: number, maxX: number, minY: number, maxY: number): void {
    puff.ejectElapsed = (puff.ejectElapsed ?? 0) + dt

    const decay = Math.exp(-EJECT_FRICTION * dt)
    puff.velocity.x *= decay
    puff.velocity.y *= decay

    puff.position.x = clamp(puff.position.x + puff.velocity.x * dt, minX, maxX)
    puff.position.y = clamp(puff.position.y + puff.velocity.y * dt, minY, maxY)
    if (puff.position.x <= minX || puff.position.x >= maxX) puff.velocity.x *= -1
    if (puff.position.y <= minY || puff.position.y >= maxY) puff.velocity.y *= -1

    const speed = Math.hypot(puff.velocity.x, puff.velocity.y)
    if (speed <= MAX_SPEED || puff.ejectElapsed >= EJECT_MAX_SECONDS) {
      puff.state = 'free'
      puff.ejectElapsed = undefined
    }
  }
}
