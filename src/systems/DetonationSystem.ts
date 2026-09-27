import type { GameState } from '../core/GameState'
import type { EventBus } from '../core/EventBus'
import type { Rect } from '../core/Layout'
import type { Id, Vec2 } from '../core/types'
import type { Rune } from '../model/Rune'
import { freshNodes, runeDamage } from '../model/Rune'
import { randRange } from '../utils/math'
import type { RuneGrowthSystem } from './RuneGrowthSystem'
import { findNearestObstacleByShape } from './matching'

const EJECT_SPEED = 150 // px/s — real outward launch speed; MiasmaFieldSystem decays this back to ambient

// Consumes 'rune:ready': resolves damage against the linked obstacle,
// resolves each node's catch independently (recolor-and-release, or destroy
// if that node's release is 'annihilating'), then promotes the rune in place
// — outer destroyed, middle -> outer, center -> middle (if one exists) plus
// a freshly-rolled center, or the rune is truly removed if there was no
// center to promote (the only real vacancy case now). Obstacle death/
// promotion is ObstacleHealthSystem's job (listens separately to
// 'obstacle:damaged') so obstacle lifecycle stays decoupled from combat math.
export class DetonationSystem {
  private state: GameState
  private bus: EventBus
  private fieldBounds: () => Rect
  private runeGrowth: RuneGrowthSystem
  private getObstaclePosition: (id: Id) => Vec2 | undefined

  constructor(
    state: GameState,
    bus: EventBus,
    fieldBounds: () => Rect,
    runeGrowth: RuneGrowthSystem,
    getObstaclePosition: (id: Id) => Vec2 | undefined,
  ) {
    this.state = state
    this.bus = bus
    this.fieldBounds = fieldBounds
    this.runeGrowth = runeGrowth
    this.getObstaclePosition = getObstaclePosition
    this.bus.on('rune:ready', ({ rune }) => this.detonate(rune))
  }

  private detonate(rune: Rune): void {
    const obstacle = this.state.obstacles.find((o) => o.id === rune.linkedObstacleId)
    if (obstacle) {
      const damage = runeDamage(rune)
      obstacle.hp = Math.max(0, obstacle.hp - damage)
      this.bus.emit('obstacle:damaged', { obstacle, damage })
    }

    this.resolveNodes(rune)
    // Emitted with the rune still in its PRE-promotion state — listeners
    // that care what actually detonated (SFX, unlock-trigger matching) must
    // see this pairing, not what it becomes next.
    this.bus.emit('rune:detonated', { rune })
    this.promote(rune)
  }

  private resolveNodes(rune: Rune): void {
    const bounds = this.fieldBounds()
    const annihilated: Id[] = []

    rune.nodes.forEach((node, i) => {
      if (!node.puffId) return
      const puff = this.state.miasmaPuffs.find((p) => p.id === node.puffId)
      if (!puff) return

      const release = rune.outer.nodeColors[i].release
      if (release === 'annihilating') {
        this.state.miasmaPuffs = this.state.miasmaPuffs.filter((p) => p.id !== puff.id)
        annihilated.push(puff.id)
        return
      }

      puff.color = release
      puff.targetRuneId = undefined
      puff.targetNodeIndex = undefined
      puff.travelStartPos = undefined
      puff.travelElapsed = undefined
      // Originates at the collapsing rune's own position, not a random spot
      // anywhere in the field — a released mote should read as coming FROM
      // the rune that just gave it up, and launches outward at real speed
      // (MiasmaFieldSystem's 'ejecting' branch decays it back to normal
      // ambient drift) rather than just appearing there.
      const origin = rune.fieldPosition ?? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      puff.position.x = origin.x + randRange(-12, 12)
      puff.position.y = origin.y + randRange(-12, 12)
      const ejectAngle = randRange(0, Math.PI * 2)
      puff.velocity.x = Math.cos(ejectAngle) * EJECT_SPEED
      puff.velocity.y = Math.sin(ejectAngle) * EJECT_SPEED
      puff.state = 'ejecting'
      puff.ejectElapsed = 0
    })

    if (annihilated.length > 0) this.bus.emit('miasma:annihilated', { puffIds: annihilated })
  }

  private promote(rune: Rune): void {
    rune.outer = rune.middle
    rune.nodes = freshNodes(rune.outer)

    if (!rune.center) {
      this.runeGrowth.unregister(rune.id)
      this.state.inventory.removeRune(rune.id)
      this.bus.emit('rune:depleted', { rune })
      return
    }

    rune.middle = rune.center
    rune.center = this.runeGrowth.nextCenter(rune.id, rune.centerLayerIndex)
    rune.centerLayerIndex += 1
    this.relink(rune)
    this.bus.emit('rune:promoted', { rune })
  }

  // The new middle's shape may differ from the old one — re-validate the
  // link rather than silently keep damaging whatever the old link pointed
  // to. Auto-relink to the nearest obstacle matching the new middle shape;
  // if none, the rune sits inert-but-still-collecting until its next
  // promotion tries again.
  private relink(rune: Rune): void {
    if (!rune.fieldPosition) return
    const match = findNearestObstacleByShape(
      this.state.obstacles,
      rune.middle.shape.sides,
      rune.fieldPosition,
      this.getObstaclePosition,
    )
    rune.linkedObstacleId = match ? match.id : null
  }
}
