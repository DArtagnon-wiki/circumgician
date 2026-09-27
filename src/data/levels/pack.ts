import { parseLevel } from '../../sim/validate'
import type { LevelData } from '../../sim/types'
import manifest from './manifest.json'

// Bundled statically: the deployed game never fetches level files at runtime.
const files = import.meta.glob<unknown>(['./*.json', './debug/*.json', '!./manifest.json'], { eager: true, import: 'default' })

function load(path: string): LevelData {
  const raw = files[path]
  if (raw === undefined) throw new Error(`Level file missing: ${path}`)
  try {
    return parseLevel(raw)
  } catch (e) {
    throw new Error(`${path}: ${(e as Error).message}`)
  }
}

export interface PackManifest {
  levels: string[]
  debug: string[]
}

export const MANIFEST: PackManifest = manifest
export const PACK: LevelData[] = MANIFEST.levels.map((id) => load(`./${id}.json`))
export const DEBUG_PACK: LevelData[] = MANIFEST.debug.map((id) => load(`./debug/${id}.json`))
