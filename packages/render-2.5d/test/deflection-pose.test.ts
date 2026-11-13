import { describe, expect, it } from 'vitest'
import { deflectionPose } from '../src/deflection-pose.js'

describe('defensive popup motion', () => {
  it('pops with bounded overshoot, settles, then smoothly lifts and fades', () => {
    expect(deflectionPose(0).opacity).toBe(0)
    expect(deflectionPose(0.04).opacity).toBeGreaterThan(0)
    expect(deflectionPose(0.14).scale).toBeGreaterThan(1)
    expect(deflectionPose(0.3).scale).toBe(1)
    expect(deflectionPose(0.5).opacity).toBe(1)
    expect(deflectionPose(0.8).opacity).toBeLessThan(deflectionPose(0.65).opacity)
    expect(deflectionPose(0.8).lift).toBeGreaterThan(deflectionPose(0.65).lift)
    for (const edge of [-1, 1, 2]) expect(deflectionPose(edge).opacity).toBe(0)
    let previous = deflectionPose(0)
    for (let i = 1; i < 1000; i++) {
      const pose = deflectionPose(i / 1000)
      expect(pose.scale).toBeLessThan(1.1)
      expect(Math.abs(pose.scale - previous.scale)).toBeLessThan(0.03)
      expect(Math.abs(pose.opacity - previous.opacity)).toBeLessThan(0.05)
      previous = pose
    }
  })
  it('assigns separate positions without moving a surviving popup', () => {
    const positions = [0, 1, 2, 3, 4, 5].map(slot => deflectionPose(0.4, slot))
    expect(new Set(positions.map(p => `${p.x},${p.lift}`)).size).toBe(6)
    expect(deflectionPose(0.6, 1).x).toBe(positions[1].x)
  })
})
