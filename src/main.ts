import './style.css'
import { AppShell } from './core/AppShell'

const app = document.querySelector<HTMLDivElement>('#app')!
const shell = new AppShell()
shell.mount(app)
