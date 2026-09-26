// Obstacles and rune bodies (outer/middle/center) are deliberately a single
// neutral tone each, regardless of shape — color is reserved entirely for
// node catch/release rings and miasma motes (HUE_COLORS below) so it always
// carries gameplay meaning and is never confused with a decorative shape-
// identity hint. Layers stay visually distinguishable by structure (stroke
// vs. fill vs. small preview), not hue.
export const OBSTACLE_COLOR = 0x4a3d6b
export const RUNE_BODY_COLOR = 0xd8d0f0
export const ACCENT_COLOR = 0xffffff // active glow / damage burst / link line

export const BACKGROUND_TOP = 0x1a0f33
export const BACKGROUND_BOTTOM = 0x090512
export const MIASMA_COLOR = 0xd9c8ff

// Deliberately its own palette, distinct in hue from SHAPE_COLORS — mote/node
// color must never be mistaken for a shape-matching hint.
export const HUE_COLORS: Record<string, number> = {
  red: 0xff4757,
  blue: 0x3742fa,
  gold: 0xffa502,
  teal: 0x2ed8b6,
  violet: 0x8854d0,
}

// Void/hazard treatment for the special 'annihilating' release value — reads
// as "something different happens here," not just another hue.
export const ANNIHILATING_COLOR = 0xff2266
export const ANNIHILATING_VOID = 0x140018

export function colorForMote(color: string): number {
  if (color === 'generic') return MIASMA_COLOR
  return HUE_COLORS[color] ?? MIASMA_COLOR
}

export function colorForRelease(color: string): number {
  if (color === 'annihilating') return ANNIHILATING_COLOR
  return colorForMote(color)
}

// Distinct background tints per zone so the three sections (obstacles /
// miasma field / inventory) read as visually separate areas, not one
// continuous gradient.
export const ZONE_COLORS = {
  obstacleArea: 0x1f1240,
  miasmaField: 0x120a26,
  inventoryBar: 0x0d0718,
  divider: 0x3a2b66,
}
