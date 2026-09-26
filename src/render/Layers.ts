import { Container } from 'pixi.js'

export interface Layers {
  root: Container
  background: Container
  miasmaField: Container
  obstacles: Container
  inventory: Container
  effects: Container
  debugUI: Container
}

export function createLayers(): Layers {
  const root = new Container()
  const background = new Container()
  const miasmaField = new Container()
  const obstacles = new Container()
  const inventory = new Container()
  const effects = new Container()
  const debugUI = new Container()

  // Draw/interaction order, back to front.
  root.addChild(background, miasmaField, obstacles, inventory, effects, debugUI)

  return { root, background, miasmaField, obstacles, inventory, effects, debugUI }
}
