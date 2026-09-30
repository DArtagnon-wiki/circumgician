import { Sprite } from 'pixi.js'
import type { Vec2 } from '../sim/types'
import type { Effects } from './Effects'
import type { SmokeSystem } from './SmokeSystem'
import { FROST, RIME } from './Theme'
import { textures } from './textures'

export { FROST, RIME }

// Frost racing from `from` to `to` over `duration`: a cold light shedding
// ice sparkles along its way.
export function frostStreak(fx: Effects, from: Vec2, to: Vec2, duration: number): void {
  const t = textures()
  const head = new Sprite(t.glow)
  head.anchor.set(0.5)
  head.blendMode = 'add'
  head.tint = FROST
  head.scale.set(34 / 128)
  fx.layer.addChild(head)
  let age = 0
  let shed = 0
  fx.add((dt) => {
    if (head.destroyed) return false
    age += dt
    const u = Math.min(1, age / duration)
    const e = u * u * (3 - 2 * u)
    const x = from.x + (to.x - from.x) * e
    const y = from.y + (to.y - from.y) * e
    head.position.set(x, y)
    head.alpha = 0.9
    for (shed += dt; shed > 0.014; shed -= 0.014) {
      fx.particle(t.star, {
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
        drag: 0.2,
        rotation: Math.random() * 3,
        spin: (Math.random() - 0.5) * 5,
        scale: 0.3 + Math.random() * 0.3,
        scaleTo: 0.05,
        tint: Math.random() < 0.5 ? FROST : RIME,
        add: true,
        life: 0.3 + Math.random() * 0.3,
      })
    }
    if (u < 1) return true
    head.destroy()
    return false
  })
}

// Rime closing in on a piece as it freezes solid.
export function freezeBurst(fx: Effects, at: Vec2, radius: number): void {
  const t = textures()
  fx.ring(at, FROST, radius * 1.35, radius * 0.85, 0.5, 2.5)
  fx.ring(at, 0xffffff, radius * 0.4, radius * 1.1, 0.35, 1.2)
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + Math.random() * 0.3
    const r = radius * (1.3 + Math.random() * 0.3)
    fx.particle(t.star, {
      x: at.x + Math.cos(a) * r,
      y: at.y + Math.sin(a) * r,
      vx: -Math.cos(a) * 90,
      vy: -Math.sin(a) * 90,
      drag: 0.05,
      spin: (Math.random() - 0.5) * 6,
      scale: 0.5,
      scaleTo: 0.1,
      tint: k % 2 ? FROST : RIME,
      add: true,
      life: 0.4,
    })
  }
  fx.particle(t.glow, { x: at.x, y: at.y, scale: (radius * 3) / 128, scaleTo: (radius * 1.6) / 128, tint: FROST, add: true, alpha: 0.5, life: 0.5 })
}

// Ice giving way: pale shards thrown outward, a breath of cold mist and a
// flash of rime.
export function iceShatter(fx: Effects, smoke: SmokeSystem, at: Vec2, radius: number): void {
  const t = textures()
  for (let k = 0; k < 18; k++) {
    const a = Math.random() * Math.PI * 2
    const d = Math.random() * radius * 0.8
    const v = 80 + Math.random() * 120
    fx.particle(t.shards[k % t.shards.length], {
      x: at.x + Math.cos(a) * d,
      y: at.y + Math.sin(a) * d,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 40,
      gravity: 260,
      drag: 0.5,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 12,
      scale: (8 + Math.random() * 12) / 48,
      tint: k % 3 === 0 ? 0xffffff : k % 3 === 1 ? RIME : FROST,
      alpha: 0.9,
      life: 0.5 + Math.random() * 0.4,
    })
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    smoke.emit(at.x, at.y, RIME, { size: 16, life: 0.9, alpha: 0.35, grow: 2.6, add: true, vx: Math.cos(a) * 45, vy: Math.sin(a) * 45 })
  }
  fx.particle(t.glow, { x: at.x, y: at.y, scale: (radius * 1.2) / 128, scaleTo: (radius * 4) / 128, tint: RIME, add: true, alpha: 0.8, life: 0.4 })
  fx.ring(at, FROST, radius * 0.6, radius * 2.2, 0.45, 2)
}
