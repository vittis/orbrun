import { describe, expect, it, vi } from 'vitest'
import { emptyScene } from '@orbrun/scene'
import { DungeonArrival } from '../src/arrival.js'
import { groundDepth, type Projection } from '../src/projection.js'
import { type Context2d } from '../src/tiles.js'

const projection: Projection = { x: 0, y: 0, width: 900, height: 700, scale: 32, tilt: 50 * Math.PI / 180 }
function world() {
  const scene = { ...emptyScene(), levelKey: 'D:1', playerOnLevel: true }
  const arrival = new DungeonArrival()
  const gradient = { addColorStop: vi.fn() }
  const ctx = { createLinearGradient: vi.fn(() => gradient), save: vi.fn(), restore: vi.fn(), fillRect: vi.fn() }
  const draw = (now: number, p = projection) => arrival.draw(ctx as unknown as Context2d, p, now)
  arrival.observe(scene, 0, true)
  const jump = (x: number, y: number, now = 1) => {
    scene.player.x = x; scene.player.y = y
    arrival.observe(scene, now, true)
  }
  // Sample the actual gradient arguments, rather than a separate easing formula.
  const alpha = (x: number, y: number) => {
    const [ax, ay, bx, by] = ctx.createLinearGradient.mock.lastCall! as unknown as number[]
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
    const stops = gradient.addColorStop.mock.calls.slice(-5).map(([position, colour]) => [position, Number(colour.match(/,([^,]+)\)$/)[1])])
    const index = Math.min(3, Math.floor(t * 4)), [a, av] = stops[index], [b, bv] = stops[index + 1]
    return av + (bv - av) * (t - a) / (b - a)
  }
  return { scene, arrival, ctx, gradient, draw, jump, alpha }
}

describe('directional arrival sweep', () => {
  it.each([[8, 0], [-8, 0], [0, 8], [0, -8], [8, 8], [-8, 8], [8, -8], [-8, -8]])('clears toward (%i, %i) across desktop and portrait views', (dx, dy) => {
    for (const [width, height] of [[900, 700], [390, 600]]) for (const degrees of [35, 65]) {
      const { draw, jump, alpha } = world()
      const p = { ...projection, width, height, tilt: degrees * Math.PI / 180 }
      jump(dx, dy)
      expect(draw(1.16, p)).toBe(true)
      const x = Math.sign(dx) * width * 0.4, y = Math.sign(dy) * height * 0.4
      expect(alpha(width / 2 - x, height / 2 - y)).toBeLessThan(alpha(width / 2 + x, height / 2 + y))
    }
  })

  it('stays subtle and brightens monotonically without hiding the destination', () => {
    const { draw, jump, alpha, ctx } = world()
    jump(8, 8)
    let previous = 0.14
    for (let i = 0; i < 32; i++) {
      expect(draw(1 + i / 100)).toBe(true)
      const shade = alpha(450, 350)
      expect(shade).toBeGreaterThanOrEqual(0)
      expect(shade).toBeLessThanOrEqual(previous)
      previous = shade
    }
    const [ax, ay, bx, by] = ctx.createLinearGradient.mock.lastCall! as unknown as number[]
    expect((by - ay) / (bx - ax)).toBeCloseTo(groundDepth(projection.tilt))
    expect(draw(1.32)).toBe(false)
    expect(draw(2)).toBe(false)
  })

  it('does not restart for stationary observations and replaces rapid jumps without queuing', () => {
    const { scene, arrival, draw, jump, alpha } = world()
    jump(8, 0)
    arrival.observe(scene, 1.1, true)
    expect(draw(1.32)).toBe(false)
    jump(16, 0, 2)
    jump(8, 0, 2.1)
    expect(draw(2.26)).toBe(true)
    expect(alpha(100, 350)).toBeGreaterThan(alpha(800, 350))
    expect(draw(2.42)).toBe(false)
  })

  it.each([[0, 0], [1, 0], [0, -1], [-1, 1]])('ignores ordinary movement to (%i, %i)', (x, y) => {
    const { draw, jump } = world()
    expect(draw(0)).toBe(false)
    jump(x, y)
    expect(draw(1.1)).toBe(false)
  })

  it.each(['step', 'level', 'remote', 'disabled', 'finish', 'clear'] as const)('cancels immediately on %s', reset => {
    const { scene, arrival, draw, jump } = world()
    jump(8, 0)
    expect(draw(1.05)).toBe(true)
    if (reset === 'step') scene.player.x++
    if (reset === 'level') scene.levelKey = 'D:2'
    if (reset === 'remote') scene.playerOnLevel = false
    if (reset === 'finish') arrival.finish()
    if (reset === 'clear') arrival.clear()
    arrival.observe(scene, 1.06, reset !== 'disabled')
    expect(draw(1.06)).toBe(false)
  })

  it('skips initial positions, off-level browsing, returning to a level and Still arrivals', () => {
    const { scene, arrival, draw } = world()
    arrival.clear()
    scene.player.x = 20
    arrival.observe(scene, 1, true)
    expect(draw(1)).toBe(false)
    scene.playerOnLevel = false; scene.player.x = 30
    arrival.observe(scene, 2, true)
    expect(draw(2)).toBe(false)
    scene.playerOnLevel = true; scene.player.x = 40
    arrival.observe(scene, 3, true)
    expect(draw(3)).toBe(false)
    scene.player.x = 50
    arrival.observe(scene, 4, false)
    arrival.observe(scene, 4.1, true)
    expect(draw(4.1)).toBe(false)
  })
})
