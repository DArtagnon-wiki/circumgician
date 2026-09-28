import { Container, Sprite } from 'pixi.js'
import { polygonPoints } from '../sim/geometry'
import type { ReleaseColor, Vec2 } from '../sim/types'
import type { Effects } from './Effects'
import type { SmokeSystem } from './SmokeSystem'
import { ASH_COLOR, colorForRelease, lighten, mix, opal } from './Theme'
import { textures } from './textures'

// A detonation, choreographed over ~0.7s:
// 1. gather: each bowl's liquid pulls inward into one orb at the center;
// 2. implode: the glass tubes rush inward, then burst outward in shards,
//    spilling their liquid (the released motes' droplets form where it
//    spills; annihilating liquid fizzles to ash);
// 3. the orb flies to the linked obstacle and splashes on impact, or with
//    no link dissolves into smoke.
// Purely visual: the sim resolved everything at t = 0, and the scene holds
// the obstacle's display until `impact`.

const GATHER = 0.16
const IMPLODE = 0.09
export const LAUNCH = GATHER + IMPLODE // the glass bursts and the tubes spill

export interface Liquid {
  x: number
  y: number
  color: number
  generic: boolean
}

export interface DetonationParams {
  pos: Vec2
  sides: number
  radius: number
  angle: number // outer angle at the instant of detonation
  liquids: Liquid[] // bowls' contents, world space
  releases: ReleaseColor[] // per node, for the spill
  target: Vec2 | null // linked obstacle
}

export function detonationTiming(from: Vec2, to: Vec2 | null): { launch: number; impact: number } {
  const launch = LAUNCH
  if (!to) return { launch, impact: launch }
  const d = Math.hypot(to.x - from.x, to.y - from.y)
  return { launch, impact: launch + Math.min(0.42, Math.max(0.22, 0.12 + d / 1300)) }
}

const easeIn = (u: number) => u * u
const easeOut = (u: number) => 1 - (1 - u) * (1 - u)
const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u)

interface Shard {
  s: Sprite
  x: number
  y: number
  vx: number
  vy: number
  spin: number
}

