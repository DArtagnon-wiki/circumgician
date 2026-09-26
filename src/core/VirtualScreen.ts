// Fixed logical resolution the entire game renders in — chosen close to the
// scale existing constants (obstacle radius, rune radii, font sizes) were
// already tuned against, to minimize retuning, and it closely matches a
// modern iPhone's actual portrait aspect ratio (near-zero letterboxing on
// the actual target device).
export const VIRTUAL_WIDTH = 400
export const VIRTUAL_HEIGHT = 860

export interface ScreenFit {
  scale: number
  offsetX: number
  offsetY: number
}

// Uniform scale + centered offset to fit the fixed virtual canvas inside any
// real screen size, preserving aspect ratio (letterboxed/pillarboxed on a
// mismatched device) so the exact same layout/proportions appear everywhere.
// Safe-area is folded in here (shrinks the available height to fit into),
// not into zone layout — the game's internal proportions never change,
// only how much of the real screen they're scaled to fill.
export function computeFit(screenW: number, screenH: number, safeAreaBottomPx: number): ScreenFit {
  const availableH = Math.max(1, screenH - safeAreaBottomPx)
  const scale = Math.min(screenW / VIRTUAL_WIDTH, availableH / VIRTUAL_HEIGHT)
  const offsetX = (screenW - VIRTUAL_WIDTH * scale) / 2
  const offsetY = (availableH - VIRTUAL_HEIGHT * scale) / 2
  return { scale, offsetX, offsetY }
}
