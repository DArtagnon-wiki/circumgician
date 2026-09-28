// Color carries gameplay meaning only through HUE_COLORS (motes, bowls,
// tube liquid). Obstacles are neutral obsidian and rune bodies clear glass
// regardless of shape, so a hue is never mistaken for a shape-identity hint.
export const OBSTACLE_COLOR = 0x1c1430 // obsidian body (editor and fallbacks)
export const RUNE_BODY_COLOR = 0xd8d0f0 // clear glass
export const ACCENT_COLOR = 0xffffff

export const BACKGROUND_TOP = 0x1b0d36
export const BACKGROUND_BOTTOM = 0x07040e

// Jewel tones. The keys stay the sim's hue names so levels, the editor and
// the rules are untouched. Tuned for pairwise distance (CIEDE2000 >= 27 in
// normal vision, >= 12 under simulated protan/deutan/tritan vision) and to
// stand out from the violet backdrop.
export const HUE_COLORS: Record<string, number> = {
  red: 0xec2a52, // ruby
  blue: 0x2f6bff, // sapphire
  gold: 0xffb02e, // amber
  teal: 0x1fd6a0, // jade
  violet: 0xdd8bff, // amethyst
}

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
  return HUE_COLORS[color] ?? MIASMA_COLOR
}

export function colorForRelease(color: string): number {
  if (color === 'annihilating') return ASH_COLOR
  return colorForMote(color)
}

export const ZONE_COLORS = {
  fieldVeil: 0x0c0620, // tint laid over the legal placement area
  outsideVeil: 0x040208, // dims the rest of the middle zone
  shelf: 0x120a24, // inventory shelf glass
  gilt: 0xd9b872, // thin gold filigree lines
  etch: 0xc8b8ff, // etched lines in the field ring and arcane circles
  fieldEdge: 0x9b7bff,
}

export const INVALID_TINT = 0xff5d6c
