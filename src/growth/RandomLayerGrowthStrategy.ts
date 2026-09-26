import type { GrowthContext, LayerGrowthStrategy } from './LayerGrowthStrategy'

export interface RandomLayerGrowthParams<TLayer> {
  continueChance: number // 0..1 roll, evaluated fresh at every collapse
  maxLayers?: number // hard cap even if the roll would otherwise keep succeeding
  generate: (ctx: GrowthContext) => TLayer // actual layer content, owner-specific
}

export class RandomLayerGrowthStrategy<TLayer> implements LayerGrowthStrategy<TLayer> {
  private params: RandomLayerGrowthParams<TLayer>

  constructor(params: RandomLayerGrowthParams<TLayer>) {
    this.params = params
  }

  next(ctx: GrowthContext): TLayer | null {
    if (this.params.maxLayers !== undefined && ctx.layerIndex >= this.params.maxLayers) return null
    if (ctx.rng() >= this.params.continueChance) return null
    return this.params.generate(ctx)
  }
}
