import { defineConfig, type Plugin } from 'vite'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const LEVEL_DIR = resolve(__dirname, 'src/data/levels')
const SLUG = /^(debug\/)?[a-z0-9-]+$/

// Dev-server-only API the level editor uses to read and write level JSON in
// the repo. `apply: 'serve'` keeps it out of production builds entirely.
//   GET  /__levels/manifest       -> manifest.json
//   PUT  /__levels/manifest       <- manifest.json
//   GET  /__levels/<id>           -> <id>.json   (id may be "debug/<id>")
//   PUT  /__levels/<id>           <- <id>.json
function levelsApi(): Plugin {
  return {
    name: 'circumgician-levels-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__levels/', async (req, res) => {
        const id = decodeURIComponent((req.url ?? '').replace(/^\//, '').split('?')[0])
        const file = id === 'manifest' ? 'manifest.json' : `${id}.json`
        if (id !== 'manifest' && !SLUG.test(id)) {
          res.statusCode = 400
          res.end('bad level id')
          return
        }
        const path = resolve(LEVEL_DIR, file)
        try {
          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json')
            res.end(await readFile(path, 'utf8'))
          } else if (req.method === 'PUT') {
            let body = ''
            for await (const chunk of req) body += chunk
            const parsed = JSON.parse(body) // reject non-JSON before touching disk
            await writeFile(path, JSON.stringify(parsed, null, 2) + '\n', 'utf8')
            res.end('ok')
          } else {
            res.statusCode = 405
            res.end()
          }
        } catch (e) {
          res.statusCode = (e as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500
          res.end(String(e))
        }
      })
    },
  }
}

export default defineConfig({
  base: '/circumgician/',
  plugins: [levelsApi()],
  build: {
    target: 'es2020',
  },
})
