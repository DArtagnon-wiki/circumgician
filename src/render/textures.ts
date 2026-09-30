import { Texture } from 'pixi.js'
import type { SkyName } from './Theme'

// Soft or intricate shapes are painted once at startup on offscreen 2D
// canvases and drawn as batched, tintable Sprites: far cheaper on a phone
// GPU than per-frame vector geometry or runtime filters. Everything is
// white (tint it) unless noted.
export interface Textures {
  glow: Texture // soft radial falloff
  smoke: Texture[] // noisy wisp puffs
  bowl: Texture // glass bowl seen from above (tint = catch hue)
  highlight: Texture // untinted specular for the bowl, light from top-left
  meniscus: Texture // liquid surface disc with a brighter rim
  shards: Texture[] // glass shards
  beads: Texture[] // glowing glyph beads
  star: Texture // four-point sparkle
  starDot: Texture // plain point of light
  nebula: Texture // the violet sky's full-screen backdrop (untinted, opaque)
  capsule: Texture // soft rounded bar, stretched along tubes
  swirl: Texture // two-armed spiral
  droplet: Texture // glossy drop pointing +x
  streak: Texture // thin glint, long along +x
  ring: Texture // thin soft ring (lensing, ripples)
  disc: Texture // solid disc with a soft edge
}

let cache: Textures | null = null

export function textures(): Textures {
  return (cache ??= build())
}

export const texturesReady = (): boolean => cache !== null

// A sky's nebula. The violet one is painted with the rest at startup; any
// other is painted the first time a level asks for it.
const skies = new Map<SkyName, Texture>()
export function skyTexture(sky: SkyName): Texture {
  if (sky === 'violet') return textures().nebula
  let t = skies.get(sky)
  if (!t) skies.set(sky, (t = tex(nebula(400, 860, NEBULAE[sky]))))
  return t
}

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 144269504)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi, seed)
  const b = hash(xi + 1, yi, seed)
  const c = hash(xi, yi + 1, seed)
  const d = hash(xi + 1, yi + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x, y, seed + i * 17)
    norm += amp
    x *= 2.03
    y *= 2.03
    amp *= 0.5
  }
  return sum / norm
}

// Tiny deterministic PRNG so the painted art is identical every load.
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

