/** Fast overshoot, firm settle and a smooth lifted fade; normalized lifetime. */
export function deflectionPose(age: number, slot = 0) {
  if (age < 0 || age >= 1) return { scale: 0, squash: 1, lift: 0, x: 0, opacity: 0 }
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const enter = Math.min(1, age / 0.22), back = enter - 1
  const pop = 1 + 2.5 * back ** 3 + 1.5 * back ** 2
  const leave = smooth(Math.max(0, (age - 0.58) / 0.42))
  return {
    scale: 0.3 + pop * 0.7,
    squash: 0.72 + smooth(Math.min(1, age / 0.16)) * 0.28,
    lift: (1 - (1 - Math.min(1, age / 0.3)) ** 3) * 0.2 + leave * 0.14 + Math.floor(slot / 3) * 0.65,
    x: [0, -0.94, 0.94][slot % 3],
    opacity: smooth(Math.min(1, age / 0.045)) * (1 - leave),
  }
}
