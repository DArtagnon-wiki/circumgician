import type { Hue, PaletteName } from '../model/Color'

// Color carries gameplay meaning only through the hue colors (motes, bowls,
// tube liquid). Obstacles are neutral obsidian and rune bodies clear glass
// regardless of shape, so a hue is never mistaken for a shape-identity hint.
export const OBSTACLE_COLOR = 0x1c1430 // obsidian body (editor and fallbacks)
export const RUNE_BODY_COLOR = 0xd8d0f0 // clear glass
export const ACCENT_COLOR = 0xffffff

export const BACKGROUND_TOP = 0x1b0d36
export const BACKGROUND_BOTTOM = 0x07040e

export type SkyName = 'violet' | 'winter'

// How a level's five hues look, what the player calls them, and the sky
// they are seen against. The keys stay the sim's hue names, so levels, the
// editor and the rules are the same in every palette.
export interface Palette {
  hues: Record<Hue, number>
  names: Record<Hue, string>
  sky: SkyName
}

// Each palette is tuned for pairwise distance (CIEDE2000 >= 27 in normal
// vision, >= 12 under simulated protan/deutan/tritan vision), to stay clear
// of opal, ash and ice, and to stand out from its sky (Theme.test.ts).
export const PALETTES: Record<PaletteName, Palette> = {
  // Jewel tones under the violet sky: the default.
  jewel: {
    hues: { red: 0xec2a52, blue: 0x2f6bff, gold: 0xffb02e, teal: 0x1fd6a0, violet: 0xdd8bff },
    names: { red: 'Ruby', blue: 'Sapphire', gold: 'Amber', teal: 'Jade', violet: 'Amethyst' },
    sky: 'violet',
  },
  // The winter levels: cool gems under a winter sky. Nothing pale, so no
  // gem is lost against ice.
  cool: {
    hues: { red: 0xe10e93, blue: 0x1e7cd1, gold: 0xa7e238, teal: 0x3ac9b9, violet: 0xca9bff },
    names: { red: 'Tourmaline', blue: 'Lapis', gold: 'Peridot', teal: 'Turquoise', violet: 'Kunzite' },
    sky: 'winter',
  },
}

let active: Palette = PALETTES.jewel

// A scene sets its level's palette before it draws anything.
export function usePalette(name: PaletteName = 'jewel'): Palette {
  return (active = PALETTES[name] ?? PALETTES.jewel)
}

export const activePalette = (): Palette => active
export const hueColor = (hue: Hue): number => active.hues[hue]
export const hueName = (hue: Hue): string => active.names[hue]

// Ice and frost: pale blue light and white rime, never a hue (hues are what
// motes are, and every palette keeps clear of these).
export const FROST = 0x9fd4ff
export const RIME = 0xeaf7ff

// The 'annihilating' release: dull ash, no hue at all, drawn cracked and
// still. It must never read as another jewel tone (least of all ruby).
export const ASH_COLOR = 0x8a847d
export const ASH_DARK = 0x3a3531
export const ANNIHILATING_COLOR = ASH_COLOR

// Generic (wildcard) motes and releases are opalescent: a pale base that
// shifts through pastel play-of-color over time (see opal()).
export const MIASMA_COLOR = 0xeee6ff

const OPAL_STOPS = [0xffd4ee, 0xcff2ff, 0xd9ffe4, 0xfff1c9, 0xe4d4ff]

// Slowly shifting pastel iridescence. `seed` offsets the phase so two opal
// things side by side don't pulse in lockstep.
export function opal(t: number, seed = 0): number {
  const n = OPAL_STOPS.length
  const p = (((t * 0.35 + seed) % n) + n) % n
  const i = Math.floor(p)
  const f = p - i
  const e = f * f * (3 - 2 * f)
  return mix(OPAL_STOPS[i], OPAL_STOPS[(i + 1) % n], e)
}

export function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t)
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t)
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t)
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl)
}

// Brighten toward white (t = 0 keeps the color, 1 is white).
export const lighten = (c: number, t: number) => mix(c, 0xffffff, t)

export function colorForMote(color: string): number {
  if (color === 'generic') return MIASMA_COLOR
  return active.hues[color as Hue] ?? MIASMA_COLOR
}

export function colorForRelease(color: string): number {
  if (color === 'annihilating') return ASH_COLOR
  return colorForMote(color)
}

export const ZONE_COLORS = {
  outsideVeil: 0x040208, // dims the rest of the middle zone
  gilt: 0xd9b872, // thin gold filigree lines
}

// What changes with the sky: the etched lines in the field ring, arcane
// circles and constellations, the field's halo, the pane over the legal
// placement area, and the inventory shelf's glass (top and bottom).
export const SKY_TINTS: Record<SkyName, { etch: number; fieldEdge: number; fieldVeil: number; shelf: [number, number] }> = {
  violet: { etch: 0xc8b8ff, fieldEdge: 0x9b7bff, fieldVeil: 0x0c0620, shelf: [0x1a0e32, 0x06030c] },
  winter: { etch: 0xb4d6ff, fieldEdge: 0x6aaeff, fieldVeil: 0x03101f, shelf: [0x0a1a30, 0x02060c] },
}

export const INVALID_TINT = 0xff5d6c