export function playDetonation(fx: Effects, smoke: SmokeSystem, p: DetonationParams): void {
  const t = textures()
  const { launch, impact } = detonationTiming(p.pos, p.target)
  const root = new Container()
  fx.layer.addChild(root)
  const seed = Math.random() * 10
  const colorOf = (l: Liquid, time: number) => (l.generic ? opal(time, seed) : l.color)
  const orbColor = p.liquids.length ? p.liquids.map((l) => l.color).reduce((a, c, i) => mix(a, c, 1 / (i + 1))) : 0xe6dcff

  // Liquid blobs, one per filled bowl.
  const blobs = p.liquids.map((l) => {
    const s = new Sprite(t.meniscus)
    s.anchor.set(0.5)
    s.position.set(l.x, l.y)
    s.scale.set(15 / 64)
    s.tint = colorOf(l, 0)
    root.addChild(s)
    return s
  })

  // The orb: a glow, a liquid body, colored eddies inside, a hot core.
  const orb = new Container()
  orb.position.set(p.pos.x, p.pos.y)
  const glow = new Sprite(t.glow)
  glow.blendMode = 'add'
  glow.tint = lighten(orbColor, 0.35)
  const body = new Sprite(t.meniscus)
  body.tint = orbColor
  const eddies = p.liquids.map((l) => {
    const e = new Sprite(t.glow)
    e.blendMode = 'add'
    e.tint = l.color
    e.anchor.set(0.5)
    e.scale.set(10 / 128)
    return e
  })
  const core = new Sprite(t.glow)
  core.blendMode = 'add'
  core.tint = 0xffffff
  for (const s of [glow, body, core]) s.anchor.set(0.5)
  orb.addChild(glow, body, ...eddies, core)
  orb.scale.set(0)
  root.addChild(orb)

  // Glass shards along the outer polygon's tubes.
  const nodes = polygonPoints(p.pos, p.sides, p.radius, p.angle)
  const shards: Shard[] = []
  for (let i = 0; i < p.sides; i++) {
    const a = nodes[i]
    const b = nodes[(i + 1) % p.sides]
    for (const f of [0.25, 0.5, 0.75]) {
      const s = new Sprite(t.shards[(i * 3 + Math.round(f * 4)) % t.shards.length])
      s.anchor.set(0.5)
      s.tint = 0xece6ff
      s.alpha = 0.9
      s.rotation = Math.random() * Math.PI * 2
      s.scale.set((9 + Math.random() * 8) / 48)
      const x = a.x + (b.x - a.x) * f
      const y = a.y + (b.y - a.y) * f
      s.position.set(x, y)
      root.addChild(s)
      shards.push({ s, x, y, vx: 0, vy: 0, spin: (Math.random() - 0.5) * 14 })
    }
  }

  let time = 0
  let burst = false
  let landed = false
  const cp = p.target ? { x: (p.pos.x + p.target.x) / 2 + (Math.random() - 0.5) * 80, y: Math.min(p.pos.y, p.target.y) + (p.target.y - p.pos.y) * 0.35 } : null
  const end = Math.max(impact, launch) + 0.55

  fx.add((dt) => {
    if (root.destroyed) return false
    time += dt

    // 1. Gather.
    const g = clamp01(time / GATHER)
    blobs.forEach((s, i) => {
      const l = p.liquids[i]
      const e = easeIn(g)
      s.position.set(l.x + (p.pos.x - l.x) * e, l.y + (p.pos.y - l.y) * e)
      s.scale.set(((15 - 9 * e) / 64) * (1 + 0.3 * Math.sin(g * Math.PI)))
      s.tint = colorOf(l, time)
      s.visible = g < 1
    })
    const grown = easeOut(clamp01((time - GATHER * 0.4) / (GATHER * 0.8)))
    if (!landed) {
      const pulse = 1 + 0.08 * Math.sin(time * 40)
      orb.scale.set(grown * pulse)
      glow.scale.set(46 / 128)
      glow.alpha = 0.75
      body.scale.set(17 / 64)
      core.scale.set(12 / 128)
      eddies.forEach((e, i) => {
        const a = time * 9 + (i / eddies.length) * Math.PI * 2
        e.position.set(Math.cos(a) * 4, Math.sin(a) * 4)
        e.tint = colorOf(p.liquids[i], time)
      })
    }

    // 2. Implode, then burst.
    const inward = clamp01((time - GATHER) / IMPLODE)
    for (const sh of shards) {
      if (!burst) {
        const e = easeIn(inward)
        const x = sh.x + (p.pos.x - sh.x) * e * 0.55
        const y = sh.y + (p.pos.y - sh.y) * e * 0.55
        const tremble = time < GATHER ? Math.sin(time * 90 + sh.spin) * 0.6 : 0
        sh.s.position.set(x + tremble, y)
      } else {
        sh.vy += 240 * dt
        sh.s.x += sh.vx * dt
        sh.s.y += sh.vy * dt
        sh.s.rotation += sh.spin * dt
        sh.s.alpha = Math.max(0, 0.9 * (1 - (time - launch) / 0.5))
      }
    }
    if (!burst && time >= launch) {
      burst = true
      for (const sh of shards) {
        const dx = sh.s.x - p.pos.x
        const dy = sh.s.y - p.pos.y
        const d = Math.hypot(dx, dy) || 1
        const v = 120 + Math.random() * 140
        sh.vx = (dx / d) * v
        sh.vy = (dy / d) * v - 30
      }
      for (let k = 0; k < 5; k++) {
        const a = Math.random() * Math.PI * 2
        const r = p.radius * (0.3 + Math.random() * 0.6)
        fx.particle(t.star, { x: p.pos.x + Math.cos(a) * r, y: p.pos.y + Math.sin(a) * r, scale: 0.8, scaleTo: 0.1, tint: 0xf1e9ff, add: true, life: 0.3, delay: Math.random() * 0.1 })
      }
      spill(fx, smoke, nodes, p.releases, seed)
      if (!p.target) {
        // Nowhere to go: the orb dissolves into smoke.
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2
          const l = p.liquids[k % Math.max(1, p.liquids.length)]
          smoke.emit(p.pos.x, p.pos.y, l ? colorOf(l, time) : orbColor, { size: 16, life: 0.8 + Math.random() * 0.4, alpha: 0.6, grow: 2.6, add: true, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40 })
        }
        landed = true
        orb.visible = false
      }
    }

    // 3. Flight and splash.
    if (p.target && cp && !landed && time >= launch) {
      const u = clamp01((time - launch) / (impact - launch))
      const e = easeIn(u)
      const x = (1 - e) * (1 - e) * p.pos.x + 2 * (1 - e) * e * cp.x + e * e * p.target.x
      const y = (1 - e) * (1 - e) * p.pos.y + 2 * (1 - e) * e * cp.y + e * e * p.target.y
      orb.position.set(x, y)
      const l = p.liquids[Math.floor(time * 60) % Math.max(1, p.liquids.length)]
      smoke.emit(x, y, l ? colorOf(l, time) : orbColor, { size: 13, life: 0.45, alpha: 0.55, grow: 1.8, add: true })
      if (u >= 1) {
        landed = true
        orb.visible = false
        splash(fx, smoke, p.target, p.liquids.map((q) => colorOf(q, time)), orbColor)
      }
    }

    if (time >= end) {
      root.destroy({ children: true })
      return false
    }
    return true
  })
}

