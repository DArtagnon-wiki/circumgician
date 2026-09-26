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
  inventoryContentHeight: number
}

const OBSTACLE_AREA_FRACTION = 0.55
const INVENTORY_CONTENT_HEIGHT = 130

export function computeLayout(width: number, height: number, safeAreaBottom: number): FieldLayout {
  const inventoryHeight = INVENTORY_CONTENT_HEIGHT + safeAreaBottom
  const obstacleHeight = height * OBSTACLE_AREA_FRACTION
  const miasmaTop = obstacleHeight
  const miasmaHeight = Math.max(0, height - inventoryHeight - obstacleHeight)

  return {
    width,
    height,
    obstacleArea: { x: 0, y: 0, width, height: obstacleHeight },
    miasmaField: { x: 0, y: miasmaTop, width, height: miasmaHeight },
    inventoryBar: { x: 0, y: height - inventoryHeight, width, height: inventoryHeight },
    inventoryContentHeight: INVENTORY_CONTENT_HEIGHT,
  }
}
