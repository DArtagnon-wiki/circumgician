import { Graphics } from 'pixi.js'
import type { FieldLayout } from '../core/Layout'
import { ZONE_COLORS } from './Theme'

// Distinct panels per zone (obstacles / miasma field / inventory) plus a
// divider at each boundary and a subtle vignette on the miasma field, so the
// three sections read as visually separate areas rather than one continuous
// gradient.
export function drawZoneBackground(width: number, layout: FieldLayout): Graphics {
  const g = new Graphics()

  g.rect(0, layout.obstacleArea.y, width, layout.obstacleArea.height).fill({ color: ZONE_COLORS.obstacleArea })
  g.rect(0, layout.miasmaField.y, width, layout.miasmaField.height).fill({ color: ZONE_COLORS.miasmaField })
  g.rect(0, layout.inventoryBar.y, width, layout.inventoryBar.height).fill({ color: ZONE_COLORS.inventoryBar })

  const vignetteBands = 10
  for (let i = 0; i < vignetteBands; i++) {
    const t = i / (vignetteBands - 1)
    const alpha = Math.sin(t * Math.PI) * 0.06
    g.rect(
      0,
      layout.miasmaField.y + (layout.miasmaField.height * i) / vignetteBands,
      width,
      layout.miasmaField.height / vignetteBands + 1,
    ).fill({ color: 0xffffff, alpha })
  }

  g.moveTo(0, layout.obstacleArea.y + layout.obstacleArea.height)
    .lineTo(width, layout.obstacleArea.y + layout.obstacleArea.height)
    .stroke({ color: ZONE_COLORS.divider, width: 1, alpha: 0.6 })
  g.moveTo(0, layout.inventoryBar.y)
    .lineTo(width, layout.inventoryBar.y)
    .stroke({ color: ZONE_COLORS.divider, width: 1, alpha: 0.6 })

  return g
}
