import type { Rect } from './types'

// Virtual canvas zones (see core/VirtualScreen: 400 x 860). A level's field
// rect must lie inside FIELD_ZONE; obstacles sit inside OBSTACLE_ZONE.
export const VIRTUAL_W = 400
export const VIRTUAL_H = 860
export const OBSTACLE_ZONE: Rect = { x: 0, y: 0, w: 400, h: 300 }
export const FIELD_ZONE: Rect = { x: 0, y: 300, w: 400, h: 430 }
export const INVENTORY_ZONE: Rect = { x: 0, y: 730, w: 400, h: 130 }

// Catching. Reach is uniform and small; a rune's catch ring is the annulus
// [radius - REACH, radius + REACH] swept by its orbiting outer nodes.
export const REACH = 14
export const DEFAULT_TETHER = 8
export const DRIFT_SPEED = 9 // px/s along the tether wander path

// Spin: angular speed = SPIN_K / radius (rad/s) — larger runes turn slower.
// The middle layer counter-rotates at the speed its own radius implies.
export const SPIN_K = 36

export const TRAVEL_TIME = 0.35 // s for a claimed mote to reach its node
export const EJECT_TIME = 0.55 // s for a released mote to fly out and settle
export const BURST_GAP = 26 // released motes land this far outside the outer radius

// Kicks and pushes. A kicked mote coasts about speed / MOTE_FRICTION px,
// and where it comes to rest becomes its new home. Kick speed scales with
// how far from the mote the touch lands (away from the touch).
export const KICK_GAIN = 9 // (px/s) per px of touch offset
export const KICK_MIN = 70
export const KICK_MAX = 240
export const MOTE_FRICTION = 3 // 1/s exponential velocity decay
// A swipe flicks a mote along it: at least far enough to travel the swipe's
// length (MOTE_FRICTION px/s per px), farther for a quicker swipe
// (FLICK_GAIN of its speed), up to FLICK_MAX.
export const FLICK_GAIN = 0.35
export const FLICK_MAX = 360
export const SETTLE_SPEED = 4
// Placed runes push motes they can't take out of their body and clear of
// the catch ring, harder the deeper they sit. (One they can take is drawn
// to a bowl instead: see updateCatching.)
export const PUSH_BASE = 50
export const PUSH_DEPTH = 160

// Footprint = outer radius + this margin (node rings draw slightly outside).
export const FOOTPRINT_MARGIN = 4

// A blow's timing (the detonation's choreography follows it): the glass
// bursts STRIKE_LAUNCH after the tap, and the orb lands on its obstacle
// STRIKE_FLIGHT later, longer the farther it flies (see strikeTime).
export const STRIKE_LAUNCH = 0.25
export const STRIKE_FLIGHT = { base: 0.12, perPx: 1 / 1300, min: 0.22, max: 0.42 }

// Ice: default radius of a block placed in a level, and where its locked
// motes sit (just inside its vertices, as a share of its radius). Motes
// freed from ice wait for the blow that frees them to land; ice thawed by
// its frost layer's fall shatters THAW_LAG after that.
export const ICE_RADIUS = 30
export const FROZEN_INSET = 0.68
export const THAW_LAG = 0.25
