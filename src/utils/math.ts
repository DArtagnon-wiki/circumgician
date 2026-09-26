export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export function easeOutCubic(t: number): number {
  const inv = 1 - t
  return 1 - inv * inv * inv
}
