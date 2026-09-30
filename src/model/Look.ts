// How an obstacle looks: its material and how it idles. Purely cosmetic
// (the sim never reads it), so levels are free to vary it. Materials are
// neutral stuffs rather than hues, since hue means a mote's color; and
// obstacles in one level usually share one, so it never reads as a hint
// about shape.
export const OBSTACLE_STYLES = ['obsidian', 'marble', 'magma', 'void', 'astrolabe', 'monolith', 'geode'] as const
export type ObstacleStyle = (typeof OBSTACLE_STYLES)[number]

// Idle motion: a slow sway, a float, a turn, a breath, a small wander, or
// none. Each style has its own default.
export const OBSTACLE_MOTIONS = ['sway', 'bob', 'spin', 'pulse', 'drift', 'still'] as const
export type ObstacleMotion = (typeof OBSTACLE_MOTIONS)[number]

export const MAX_MOONS = 4

export interface ObstacleLook {
  style?: ObstacleStyle // default obsidian
  motion?: ObstacleMotion
  moons?: number // small satellites circling it (0 to MAX_MOONS)
}
