import { Container } from 'pixi.js'

export interface Layers {
  root: Container
  background: Container
  links: Container
  motes: Container
  obstacles: Container
  runes: Container
  effects: Container
  drag: Container
}

export function createLayers(): Layers {
  const root = new Container()
  const background = new Container()
  const links = new Container()
  const motes = new Container()
  const obstacles = new Container()
  const runes = new Container()
  const effects = new Container()
  const drag = new Container()

  // Draw/interaction order, back to front.
  root.addChild(background, links, obstacles, runes, motes, effects, drag)

  return { root, background, links, motes, obstacles, runes, effects, drag }
}