// Broken tubes spill their liquid at each node: a spray in the release
// color (its droplet then forms there, drawn by the mote), or for an
// annihilating node, ash that fizzles and falls.
function spill(fx: Effects, smoke: SmokeSystem, nodes: Vec2[], releases: ReleaseColor[], seed: number): void {
  const t = textures()
  nodes.forEach((n, i) => {
    const r = releases[i]
    if (r === 'annihilating') {
      for (let k = 0; k < 5; k++) {
        smoke.emit(n.x + (Math.random() - 0.5) * 8, n.y + (Math.random() - 0.5) * 8, ASH_COLOR, { size: 11, life: 0.9 + Math.random() * 0.5, alpha: 0.55, grow: 2.2, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 12 })
      }
      for (let k = 0; k < 6; k++) {
        fx.particle(t.disc, { x: n.x, y: n.y, vx: (Math.random() - 0.5) * 70, vy: -20 - Math.random() * 40, gravity: 180, scale: (1.5 + Math.random() * 1.5) / 32, tint: k % 2 ? 0x5a544e : 0xa39c94, life: 0.5 + Math.random() * 0.3 })
      }
      return
    }
    const color = r === 'generic' ? opal(0, seed + i) : colorForRelease(r)
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * Math.PI * 2
      const v = 30 + Math.random() * 50
      fx.particle(t.disc, { x: n.x, y: n.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.05, scale: (2 + Math.random() * 2) / 32, tint: color, life: 0.28 })
    }
  })
}

function splash(fx: Effects, smoke: SmokeSystem, at: Vec2, colors: number[], orbColor: number): void {
  const t = textures()
  const list = colors.length ? colors : [orbColor]
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + Math.random() * 0.4
    const v = 110 + Math.random() * 110
    fx.particle(t.droplet, { x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.08, rotation: a, scale: (8 + Math.random() * 6) / 48, tint: list[k % list.length], life: 0.32 })
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    smoke.emit(at.x, at.y, list[k % list.length], { size: 14, life: 0.6, alpha: 0.55, grow: 2.4, add: true, vx: Math.cos(a) * 55, vy: Math.sin(a) * 55 })
  }
  fx.particle(t.glow, { x: at.x, y: at.y, scale: 20 / 128, scaleTo: 120 / 128, tint: lighten(orbColor, 0.4), add: true, alpha: 0.9, life: 0.35 })
  fx.ring(at, lighten(orbColor, 0.5), 8, 48, 0.4, 2)
}
