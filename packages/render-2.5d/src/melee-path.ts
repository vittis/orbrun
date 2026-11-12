import type { MeleeAttack } from '@orbrun/scene'

export interface MeleePoint { x: number; y: number }
export type MeleeVariant = 0 | 1 | 2

/** Screen-facing paths in cell units. Every gesture starts at the attacker's
 * guard, hits (dx,dy) at t=1, then continues along the contact tangent. Camera
 * foreshortening belongs to the travel axis, never to the weapon silhouette. */
export function meleePath(style: MeleeAttack['style'], variant: MeleeVariant, dx: number, dy: number, hit: boolean) {
  const reach = Math.hypot(dx, dy), ux = dx / reach, uy = dy / reach
  const side = variant === 1 ? -1 : 1
  const local = (forward: number, across: number): MeleePoint => ({ x: ux * forward - uy * across, y: uy * forward + ux * across })
  let start: MeleePoint, a: MeleePoint, b: MeleePoint, guard: MeleePoint | undefined
  const end = { x: dx, y: dy }
  if (style === 'slash' || style === 'cleave') {
    const arc = style === 'cleave' ? 0.95 : 0.62
    start = local(Math.min(reach * 0.18, 0.24), -side * 0.18)
    a = local(reach * (variant === 2 ? 0.3 : 0.48), -side * arc)
    b = local(reach * (variant === 2 ? 0.82 : 1.06), -side * arc * 0.8)
  } else if (style === 'crush') {
    // Keep the final control point ABOVE the target. Rotating an
    // overhead arc with the ground axis makes northbound blows turn upward.
    guard = local(Math.min(reach * 0.16, 0.18), side * 0.13)
    guard.y -= 0.16
    start = { x: dx * 0.7 + (variant === 2 ? 0 : side * 0.16), y: dy - (variant === 2 ? 0.9 : 0.75) }
    a = { x: dx + (variant === 2 ? 0 : side * 0.2), y: start.y + 0.12 }
    b = { x: dx + (variant === 2 ? 0 : side * 0.12), y: dy - 0.35 }
  } else if (style === 'thrust') {
    start = local(Math.min(reach * 0.16, 0.22), (variant - 1) * 0.13)
    a = local(reach * 0.4, (variant - 1) * 0.1)
    b = local(reach * 0.76, 0)
  } else {
    const hook = variant === 2 ? 0.42 : side * 0.12
    start = local(Math.min(reach * 0.18, 0.24), -hook * 0.5)
    a = local(reach * 0.36, -hook)
    b = local(reach * 0.78, -hook)
  }
  // Keep misses outside the defender, including their follow-through.
  if (!hit) {
    // An overhead miss lands to a screen side; a north/east-dependent offset
    // could otherwise fall straight through the defender during follow-through.
    const miss = style === 'crush' ? { x: side * 0.4, y: 0 } : local(0, -side * 0.4)
    end.x += miss.x; end.y += miss.y
    b.x += miss.x; b.y += miss.y
    if (style !== 'crush') {
      const approach = local(-Math.min(reach * 0.24, 0.3), -side * 0.1)
      b = { x: end.x + approach.x, y: end.y + approach.y }
    }
  }
  const length = Math.hypot(end.x - b.x, end.y - b.y) || 1
  const tangent = { x: (end.x - b.x) / length, y: (end.y - b.y) / length }
  const launch = guard ? 0.55 : 0, span = 1 - launch
  const path = (t: number): MeleePoint => {
    if (guard && t < launch) {
      const lift = Math.max(0, t) / launch, ease = lift * lift * (3 - 2 * lift)
      return { x: guard.x + (start.x - guard.x) * ease, y: guard.y + (start.y - guard.y) * ease }
    }
    if (t > 1) return { x: end.x + 3 * (end.x - b.x) * (t - 1) / span, y: end.y + 3 * (end.y - b.y) * (t - 1) / span }
    const u = Math.max(0, (t - launch) / span), v = 1 - u
    return { x: v ** 3 * start.x + 3 * v * v * u * a.x + 3 * v * u * u * b.x + u ** 3 * end.x,
      y: v ** 3 * start.y + 3 * v * v * u * a.y + 3 * v * u * u * b.y + u ** 3 * end.y }
  }
  return { path, tangent }
}
