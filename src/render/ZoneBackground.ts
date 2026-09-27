import { Graphics } from 'pixi.js'
import { FIELD_ZONE, INVENTORY_ZONE, OBSTACLE_ZONE } from '../sim/constants'
import type { Rect } from '../sim/types'
import { ZONE_COLORS } from './Theme'

// Zone panels plus the level's own field: a glowing frame around the legal
// placement area, the rest of the middle zone dimmed, and blockers drawn as
// dark sealed slabs with a hatch so they read as "no placement" at a glance.
export function drawZoneBackground(field: Rect, blockers: Rect[]): Graphics {
  const g = new Graphics()
  const W = OBSTACLE_ZONE.w

  g.rect(0, OBSTACLE_ZONE.y, W, OBSTACLE_ZONE.h).fill({ color: ZONE_COLORS.obstacleArea })
  g.rect(0, FIELD_ZONE.y, W, FIELD_ZONE.h).fill({ color: ZONE_COLORS.outsideField })
  g.rect(0, INVENTORY_ZONE.y, W, INVENTORY_ZONE.h).fill({ color: ZONE_COLORS.inventoryBar })

  // Field floor with a soft radial-ish vignette built from concentric rects.
  g.roundRect(field.x, field.y, field.w, field.h, 14).fill({ color: ZONE_COLORS.miasmaField })
  const bands = 8
  for (let i = 1; i <= bands; i++) {
    const inset = (i / bands) * Math.min(field.w, field.h) * 0.35
    g.roundRect(field.x + inset, field.y + inset, field.w - inset * 2, field.h - inset * 2, 14).fill({ color: 0xffffff, alpha: 0.012 })
  }
  g.roundRect(field.x, field.y, field.w, field.h, 14).stroke({ color: ZONE_COLORS.fieldEdge, width: 2, alpha: 0.7 })
  g.roundRect(field.x - 3, field.y - 3, field.w + 6, field.h + 6, 16).stroke({ color: ZONE_COLORS.fieldEdge, width: 4, alpha: 0.15 })

  for (const b of blockers) {
    g.roundRect(b.x, b.y, b.w, b.h, 4).fill({ color: ZONE_COLORS.blocker })
    const step = 9
    for (let d = -b.h; d < b.w; d += step) {
      const x1 = b.x + Math.max(0, d)
      const y1 = b.y + Math.max(0, -d)
      const len = Math.min(b.w - Math.max(0, d), b.h - Math.max(0, -d))
      if (len <= 0) continue
      g.moveTo(x1, y1).lineTo(x1 + len, y1 + len)
    }
    g.stroke({ color: ZONE_COLORS.fieldEdge, width: 1, alpha: 0.25 })
    g.roundRect(b.x, b.y, b.w, b.h, 4).stroke({ color: ZONE_COLORS.fieldEdge, width: 1.5, alpha: 0.6 })
  }

  g.moveTo(0, OBSTACLE_ZONE.h).lineTo(W, OBSTACLE_ZONE.h).stroke({ color: ZONE_COLORS.divider, width: 1, alpha: 0.6 })
  g.moveTo(0, INVENTORY_ZONE.y).lineTo(W, INVENTORY_ZONE.y).stroke({ color: ZONE_COLORS.divider, width: 1, alpha: 0.6 })
  return g
}
