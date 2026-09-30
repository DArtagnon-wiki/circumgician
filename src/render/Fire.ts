import type { Vec2 } from '../sim/types'
import type { Effects } from './Effects'
import type { SmokeSystem } from './SmokeSystem'
import { ASH_COLOR } from './Theme'
import { textures } from './textures'

// Fire: the fuse and the burning of a piece left too long. Flame and ember
// are light, never a hue; what burns is charred glass and ash.
export const FLAME = 0xffa53a
export const EMBER = 0xff5a1f
export const SPARK = 0xffe7a0
const CHAR = 0x2b1c16

// One spark thrown off a burning fuse.
export function fuseSpark(fx: Effects, at: Vec2): void {
  const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2
  const v = 30 + Math.random() * 50
  fx.particle(textures().starDot, {
    x: at.x,
    y: at.y,
    vx: Math.cos(a) * v,
    vy: Math.sin(a) * v,
    gravity: 40,
    drag: 0.3,
    scale: 0.25 + Math.random() * 0.25,
    scaleTo: 0.05,
    tint: Math.random() < 0.5 ? SPARK : FLAME,
    add: true,
    life: 0.3 + Math.random() * 0.35,
  })
}

// A piece burning away: flames flare up through it, its glass chars and
// falls apart, ash rises where it stood and from every mote it held, and
// embers drift up.
export function burnUp(fx: Effects, smoke: SmokeSystem, at: Vec2, radius: number, motes: Vec2[]): void {
  const t = textures()
  fx.particle(t.glow, { x: at.x, y: at.y, scale: (radius * 1.2) / 128, scaleTo: (radius * 4.2) / 128, tint: FLAME, add: true, alpha: 0.9, life: 0.45 })
  fx.particle(t.glow, { x: at.x, y: at.y, scale: (radius * 0.8) / 128, scaleTo: (radius * 2) / 128, tint: SPARK, add: true, alpha: 0.8, life: 0.25 })
  fx.ring(at, EMBER, radius * 0.7, radius * 1.9, 0.5, 2.5)
  // Flames licking upward around the rim.
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + Math.random() * 0.3
    const r = radius * (0.6 + Math.random() * 0.5)
    fx.particle(t.glow, {
      x: at.x + Math.cos(a) * r,
      y: at.y + Math.sin(a) * r,
      vx: (Math.random() - 0.5) * 30,
      vy: -60 - Math.random() * 70,
      drag: 0.4,
      scale: (14 + Math.random() * 12) / 128,
      scaleTo: 0.02,
      tint: k % 3 ? FLAME : EMBER,
      add: true,
      alpha: 0.85,
      delay: Math.random() * 0.12,
      life: 0.45 + Math.random() * 0.3,
    })
  }
  // Charred glass.
  for (let k = 0; k < 14; k++) {
    const a = Math.random() * Math.PI * 2
    const d = Math.random() * radius
    const v = 40 + Math.random() * 90
    fx.particle(t.shards[k % t.shards.length], {
      x: at.x + Math.cos(a) * d,
      y: at.y + Math.sin(a) * d,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 30,
      gravity: 240,
      drag: 0.5,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 10,
      scale: (7 + Math.random() * 10) / 48,
      tint: k % 4 ? CHAR : EMBER,
      alpha: 0.95,
      life: 0.6 + Math.random() * 0.4,
    })
  }
  // Ash where it stood, and from each mote it held.
  for (let k = 0; k < 6; k++) smoke.emit(at.x + (Math.random() - 0.5) * radius, at.y + (Math.random() - 0.5) * radius, ASH_COLOR, { size: 18, life: 1.4, alpha: 0.4, grow: 2.2, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 20 })
  for (const m of motes) {
    fx.particle(t.glow, { x: m.x, y: m.y, scale: 0.12, scaleTo: 0.35, tint: FLAME, add: true, alpha: 0.9, life: 0.3 })
    smoke.emit(m.x, m.y, ASH_COLOR, { size: 10, life: 1.1, alpha: 0.45, grow: 2.4, vx: (Math.random() - 0.5) * 16, vy: -26 })
  }
  // Embers drifting up.
  for (let k = 0; k < 16; k++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * radius
    fx.particle(t.starDot, {
      x: at.x + Math.cos(a) * r,
      y: at.y + Math.sin(a) * r,
      vx: (Math.random() - 0.5) * 40,
      vy: -40 - Math.random() * 80,
      drag: 0.5,
      scale: 0.2 + Math.random() * 0.3,
      scaleTo: 0.05,
      tint: Math.random() < 0.6 ? EMBER : SPARK,
      add: true,
      delay: Math.random() * 0.3,
      life: 0.7 + Math.random() * 0.8,
    })
  }
}
