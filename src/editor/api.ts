import type { LevelData } from '../sim/types'
import type { PackManifest } from '../data/levels/pack'

// Talks to the dev-server plugin in vite.config.ts. Only works under
// `npm run editor` / `npm run dev`; never in a production build.
const BASE = '/__levels/'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init)
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`)
  return (init?.method === 'PUT' ? undefined : await res.json()) as T
}

export const api = {
  manifest: () => request<PackManifest>('manifest'),
  saveManifest: (m: PackManifest) => request<void>('manifest', { method: 'PUT', body: JSON.stringify(m) }),
  level: (path: string) => request<LevelData>(path),
  saveLevel: (path: string, level: LevelData) => request<void>(path, { method: 'PUT', body: JSON.stringify(level) }),
}
