import type { MeleeAttack } from '@orbrun/scene'

export interface MeleePoint { x: number; y: number }
export type MeleeVariant = 0 | 1 | 2

/** One attack-local frame, shared by the guard, curve and artwork. Heading is
 * fixed when a swing begins; moving actor anchors never turn the weapon. */
export function meleeFrame(dx: number, dy: number) {
  const length = Math.hypot(dx, dy)
  const ux = length > 0 ? dx / length : 1, uy = length > 0 ? dy / length : 0
  return (forward: number, across: number, lift = 0): MeleePoint => ({
    x: ux * forward - uy * across,
    y: uy * forward + ux * across - lift,
  })
}

/** All families use the same cubic from a common guard to contact. Only the
 * two control points differ. Lift is explicitly screen-up; it is never an
 * angle correction or a second rotation. Misses shift the approach and end. */
export function meleePath(style: MeleeAttack['style'], variant: MeleeVariant, dx: number, dy: number, hit: boolean,
  frame = meleeFrame(dx, dy)) {
  const side = variant === 1 ? -1 : 1, breadth = variant === 2 ? 0.75 : 1
  const start = frame(0.14, 0)
  const point = (travel: number, across: number, lift = 0) => {
    const offset = frame(0, across, lift)
    return { x: dx * travel + offset.x, y: dy * travel + offset.y }
  }
  let a: MeleePoint, b: MeleePoint
  if (style === 'crush') {
    a = point(1, side * 0.12 * breadth, 1.35)
    b = point(1, side * 0.08 * breadth, 0.8)
  } else if (style === 'cleave') {
    a = point(0.65, -side * 0.5 * breadth, 0.7)
    b = point(0.95, -side * 0.3 * breadth, 0.4)
  } else if (style === 'thrust' || style === 'stab') {
    const line = (variant - 1) * (style === 'stab' ? 0.14 : 0.09)
    a = point(0.3, line)
    b = point(0.78, line * 0.35)
  } else {
    const arc = { slash: 0.7, reap: 1, staff: 0.55, lash: 0.85, unarmed: 0.25 }[style]
    a = point(0.3, -side * arc * breadth)
    b = point(0.85, -side * arc * breadth * 0.65)
  }
  const miss = hit ? { x: 0, y: 0 } : frame(0, -side * 0.72)
  const end = { x: dx + miss.x, y: dy + miss.y }
  if (!hit) {
    // Approach parallel to the attack axis so the larger artwork clears the
    // defender throughout contact, rather than crossing it on a final hook.
    a = point(0.35, -side * 0.72)
    b = { x: end.x - dx * 0.22, y: end.y - dy * 0.22 }
  }
  const velocity = { x: 3 * (end.x - b.x), y: 3 * (end.y - b.y) }
  const length = Math.hypot(velocity.x, velocity.y) || 1
  const tangent = { x: velocity.x / length, y: velocity.y / length }
  const path = (t: number): MeleePoint => {
    if (t <= 0) return start
    if (t >= 1) return { x: end.x + velocity.x * (t - 1), y: end.y + velocity.y * (t - 1) }
    const v = 1 - t
    return { x: v ** 3 * start.x + 3 * v * v * t * a.x + 3 * v * t * t * b.x + t ** 3 * end.x,
      y: v ** 3 * start.y + 3 * v * v * t * a.y + 3 * v * t * t * b.y + t ** 3 * end.y }
  }
  return { path, tangent }
}
