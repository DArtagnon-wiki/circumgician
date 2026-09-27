import type { Hue, LevelData, MoteSpec, ObstacleSpec, ReleaseColor, RuneLayerSpec } from './types'

// Compact builders for crafted test levels.
export function layer(sides: number, radius: number, c: Hue, release: ReleaseColor = c): RuneLayerSpec {
  return { sides, radius, nodes: Array.from({ length: sides }, () => ({ catch: c, release })) }
}

export function mote(color: MoteSpec['color'], x: number, y: number, tether = 0): MoteSpec {
  return { color, x, y, tether }
}

export function obstacle(x: number, y: number, ...layers: [sides: number, hp: number][]): ObstacleSpec {
  return { x, y, layers: layers.map(([sides, hp]) => ({ sides, radius: 30, hp })) }
}

export function testLevel(parts: Partial<LevelData> & Pick<LevelData, 'hand'>): LevelData {
  return {
    version: 1,
    id: 'test',
    name: 'Test',
    field: { x: 0, y: 300, w: 400, h: 430 },
    blockers: [],
    motes: [],
    obstacles: [obstacle(200, 150, [3, 100])],
    goal: { type: 'clearAll' },
    ...parts,
  }
}

// Motes placed evenly on a circle — e.g. exactly on a rune's catch ring.
export function ring(color: MoteSpec['color'], cx: number, cy: number, r: number, n: number, phase = 0.3): MoteSpec[] {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2
    return mote(color, cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  })
}
