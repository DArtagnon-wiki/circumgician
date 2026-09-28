import { Container, Sprite } from 'pixi.js'
import type { Mote, MoteStateKind } from '../sim/types'
import { colorForMote, lighten, opal } from './Theme'
import { textures } from './textures'
import type { SmokeSystem } from './SmokeSystem'

const TAU = Math.PI * 2
const GLOW = 128 // texture sizes, for converting px to scale
const DROP = 48

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// A mote is smoke with a luminous heart: an additive halo, a saturated
// body and a hot center, shedding lazy wisps into the shared SmokeSystem.
// Traveling motes tighten into a spiraling stream; ejecting motes fly as a
// liquid droplet that congeals back into smoke where they land; coasting
// motes stretch and trail. Held motes are drawn by their rune's bowl.
export class MoteView {
  readonly container = new Container()
  private halo: Sprite
  private body: Sprite
  private hot: Sprite
  private drop: Sprite
  private smoke: SmokeSystem
  private phase = Math.random() * TAU
  private emitAcc = Math.random() * 0.1
  private prevState: MoteStateKind | null = null

  constructor(smoke: SmokeSystem) {
    this.smoke = smoke
    const t = textures()
    this.halo = new Sprite(t.glow)
    this.halo.blendMode = 'add'
    this.body = new Sprite(t.glow)
    this.hot = new Sprite(t.glow)
    this.hot.blendMode = 'add'
    this.drop = new Sprite(t.droplet)
    for (const s of [this.halo, this.body, this.hot, this.drop]) s.anchor.set(0.5)
    this.container.addChild(this.halo, this.body, this.drop, this.hot)
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }

  sync(mote: Mote, dt: number, time: number): void {
    const prev = this.prevState
    this.prevState = mote.state
    if (mote.state === 'held') {
      this.container.visible = false
      return
    }
    this.container.visible = true
    const generic = mote.color === 'generic'
    const color = generic ? opal(time, this.phase) : colorForMote(mote.color)
    const wisp = generic ? color : lighten(color, 0.12)
    const { x, y } = mote.pos
    for (const s of [this.halo, this.body, this.hot]) s.position.set(x, y)
    this.halo.tint = color
    this.body.tint = color
    this.hot.tint = lighten(color, generic ? 0.3 : 0.5)
    this.halo.rotation = 0
    this.drop.visible = false
    const breathe = 1 + Math.sin(time * 2.2 + this.phase) * 0.06
    let heart = 1 // body scale factor
    let alpha = 1
    let stretched = false

    if (mote.state === 'traveling' && mote.travelFrom) {
      // Condensing: the heart tightens and a spiral stream pours after it.
      const t = mote.t ?? 0
      heart = 1 - 0.45 * t
      const dx = x - mote.travelFrom.x
      const dy = y - mote.travelFrom.y
      const d = Math.hypot(dx, dy) || 1
      this.every(dt, 0.016, () => {
        const swirl = Math.sin(time * 26 + this.phase) * 7 * (1 - t)
        this.smoke.emit(x + (-dy / d) * swirl, y + (dx / d) * swirl, wisp, {
          size: 16 * (1 - 0.5 * t),
          life: 0.3,
          alpha: 0.6,
          grow: 0.55,
          add: true,
          vx: (dx / d) * 70,
          vy: (dy / d) * 70,
          opal: generic ? this.phase : undefined,
        })
      })
    } else if (mote.state === 'ejecting' && mote.ejectFrom) {
      // A liquid droplet in flight, turning back into smoke as it lands.
      const t = mote.t ?? 0
      const dx = mote.home.x - mote.ejectFrom.x
      const dy = mote.home.y - mote.ejectFrom.y
      const liquid = 1 - smooth(0.55, 0.95, t)
      this.drop.visible = liquid > 0.01
      this.drop.position.set(x, y)
      this.drop.rotation = Math.atan2(dy, dx)
      this.drop.scale.set((16 / DROP) * (1 + (1 - t) * 0.5), 11 / DROP)
      this.drop.tint = color
      this.drop.alpha = liquid
      alpha = 1 - liquid
      if (t > 0.45) {
        this.every(dt, 0.045, () =>
          this.smoke.emit(x, y, wisp, { size: 14, life: 0.8, alpha: 0.8 * (t - 0.4), grow: 2.2, add: true, opal: generic ? this.phase : undefined }),
        )
      }
    } else {
      if (prev === 'ejecting') this.burst(x, y, wisp, generic, 6)
      const speed = mote.vel ? Math.hypot(mote.vel.x, mote.vel.y) : 0
      if (speed > 15 && mote.vel) {
        // Coasting after a kick or a push: stretched, with a trail.
        const stretch = Math.min(1, speed / 160)
        stretched = true
        this.halo.rotation = Math.atan2(mote.vel.y, mote.vel.x)
        this.halo.scale.set(((44 * (1 + stretch)) / GLOW) * breathe, (40 / GLOW) * breathe)
        this.every(dt, Math.max(0.016, 0.06 - speed * 0.00025), () =>
          this.smoke.emit(x, y, wisp, {
            size: 15,
            life: 0.75 + Math.random() * 0.3,
            alpha: 0.5,
            grow: 2.3,
            add: true,
            vx: -mote.vel!.x * 0.12 + (Math.random() - 0.5) * 8,
            vy: -mote.vel!.y * 0.12 + (Math.random() - 0.5) * 8,
            opal: generic ? this.phase : undefined,
          }),
        )
      } else {
        this.every(dt, 0.065, () =>
          this.smoke.emit(x + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 4, wisp, {
            size: 11 + Math.random() * 4,
            life: 1.1 + Math.random() * 0.4,
            alpha: 0.42,
            grow: 2.8,
            add: true,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10 - 3,
            opal: generic ? this.phase : undefined,
          }),
        )
      }
    }

    if (!stretched) this.halo.scale.set((44 / GLOW) * breathe * heart)
    this.body.scale.set((19 / GLOW) * heart)
    this.hot.scale.set((7 / GLOW) * heart * breathe)
    this.halo.alpha = 0.3 * alpha
    this.body.alpha = alpha
    this.hot.alpha = 0.75 * alpha
  }

  // A puff of smoke from this mote (landing, a kick).
  burst(x: number, y: number, color: number, generic: boolean, n: number, vx = 0, vy = 0): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.5
      const v = 14 + Math.random() * 16
      this.smoke.emit(x, y, color, {
        size: 14 + Math.random() * 6,
        life: 0.7 + Math.random() * 0.4,
        alpha: 0.5,
        grow: 2.4,
        add: true,
        vx: Math.cos(a) * v + vx,
        vy: Math.sin(a) * v + vy,
        opal: generic ? this.phase : undefined,
      })
    }
  }

  // Runs `fn` once per `interval` seconds of accumulated time (scaled by
  // the smoke system's quality rate).
  private every(dt: number, interval: number, fn: () => void): void {
    const step = interval / Math.max(0.05, this.smoke.rate)
    this.emitAcc += dt
    let guard = 4
    while (this.emitAcc >= step && guard-- > 0) {
      this.emitAcc -= step
      fn()
    }
    if (this.emitAcc > step) this.emitAcc = 0
  }
}
