import { Graphics, type Container } from 'pixi.js'
import { polygonPoints } from '../sim/geometry'
import type { Vec2 } from '../sim/types'

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
