import type { MeleeAttack } from '@orbrun/scene'

export interface MeleePoint { x: number; y: number }

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
 * angle correction or a second rotation. Misses use the same gesture with
 * shorter reach, rather than veering sideways past the defender. */
export function meleePath(style: MeleeAttack['style'], dx: number, dy: number, hit: boolean,
  frame = meleeFrame(dx, dy)) {
  const reach = hit ? 1 : style === 'crush' ? 0.35 : 0.62
  const start = frame(0.14, 0)
  const point = (travel: number, across: number, lift = 0) => {
    const offset = frame(0, across * reach, lift * reach)
    return { x: dx * travel * reach + offset.x, y: dy * travel * reach + offset.y }
  }
  let a: MeleePoint, b: MeleePoint
  if (style === 'crush') {
    a = point(1, 0, 1.35)
    b = point(1, 0, 0.8)
  } else if (style === 'cleave') {
    a = point(0.35, -0.85)
    b = point(0.85, -0.5)
  } else if (style === 'thrust' || style === 'stab') {
    a = point(0.3, 0)
    b = point(0.78, 0)
  } else {
    const arc = { slash: 0.7, reap: 1, staff: 0.55, lash: 0.85, unarmed: 0.25 }[style]
    a = point(0.3, -arc)
    b = point(0.85, -arc * 0.65)
  }
  const end = { x: dx * reach, y: dy * reach }
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