// Per-pixel painter: fn returns [r, g, b, a] in 0..1 for pixel centers in
// normalized coordinates (-1..1 across the square).
function paint(size: number, fn: (x: number, y: number) => [number, number, number, number]): HTMLCanvasElement {
  const [c, ctx] = canvas(size)
  const img = ctx.createImageData(size, size)
  const d = img.data
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const [r, g, b, a] = fn(((px + 0.5) / size) * 2 - 1, ((py + 0.5) / size) * 2 - 1)
      const i = (py * size + px) * 4
      d[i] = r * 255
      d[i + 1] = g * 255
      d[i + 2] = b * 255
      d[i + 3] = clamp01(a) * 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

const tex = (c: HTMLCanvasElement) => Texture.from(c)

// ---------------------------------------------------------------------------
// Individual textures
// ---------------------------------------------------------------------------

function glow(): HTMLCanvasElement {
  return paint(128, (x, y) => {
    const r = Math.hypot(x, y)
    const a = Math.exp(-r * r * 4.2) * (1 - smoothstep(0.82, 1, r))
    return [1, 1, 1, a]
  })
}

// Torn, wispy puffs: domain-warped fbm thresholded into tendrils with
// holes, under a broad radial falloff. Many overlap at low alpha, so each
// one stays sparse.
function smoke(seed: number): HTMLCanvasElement {
  return paint(96, (x, y) => {
    const r = Math.hypot(x, y)
    if (r >= 1) return [1, 1, 1, 0]
    const wx = fbm(x * 1.3 + 7.3, y * 1.3, seed + 5, 3)
    const wy = fbm(x * 1.3, y * 1.3 - 3.1, seed + 9, 3)
    const n = fbm(x * 1.9 + wx * 2.6, y * 1.9 + wy * 2.6, seed, 4)
    const fall = 1 - smoothstep(0.05, 1, r)
    const wisp = smoothstep(0.42, 0.78, n + fall * 0.22 - 0.08)
    return [1, 1, 1, wisp * fall * fall * 0.85 + fall * 0.08]
  })
}

// A clear glass hemisphere from above: nearly transparent in the middle,
// denser toward the rim (Fresnel), a crisp rim line, and a caustic where
// light from the top-left focuses on the far side.
function bowl(): HTMLCanvasElement {
  return paint(64, (x, y) => {
    const r = Math.hypot(x, y)
    if (r > 1) return [1, 1, 1, 0]
    const body = 0.12 + 0.5 * Math.pow(r / 0.9, 3)
    const rim = Math.exp(-Math.pow((r - 0.9) / 0.045, 2)) * 0.85
    const inner = Math.exp(-Math.pow((r - 0.74) / 0.05, 2)) * 0.12
    const caustic = Math.exp(-(Math.pow(x - 0.3, 2) + Math.pow(y - 0.36, 2)) / 0.07) * 0.4
    const edge = 1 - smoothstep(0.94, 1, r)
    return [1, 1, 1, Math.min(1, body + rim + inner + caustic) * edge]
  })
}

function highlight(): HTMLCanvasElement {
  return paint(64, (x, y) => {
    // Main specular: a soft ellipse up and to the left.
    const hx = (x + 0.36) / 0.3
    const hy = (y + 0.42) / 0.19
    const spec = Math.exp(-(hx * hx + hy * hy) * 1.6)
    // Secondary reflection: a thin crescent low on the right.
    const r = Math.hypot(x, y)
    const ang = Math.atan2(y, x)
    const crescent = Math.exp(-Math.pow((r - 0.72) / 0.07, 2)) * smoothstep(0.2, 0.9, Math.cos(ang - 0.75)) * 0.45
    const pin = Math.exp(-(Math.pow((x + 0.46) / 0.07, 2) + Math.pow((y + 0.5) / 0.07, 2))) // hot pinpoint
    return [1, 1, 1, Math.min(1, spec * 0.75 + crescent + pin)]
  })
}

function meniscus(): HTMLCanvasElement {
  return paint(64, (x, y) => {
    const r = Math.hypot(x, y)
    if (r > 1) return [1, 1, 1, 0]
    const edge = 1 - smoothstep(0.9, 1, r)
    // Deeper (more opaque) in the middle, a bright rim where it meets glass.
    const depth = 0.72 + 0.2 * (1 - r * r)
    const rim = Math.exp(-Math.pow((r - 0.86) / 0.06, 2)) * 0.5
    const lum = 0.82 + rim * 0.36 - 0.12 * clamp01(-y) // slightly darker far side
    return [lum, lum, lum, (depth + rim) * edge]
  })
}

function shard(seed: number): HTMLCanvasElement {
  const [c, ctx] = canvas(48)
  const r = rng(seed)
  const n = 3 + Math.floor(r() * 2)
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.9
    const d = 10 + r() * 13
    pts.push([24 + Math.cos(a) * d * (i === 0 ? 1.4 : 1), 24 + Math.sin(a) * d * 0.7])
  }
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  const g = ctx.createLinearGradient(8, 8, 40, 40)
  g.addColorStop(0, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.14)')
  g.addColorStop(1, 'rgba(255,255,255,0.32)')
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 1.4
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.stroke()
  return c
}

// Small glowing bead with an etched glyph (a few rune-ish marks).
function bead(kind: number): HTMLCanvasElement {
  const [c, ctx] = canvas(32)
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.62, 'rgba(255,255,255,0.12)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 32, 32)
  ctx.strokeStyle = 'rgba(255,255,255,1)'
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  const glyphs: [number, number, number, number][][] = [
    [[16, 10, 16, 22], [11, 13, 21, 19]],
    [[11, 11, 21, 21], [21, 11, 11, 21], [16, 9, 16, 12]],
    [[12, 10, 12, 22], [12, 16, 20, 11], [12, 16, 20, 21]],
    [[16, 9, 10, 20], [16, 9, 22, 20], [11, 18, 21, 18]],
  ]
  for (const [x1, y1, x2, y2] of glyphs[kind % glyphs.length]) {
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
  }
  ctx.stroke()
  return c
}

