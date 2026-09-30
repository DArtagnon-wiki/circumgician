import { describe, expect, it } from 'vitest'
import { ASH_COLOR, FROST, MIASMA_COLOR, PALETTES, RIME, SKY_TINTS } from './Theme'
import { PALETTE_NAMES, type Hue } from '../model/Color'

// Color distance as people see it: CIEDE2000 on sRGB, with color-vision
// deficiencies simulated by the Machado et al. (2009) matrices at full
// severity, applied in linear RGB.
const linear = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const encode = (c: number) => {
  c = Math.min(1, Math.max(0, c))
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
}
const rgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
type Vision = 'normal' | 'protan' | 'deutan' | 'tritan'
const MACHADO: Record<Exclude<Vision, 'normal'>, number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
}
function seen(hex: number, vision: Vision): number[] {
  if (vision === 'normal') return rgb(hex)
  const l = rgb(hex).map(linear)
  return MACHADO[vision].map((row) => encode(row[0] * l[0] + row[1] * l[1] + row[2] * l[2]))
}
function lab([r, g, b]: number[]): [number, number, number] {
  const [R, G, B] = [r, g, b].map(linear)
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  const x = f((R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047)
  const y = f(R * 0.2126729 + G * 0.7151522 + B * 0.072175)
  const z = f((R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
function ciede2000([L1, a1, b1]: number[], [L2, a2, b2]: number[]): number {
  const rad = Math.PI / 180
  const C7 = ((Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2) ** 7
  const G = 0.5 * (1 - Math.sqrt(C7 / (C7 + 25 ** 7)))
  const [a1p, a2p] = [a1 * (1 + G), a2 * (1 + G)]
  const [C1, C2] = [Math.hypot(a1p, b1), Math.hypot(a2p, b2)]
  const hue = (b: number, a: number) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360)
  const [h1, h2] = [hue(b1, a1p), hue(b2, a2p)]
  let dh = 0
  if (C1 * C2 !== 0) dh = h2 - h1 > 180 ? h2 - h1 - 360 : h2 - h1 < -180 ? h2 - h1 + 360 : h2 - h1
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh / 2) * rad)
  const L = (L1 + L2) / 2
  const C = (C1 + C2) / 2
  let h = h1 + h2
  if (C1 * C2 !== 0) h = Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2
  const T = 1 - 0.17 * Math.cos((h - 30) * rad) + 0.24 * Math.cos(2 * h * rad) + 0.32 * Math.cos((3 * h + 6) * rad) - 0.2 * Math.cos((4 * h - 63) * rad)
  const SL = 1 + (0.015 * (L - 50) ** 2) / Math.sqrt(20 + (L - 50) ** 2)
  const SC = 1 + 0.045 * C
  const SH = 1 + 0.015 * C * T
  const RT = -Math.sin(2 * 30 * Math.exp(-(((h - 275) / 25) ** 2)) * rad) * 2 * Math.sqrt(C ** 7 / (C ** 7 + 25 ** 7))
  const [dL, dC, dHs] = [(L2 - L1) / SL, (C2 - C1) / SC, dH / SH]
  return Math.sqrt(dL ** 2 + dC ** 2 + dHs ** 2 + RT * dC * dHs)
}
const distance = (a: number, b: number, vision: Vision) => ciede2000(lab(seen(a, vision)), lab(seen(b, vision)))
const VISIONS: Vision[] = ['normal', 'protan', 'deutan', 'tritan']
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0')

// The smallest distance between two of the given colors, per vision, and
// which pair it is.
function closest(colors: Record<string, number>, others: Record<string, number> = colors) {
  return VISIONS.map((vision) => {
    let min = Infinity
    let pair = ''
    for (const [n, a] of Object.entries(colors)) {
      for (const [m, b] of Object.entries(others)) {
        if (colors === others && n >= m) continue
        const d = distance(a, b, vision)
        if (d < min) [min, pair] = [d, `${n} ${hex(a)} / ${m} ${hex(b)}`]
      }
    }
    return { vision, min: Math.round(min * 10) / 10, pair }
  })
}

describe('palettes', () => {
  it('the ciede2000 here agrees with published test data', () => {
    // Sharma, Wu and Dalal (2005), pairs 1, 7 and 17.
    expect(ciede2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3)
    expect(ciede2000([50, 0, 0], [50, -1, 2])).toBeCloseTo(2.3669, 3)
    expect(ciede2000([50, 2.5, 0], [73, 25, -18])).toBeCloseTo(27.1492, 3)
  })

  for (const name of PALETTE_NAMES) {
    const { hues, names, sky } = PALETTES[name]

    it(`${name}: every hue is far from every other, in every kind of vision`, () => {
      for (const { vision, min, pair } of closest(hues)) expect(min, `${vision}: ${pair}`).toBeGreaterThanOrEqual(vision === 'normal' ? 27 : 12)
    })

    it(`${name}: no hue reads as opal (wildcards), ash or ice`, () => {
      const kin = { opal: MIASMA_COLOR, ash: ASH_COLOR, frost: FROST, rime: RIME }
      for (const { vision, min, pair } of closest(hues, kin)) expect(min, `${vision}: ${pair}`).toBeGreaterThanOrEqual(vision === 'normal' ? 20 : 8)
    })

    it(`${name}: every hue is bright enough to glow against its sky`, () => {
      const pane = lab(rgb(SKY_TINTS[sky].fieldVeil))[0]
      for (const [hue, c] of Object.entries(hues)) expect(lab(rgb(c))[0] - pane, `${hue} ${hex(c)}`).toBeGreaterThanOrEqual(40)
    })

    it(`${name}: every hue has its own name and a sky`, () => {
      const all = Object.keys(hues) as Hue[]
      expect(new Set(all.map((h) => names[h])).size).toBe(all.length)
      expect(SKY_TINTS[sky]).toBeDefined()
    })
  }

  it('each palette is its own', () => {
    const seen = new Set<string>()
    for (const name of PALETTE_NAMES) {
      const key = JSON.stringify(PALETTES[name].hues)
      expect(seen.has(key), name).toBe(false)
      seen.add(key)
    }
  })
})
