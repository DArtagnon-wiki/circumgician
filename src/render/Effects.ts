import { Graphics, Sprite, type Container, type Texture } from 'pixi.js'
import { polygonPoints } from '../sim/geometry'
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

// Short-lived juice: polygon shatter, impact rings, sparks and screen shake.
export class Effects {
  private anims: Anim[] = []
  private layer: Container
  shake = 0 // current shake amplitude in virtual px

  constructor(layer: Container) {
    this.layer = layer
  }

  add(anim: Anim): void {
    this.anims.push(anim)
  }

  clear(): void {
    this.anims = []
    this.layer.removeChildren().forEach((c) => c.destroy())
    this.shake = 0
  }

  update(dt: number): void {
    this.anims = this.anims.filter((a) => a(dt))
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

  // Each edge of the polygon flies outward from the center, spinning and
  // fading — "the lines of the polygon" coming apart.
  shatter(center: Vec2, sides: number, radius: number, angle: number, color: number, width = 3): void {
    const pts = polygonPoints(center, sides, radius, angle)
    for (let i = 0; i < sides; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % sides]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const dir = Math.atan2(mid.y - center.y, mid.x - center.x)
      const speed = 70 + Math.random() * 70
      const spin = (Math.random() - 0.5) * 8
      const half = { x: (b.x - a.x) / 2, y: (b.y - a.y) / 2 }
      this.temp((g, t) => {
        const e = 1 - (1 - t) * (1 - t)
        const cx = mid.x + Math.cos(dir) * speed * e
        const cy = mid.y + Math.sin(dir) * speed * e + 40 * t * t
        const rot = spin * t
        const c = Math.cos(rot)
        const s = Math.sin(rot)
        const hx = (half.x * c - half.y * s) * (1 - t * 0.4)
        const hy = (half.x * s + half.y * c) * (1 - t * 0.4)
        g.moveTo(cx - hx, cy - hy)
          .lineTo(cx + hx, cy + hy)
          .stroke({ color, width: width * (1 - t * 0.5), alpha: 1 - t })
      }, 0.65)
    }
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

  sparks(center: Vec2, color: number, count = 12, speed = 140): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4
      const v = speed * (0.6 + Math.random() * 0.6)
      this.temp((g, t) => {
        const d = v * (1 - (1 - t) * (1 - t)) * 0.5
        g.circle(center.x + Math.cos(a) * d, center.y + Math.sin(a) * d, 2.5 * (1 - t) + 0.5).fill({ color, alpha: 1 - t })
      }, 0.5)
    }
  }

  flash(color: number, alpha: number, duration: number, rect: { x: number; y: number; w: number; h: number }): void {
    this.temp((g, t) => {
      g.rect(rect.x, rect.y, rect.w, rect.h).fill({ color, alpha: alpha * (1 - t) })
    }, duration)
  }
}