function star(): HTMLCanvasElement {
  return paint(32, (x, y) => {
    const r = Math.hypot(x, y)
    const core = Math.exp(-r * r * 60)
    const halo = Math.exp(-r * r * 9) * 0.35
    const spikes = (Math.exp(-Math.abs(x) * 26) * Math.exp(-Math.abs(y) * 3.2) + Math.exp(-Math.abs(y) * 26) * Math.exp(-Math.abs(x) * 3.2)) * 0.8
    return [1, 1, 1, Math.min(1, core + halo + spikes)]
  })
}

function starDot(): HTMLCanvasElement {
  return paint(16, (x, y) => {
    const r2 = x * x + y * y
    return [1, 1, 1, Math.exp(-r2 * 7)]
  })
}

function capsule(): HTMLCanvasElement {
  const w = 64
  const h = 16
  const [c, ctx] = canvas(w, h)
  const img = ctx.createImageData(w, h)
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = px + 0.5
      const y = py + 0.5 - h / 2
      // Distance to the capsule's center segment [h/2, w - h/2].
      const cx = Math.max(h / 2, Math.min(w - h / 2, x))
      const d = Math.hypot(x - cx, y) / (h / 2)
      const a = 1 - smoothstep(0.55, 1, d)
      const i = (py * w + px) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = a * 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

function swirl(): HTMLCanvasElement {
  return paint(64, (x, y) => {
    const r = Math.hypot(x, y)
    if (r > 1) return [1, 1, 1, 0]
    const a = Math.atan2(y, x)
    const arms = 0.5 + 0.5 * Math.cos(2 * (a + r * 5.2))
    const fall = (1 - smoothstep(0.35, 1, r)) * smoothstep(0, 0.18, r)
    return [1, 1, 1, Math.pow(arms, 2.2) * fall * 0.9 + Math.exp(-r * r * 30) * 0.5]
  })
}

function droplet(): HTMLCanvasElement {
  return paint(48, (x, y) => {
    // Teardrop: a circle at +x with a tapering tail toward -x.
    const bx = x - 0.28
    const inHead = Math.hypot(bx, y) / 0.52
    const tail = x < 0.28 ? Math.abs(y) / Math.max(0.001, 0.52 * clamp01((x + 0.95) / 1.23)) : 9
    const d = Math.min(inHead, tail)
    if (d > 1) return [1, 1, 1, 0]
    const edge = 1 - smoothstep(0.8, 1, d)
    const shine = Math.exp(-(Math.pow((x - 0.18) / 0.12, 2) + Math.pow((y + 0.2) / 0.08, 2)))
    const lum = 0.8 + shine * 0.2
    return [lum, lum, lum, Math.min(1, edge * 0.92 + shine)]
  })
}

function streak(): HTMLCanvasElement {
  const w = 64
  const h = 8
  const [c, ctx] = canvas(w, h)
  const g = ctx.createLinearGradient(0, 0, w, 0)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.5, 'rgba(255,255,255,1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, h / 2 - 1, w, 2)
  ctx.globalAlpha = 0.35
  ctx.fillRect(0, h / 2 - 2.5, w, 5)
  return c
}

function ring(): HTMLCanvasElement {
  return paint(64, (x, y) => [1, 1, 1, Math.exp(-Math.pow((Math.hypot(x, y) - 0.8) / 0.07, 2))])
}

function disc(): HTMLCanvasElement {
  return paint(32, (x, y) => [1, 1, 1, 1 - smoothstep(0.8, 1, Math.hypot(x, y))])
}

type RGB = [number, number, number]
interface NebulaColors {
  base: [RGB, RGB, RGB] // top, 45% down, bottom
  blobs: number[][] // broad glows: x, y, radius (fractions of w, h, w), r, g, b, strength
  filaments: [RGB, RGB] // screen-blended cloud color at the top and the bottom
  bright: RGB // added where the filaments are densest
  dust: RGB
}

const NEBULAE: Record<SkyName, NebulaColors> = {
  // Deep violet: warm magenta filaments high, cooling to indigo.
  violet: {
    base: [[27, 13, 54], [19, 10, 43], [7, 4, 14]],
    blobs: [
      [0.78, 0.12, 0.8, 118, 44, 168, 0.34],
      [0.18, 0.06, 0.55, 150, 40, 112, 0.22],
      [0.1, 0.55, 0.85, 46, 34, 132, 0.26],
      [0.9, 0.66, 0.6, 96, 36, 140, 0.16],
      [0.5, 0.98, 0.65, 60, 24, 110, 0.14],
    ],
    filaments: [[150, 70, 190], [80, 70, 190]],
    bright: [60, 30, 40],
    dust: [6, 3, 14],
  },
  // A winter night: midnight blue, with aurora green-teal curtains high
  // that cool to ice blue.
  winter: {
    base: [[9, 26, 52], [7, 18, 40], [2, 6, 14]],
    blobs: [
      [0.78, 0.12, 0.8, 30, 104, 150, 0.32],
      [0.18, 0.06, 0.55, 36, 150, 118, 0.22],
      [0.1, 0.55, 0.85, 28, 58, 140, 0.26],
      [0.9, 0.66, 0.6, 58, 64, 150, 0.16],
      [0.5, 0.98, 0.65, 20, 44, 110, 0.14],
    ],
    filaments: [[50, 190, 160], [60, 100, 210]],
    bright: [30, 50, 40],
    dust: [2, 6, 14],
  },
}

// A nebula: a smooth base, broad colored glows, domain-warped cloud
// filaments and dark dust lanes, dim fixed stars and a vignette. Composited
// per pixel in float precision (canvas layering quantizes faint alpha into
// visible blocks) and dithered so dark gradients don't band. It is soft, so
// painting it at the virtual resolution costs nothing visible on a retina
// screen.
function nebula(w: number, h: number, colors: NebulaColors): HTMLCanvasElement {
  // Density fields at a third of the resolution, interpolated below.
  const q = 3
  const cw = Math.ceil(w / q) + 1
  const ch = Math.ceil(h / q) + 1
  const fil = new Float32Array(cw * ch)
  const dust = new Float32Array(cw * ch)
  for (let py = 0; py < ch; py++) {
    for (let px = 0; px < cw; px++) {
      const x = px / 34
      const y = py / 34
      const wx = fbm(x + 3.1, y, 101, 3)
      const wy = fbm(x, y + 7.7, 202, 3)
      const n = fbm(x * 1.2 + wx * 2.4, y * 1.2 + wy * 2.4, 303, 4)
      // Nebulosity gathers in a broad diagonal band through the sky and
      // thins out over the playfield, where motes need a calm ground.
      const t = py / ch
      const band = Math.exp(-Math.pow((t - 0.2 - (px / cw) * 0.12) / 0.2, 2))
      const mask = smoothstep(0.3, 0.7, fbm(x * 0.3, y * 0.3, 707, 2)) * 0.6 + band * 0.7
      fil[py * cw + px] = Math.pow(smoothstep(0.42, 0.8, n), 1.5) * Math.min(1, mask)
      const dn = fbm(x * 1.1 + 9, y * 1.1 + wy * 2, 606, 4)
      dust[py * cw + px] = smoothstep(0.52, 0.72, dn) * 0.5
    }
  }
  const sample = (f: Float32Array, x: number, y: number) => {
    const fx = x / q
    const fy = y / q
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const i = y0 * cw + x0
    return (f[i] * (1 - tx) + f[i + 1] * tx) * (1 - ty) + (f[i + cw] * (1 - tx) + f[i + cw + 1] * tx) * ty
  }

  // Broad colored glows: x, y, radius, r, g, b, strength.
  const blobs = colors.blobs.map(([x, y, r, ...rest]) => [x * w, y * h, r * w, ...rest])
  const [top, mid, bottom] = colors.base
  const [high, low] = colors.filaments
  const { bright, dust: ground } = colors
  const [c, ctx] = canvas(w, h)
  const img = ctx.createImageData(w, h)
  const d = img.data
  const vx = w / 2
  const vy = h * 0.45
  for (let y = 0; y < h; y++) {
    const t = y / h
    // Base gradient: top -> 45% down -> bottom.
    const k = t < 0.45 ? t / 0.45 : (t - 0.45) / 0.55
    const [from, to] = t < 0.45 ? [top, mid] : [mid, bottom]
    const br = from[0] + (to[0] - from[0]) * k
    const bg = from[1] + (to[1] - from[1]) * k
    const bb = from[2] + (to[2] - from[2]) * k
    const cr = high[0] + (low[0] - high[0]) * t
    const cg = high[1] + (low[1] - high[1]) * t
    const cb = high[2] + (low[2] - high[2]) * t
    for (let x = 0; x < w; x++) {
      let r = br
      let g = bg
      let b = bb
      for (let j = 0; j < blobs.length; j++) {
        const bl = blobs[j]
        const dx = x - bl[0]
        const dy = y - bl[1]
        const u = (dx * dx + dy * dy) / (bl[2] * bl[2])
        if (u >= 1) continue
        const f = (1 - u) * (1 - u) * bl[6]
        r += bl[3] * f
        g += bl[4] * f
        b += bl[5] * f
      }
      // Filaments, screen-blended.
      const fv = sample(fil, x, y) * 0.5
      if (fv > 0.001) {
        const fr = (cr + bright[0] * fv) * fv
        const fg = (cg + bright[1] * fv) * fv
        const fb = (cb + bright[2] * fv) * fv
        r = r + fr - (r * fr) / 255
        g = g + fg - (g * fg) / 255
        b = b + fb - (b * fb) / 255
      }
      const dv = sample(dust, x, y)
      r = r * (1 - dv) + ground[0] * dv
      g = g * (1 - dv) + ground[1] * dv
      b = b * (1 - dv) + ground[2] * dv
      const ex = x - vx
      const ey = y - vy
      const vig = 1 - 0.55 * smoothstep(0.25, 0.75, Math.sqrt(ex * ex + ey * ey) / h)
      const dither = hash(x, y, 99) - 0.5
      const i = (y * w + x) * 4
      d[i] = r * vig + dither
      d[i + 1] = g * vig + dither
      d[i + 2] = b * vig + dither
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  // Dim fixed stars (the bright, drifting ones are live sprites).
  const r = rng(7)
  for (let i = 0; i < 260; i++) {
    const x = r() * w
    const y = r() * h
    const s = r()
    ctx.fillStyle = `rgba(${220 + r() * 35},${210 + r() * 30},255,${0.12 + s * s * 0.5})`
    ctx.fillRect(x, y, s > 0.9 ? 1.5 : 1, s > 0.9 ? 1.5 : 1)
  }
  return c
}

function build(): Textures {
  return {
    glow: tex(glow()),
    smoke: [11, 23, 37, 41].map((s) => tex(smoke(s))),
    bowl: tex(bowl()),
    highlight: tex(highlight()),
    meniscus: tex(meniscus()),
    shards: [3, 5, 8, 13, 21].map((s) => tex(shard(s))),
    beads: [0, 1, 2, 3].map((k) => tex(bead(k))),
    star: tex(star()),
    starDot: tex(starDot()),
    nebula: tex(nebula(400, 860, NEBULAE.violet)),
    capsule: tex(capsule()),
    swirl: tex(swirl()),
    droplet: tex(droplet()),
    streak: tex(streak()),
    ring: tex(ring()),
    disc: tex(disc()),
  }
}
