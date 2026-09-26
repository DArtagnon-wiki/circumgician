import type { Id } from '../core/types'

export interface GrowthContext {
  ownerId: Id // the obstacle or rune this growth strategy belongs to
  layerIndex: number // how many layers have already appeared (0-based)
  rng: () => number
}

// Shared by both obstacle-layer growth and rune-center growth — same shape
// of question either way: "given how many layers have appeared, does
// another one form, and what is it." TLayer is ObstacleLayerSpec or
// RuneLayerSpec depending on the owner.
export interface LayerGrowthStrategy<TLayer> {
  next(ctx: GrowthContext): TLayer | null
}
