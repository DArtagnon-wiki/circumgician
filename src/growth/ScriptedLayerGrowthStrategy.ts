import type { GrowthContext, LayerGrowthStrategy } from './LayerGrowthStrategy'

export interface ScriptedLayerGrowthParams<TLayer> {
  sequence: TLayer[] // authored layers, indexed by GrowthContext.layerIndex
}

export class ScriptedLayerGrowthStrategy<TLayer> implements LayerGrowthStrategy<TLayer> {
  private params: ScriptedLayerGrowthParams<TLayer>

  constructor(params: ScriptedLayerGrowthParams<TLayer>) {
    this.params = params
  }

  next(ctx: GrowthContext): TLayer | null {
    return this.params.sequence[ctx.layerIndex] ?? null
  }
}
