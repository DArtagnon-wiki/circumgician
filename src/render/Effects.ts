import { Graphics, Sprite, type Container, type Texture } from 'pixi.js'
import type { Vec2 } from '../sim/types'
import { textures } from './textures'

export interface ParticleOptions {
  x: number
  y: number
  vx?: number
  vy?: number
  gravity?: number // px/s^2 downward
  drag?: number // velocity kept per second (0..1)
  rotation?: number
  spin?: number // rad/s
  scale: number
  scaleTo?: number
  alpha?: number
  tint?: number
  add?: boolean
  life: number
  delay?: number
}

type Anim = (dt: number) => boolean // false when finished

// Short-lived juice: sprite particles, obsidian shards, impact rings,
// flashes, delayed callbacks and screen shake.
export class Effects {
  private anims: Anim[] = []
  readonly layer: Container
  shake = 0 // current shake amplitude in virtual px

  constructor(layer: Container) {
    this.layer = layer
  }

  add(anim: Anim): void {
    this.anims.push(anim)
  }

  // Runs fn once, `delay` seconds from now (immediately if delay <= 0).
  // Dropped by clear(), so undo cancels anything still pending.
  after(delay: number, fn: () => void): void {
    if (delay <= 0) {
      fn()
      return
    }
    let left = delay
    this.add((dt) => {
      left -= dt
      if (left > 0) return true
      fn()
      return false
    })
  }

  clear(): void {
    this.anims = []
    this.layer.removeChildren().forEach((c) => c.destroy())
    this.shake = 0
  }

  update(dt: number): void {
    // Anims may add anims (after() spawning particles): keep those too.
    const running = this.anims
    this.anims = []
    const kept = running.filter((a) => a(dt))
    this.anims = kept.concat(this.anims)
    this.shake = Math.max(0, this.shake - dt * 30)
  }

  addShake(amount: number): void {
    this.shake = Math.max(this.shake, amount)
  }

  private temp(draw: (g: Graphics, t: number) => void, duration: number): void {
    const g = new Graphics()
    this.layer.addChild(g)
    let elapsed = 0
    this.add((dt) => {
      elapsed += dt
      const t = Math.min(1, elapsed / duration)
      g.clear()
      draw(g, t)
      if (t >= 1) {
        g.destroy()
        return false
      }
      return true
    })
  }

  // A single short-lived sprite with simple ballistic motion.
  particle(tex: Texture, o: ParticleOptions): void {
    const s = new Sprite(tex)
    s.anchor.set(0.5)
    s.tint = o.tint ?? 0xffffff
    if (o.add) s.blendMode = 'add'
    s.visible = !o.delay
    this.layer.addChild(s)
    let age = -(o.delay ?? 0)
    let x = o.x
    let y = o.y
    let vx = o.vx ?? 0
    let vy = o.vy ?? 0
    const keep = o.drag ?? 1
    const place = (u: number) => {
      s.position.set(x, y)
      s.rotation = (o.rotation ?? 0) + (o.spin ?? 0) * Math.max(0, age)
      s.scale.set(o.scale + ((o.scaleTo ?? o.scale) - o.scale) * u)
      s.alpha = (o.alpha ?? 1) * (1 - u) * Math.min(1, u * 12 + 0.2)
    }
    place(0)
    this.add((dt) => {
      if (s.destroyed) return false
      age += dt
      if (age < 0) return true
      s.visible = true
      const u = age / o.life
      if (u >= 1) {
        s.destroy()
        return false
      }
      const k = Math.pow(keep, dt)
      vx *= k
      vy = vy * k + (o.gravity ?? 0) * dt
      x += vx * dt
      y += vy * dt
      place(u)
      return true
    })
  }

  // An obsidian layer breaking: dark glass shards thrown outward and
  // tumbling, with brief violet glints among them.
  obsidianShatter(center: Vec2, radius: number, big: boolean): void {
    const t = textures()
    const n = big ? 22 : 16
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const d = Math.random() * radius * 0.8
      const v = (big ? 90 : 70) + Math.random() * 120
      this.particle(t.shards[i % t.shards.length], {
        x: center.x + Math.cos(a) * d,
        y: center.y + Math.sin(a) * d,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 40,
        gravity: 260,
        drag: 0.5,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 12,
        scale: (9 + Math.random() * 13) / 48,
        tint: i % 3 === 0 ? 0x7a64c0 : 0x2a1f48,
        life: 0.55 + Math.random() * 0.45,
      })
    }
    for (let i = 0; i < (big ? 9 : 6); i++) {
      const a = Math.random() * Math.PI * 2
      const d = Math.random() * radius
      this.particle(t.star, {
        x: center.x + Math.cos(a) * d,
        y: center.y + Math.sin(a) * d,
        scale: 0.9,
        scaleTo: 0.15,
        rotation: Math.random(),
        tint: 0xd9c8ff,
        add: true,
        life: 0.35,
        delay: Math.random() * 0.2,
      })
    }
  }

  ring(center: Vec2, color: number, from = 10, to = 60, duration = 0.4, width = 3): void {
    this.temp((g, t) => {
      g.circle(center.x, center.y, from + (to - from) * (1 - (1 - t) * (1 - t))).stroke({ color, width: width * (1 - t) + 0.5, alpha: 1 - t })
    }, duration)
  }

  flash(color: number, alpha: number, duration: number, rect: { x: number; y: number; w: number; h: number }): void {
    this.temp((g, t) => {
      g.rect(rect.x, rect.y, rect.w, rect.h).fill({ color, alpha: alpha * (1 - t) })
    }, duration)
  }
}
