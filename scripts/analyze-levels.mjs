// Prints the economy solver's decision profile (src/sim/solver.ts) for
// levels, and tension along each level's intended line (lines.ts). The
// TypeScript runs through Vite, so there is no build step:
//   npm run analyze-levels                   every pack level
//   npm run analyze-levels -- <id|file>...   chosen levels: ids from the
//                                            pack or debug pack, or paths
//                                            to level JSON files
//   npm run analyze-levels -- --room 4 ...   pieces the field holds at once
//                                            (default 5; "inf" for no limit)
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false },
})
try {
  const { PACK, DEBUG_PACK } = await server.ssrLoadModule('/src/data/levels/pack.ts')
  const { parseLevel } = await server.ssrLoadModule('/src/sim/validate.ts')
  const { profileLevel, tensionAlong } = await server.ssrLoadModule('/src/sim/solver.ts')
  const { formatProfile, formatTension } = await server.ssrLoadModule('/src/sim/solverReport.ts')
  const { intendedLine } = await server.ssrLoadModule('/src/data/levels/lines.ts')
  const { runScript } = await server.ssrLoadModule('/src/sim/headless.ts')
  const known = [...PACK, ...DEBUG_PACK]
  const args = process.argv.slice(2)
  const roomAt = args.indexOf('--room')
  const opts = {}
  if (roomAt >= 0) {
    const value = args.splice(roomAt, 2)[1]
    opts.maxPlaced = value === 'inf' ? Infinity : Number(value)
  }
  const levels = args.length
    ? await Promise.all(args.map(async (arg) => known.find((l) => l.id === arg) ?? parseLevel(JSON.parse(await readFile(arg, 'utf8')))))
    : PACK
  for (const level of levels) {
    if (level.endless) {
      console.log(`${level.name} (${level.id})\n  endless: stacks never end, nothing to solve\n`)
      continue
    }
    let report = formatProfile(level, profileLevel(level, opts))
    // Tension along the level's intended line, as the real sim plays it.
    const line = intendedLine(level.id)
    if (line) {
      const run = runScript(level, line.steps, { seed: 1 })
      const points = tensionAlong(level, run.moves, opts)
      report += `\n${points ? formatTension(points) : '  tension    the intended line is impossible in the model'}`
    }
    console.log(`${report}\n`)
  }
} finally {
  await server.close()
}
