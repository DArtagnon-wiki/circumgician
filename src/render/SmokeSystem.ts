import { Container, Sprite, type Texture } from 'pixi.js'
import { opal } from './Theme'
import { textures } from './textures'

export interface PuffOptions {
  size: number // starting diameter, px
  life: number // seconds
  alpha: number // peak opacity
  grow?: number // end size as a multiple of start (default 2)
  vx?: number
  vy?: number
  skew?: number // radians this wisp is turned off the flow direction
  opal?: number // if set, tint shifts through opal() from this seed
  add?: boolean // additive (glowing) rather than normal blending
}

type Blend = 'add' | 'normal'

interface Puff {
  s: Sprite
  blend: Blend
  fx: number // current flow velocity, for the streak direction
  fy: number
  age: number
  life: number
  x: number
  y: number
  vx: number
  vy: number
  size0: number
  grow: number
  alpha: number
  skew: number
  opal: number // NaN when not opal
}

const RISE = 9 // px/s: smoke drifts gently up the screen
const CURL = 13 // px/s: strength of the swirling flow field
const STRETCH = 0.035 // elongation per px/s of flow speed: wisps streak along it

// Pooled sprite smoke. Each puff rides a cheap divergence-free flow (the
// curl of a sum of waves), so wisps swirl without clumping, while
// growing and fading. Quality tiers scale the emission rate and the cap.
export class SmokeSystem {
  readonly container = new Container()
  // Normal and additive puffs live in separate layers (and pools), so the
  // whole system draws in two batches however they interleave.
  private layers: Record<Blend, Container> = { normal: new Container(), add: new Container() }
  private pools: Record<Blend, Puff[]> = { normal: [], add: [] }
  private puffs: Puff[] = []
  private textures: Texture[]
  private time = 0
  rate = 1 // emission multiplier (callers scale their spawn intervals)
  cap = 480 // ~20 live puffs for each of endless's 18 motes, plus bursts

  constructor() {
    this.container.eventMode = 'none'
    this.layers.add.blendMode = 'add'
    this.container.addChild(this.layers.normal, this.layers.add)
    this.textures = textures().smoke
  }

  get live(): number {
    return this.puffs.length
  }

  emit(x: number, y: number, color: number, o: PuffOptions): void {
    if (this.puffs.length >= this.cap) return
    const blend: Blend = o.add ? 'add' : 'normal'
    let p = this.pools[blend].pop()
    if (!p) {
      const s = new Sprite(this.textures[0])
      s.anchor.set(0.5)
      this.layers[blend].addChild(s)
      p = { s, blend, fx: 0, fy: 0, age: 0, life: 1, x: 0, y: 0, vx: 0, vy: 0, size0: 1, grow: 2, alpha: 1, skew: 0, opal: NaN }
    }
    p.s.texture = this.textures[(Math.random() * this.textures.length) | 0]
    p.s.visible = true
    p.s.tint = color
    p.age = 0
    p.life = o.life
    p.x = x
    p.y = y
    p.vx = o.vx ?? 0
    p.vy = o.vy ?? 0
    p.size0 = o.size
    p.grow = o.grow ?? 2
    p.alpha = o.alpha
    p.skew = o.skew ?? (Math.random() - 0.5) * 0.18
    p.opal = o.opal ?? NaN
    p.fx = p.vx
    p.fy = p.vy - RISE
    this.place(p)
    this.puffs.push(p)
  }

  update(dt: number): void {
    this.time += dt
    const t = this.time
    const drag = Math.exp(-2.2 * dt)
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]
      p.age += dt
      if (p.age >= p.life) {
        p.s.visible = false
        this.pools[p.blend].push(p)
        this.puffs[i] = this.puffs[this.puffs.length - 1]
        this.puffs.pop()
        continue
      }
      // Velocity field v = (dpsi/dy, -dpsi/dx) for
      // psi = sin(.04x + .9t) cos(.05y - .7t) + .5 sin(.02(x + y) + .4t).
      const ax = 0.04 * p.x + 0.9 * t
      const ay = 0.05 * p.y - 0.7 * t
      const d = 0.01 * Math.cos(0.02 * (p.x + p.y) + 0.4 * t)
      const cx = (-0.05 * Math.sin(ax) * Math.sin(ay) + d) * CURL * 20
      const cy = -(0.04 * Math.cos(ax) * Math.cos(ay) + d) * CURL * 20
      p.vx *= drag
      p.vy *= drag
      p.fx = p.vx + cx
      p.fy = p.vy + cy - RISE
      p.x += p.fx * dt
      p.y += p.fy * dt
      if (!Number.isNaN(p.opal)) p.s.tint = opal(t * 1.4 + p.age, p.opal)
      this.place(p)
    }
  }

  private place(p: Puff): void {
    const u = p.age / p.life
    const e = 1 - (1 - u) * (1 - u)
    const size = p.size0 * (1 + (p.grow - 1) * e)
    p.s.position.set(p.x, p.y)
    // Streak along the flow, more as the wisp ages and thins.
    const speed = Math.hypot(p.fx, p.fy)
    const k = Math.min(1.2, speed * STRETCH) * (0.4 + 0.6 * u)
    p.s.rotation = Math.atan2(p.fy, p.fx) + p.skew
    p.s.scale.set(((1 + k) * size) / 96, ((1 - k * 0.35) * size) / 96)
    const fadeIn = u < 0.18 ? u / 0.18 : 1
    p.s.alpha = p.alpha * fadeIn * (1 - u) * (1 - u * 0.4)
  }
}
