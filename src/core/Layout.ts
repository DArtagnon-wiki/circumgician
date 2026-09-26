export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface FieldLayout {
  width: number
  height: number
  obstacleArea: Rect
  miasmaField: Rect
  inventoryBar: Rect
}

const OBSTACLE_AREA_FRACTION = 0.55
const INVENTORY_HEIGHT = 130

// No longer takes a safe-area parameter — safe-area is folded into the
// virtual-canvas fit transform (see VirtualScreen.ts) instead, so this
// always computes the same zone rects for a given width/height. Called with
// the fixed VIRTUAL_WIDTH/VIRTUAL_HEIGHT, this makes zone proportions
// resize-invariant: only the outer letterbox scale/offset changes on resize,
// not obstacle/rune positions within the field.
export function computeLayout(width: number, height: number): FieldLayout {
  const obstacleHeight = height * OBSTACLE_AREA_FRACTION
  const miasmaTop = obstacleHeight
  const miasmaHeight = Math.max(0, height - INVENTORY_HEIGHT - obstacleHeight)

  return {
    width,
    height,
    obstacleArea: { x: 0, y: 0, width, height: obstacleHeight },
    miasmaField: { x: 0, y: miasmaTop, width, height: miasmaHeight },
    inventoryBar: { x: 0, y: height - INVENTORY_HEIGHT, width, height: INVENTORY_HEIGHT },
  }
}
