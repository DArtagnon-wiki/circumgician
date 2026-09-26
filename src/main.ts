import './style.css'
import { Game } from './core/Game'
import { createDebugPanel, isDebugMode } from './debug/DebugPanel'

const app = document.querySelector<HTMLDivElement>('#app')!
const game = new Game()
game.mount(app)

if (isDebugMode()) {
  createDebugPanel((inner, outer) => game.debugSpawnRune(inner, outer))
}
