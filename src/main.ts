import './style.css'
import { Game } from './core/Game'

const app = document.querySelector<HTMLDivElement>('#app')!
const game = new Game()
game.mount(app)
