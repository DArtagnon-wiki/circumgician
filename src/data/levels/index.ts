import { level1 } from './level1'
import { level2 } from './level2'
import { level3 } from './level3'
import { level4 } from './level4'
import { level5 } from './level5'
import { failTestNoMatch } from './failTestNoMatch'
import { failTestExhaustedUnlocks } from './failTestExhaustedUnlocks'
import type { LevelConfig } from './level1'

export const LEVELS: LevelConfig[] = [level1, level2, level3, level4, level5]

// Guaranteed-fail fixtures for manually verifying the loss condition — kept
// out of LEVELS so "5 levels"/progress-tracking/"Next Level" semantics stay
// untouched. Only surfaced in Level Select when ?debug=1 is active.
export const DEBUG_LEVELS: LevelConfig[] = [failTestNoMatch, failTestExhaustedUnlocks]

export type { LevelConfig }
