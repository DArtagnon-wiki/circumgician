// Hue per polygon side-count, shared by obstacles and their matching rune shapes
// so a player can visually tell what goes with what without reading numbers.
export const SHAPE_COLORS: Record<number, number> = {
  3: 0xff5d5d, // triangle - red
  4: 0x4da6ff, // square - blue
  5: 0xb87bff, // pentagon - purple
  6: 0x4de6a8, // hexagon - green
  7: 0xffc93c, // heptagon - gold
  8: 0xff8fd6, // octagon - pink
}

export const BACKGROUND_TOP = 0x1a0f33
export const BACKGROUND_BOTTOM = 0x090512
export const MIASMA_COLOR = 0xd9c8ff

export function colorForSides(sides: number): number {
  return SHAPE_COLORS[sides] ?? 0xffffff
}
