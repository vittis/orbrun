import { describe, expect, it } from 'vitest'
import { meleeTiming, type MeleeAttack } from '@orbrun/scene'
import { drawMelee } from '../src/melee-draw.js'
import { groundDepth, type Projection } from '../src/projection.js'
import type { MeleeStroke } from '../src/effects.js'
import type { Context2d } from '../src/tiles.js'

const styles: MeleeAttack['style'][] = ['slash', 'thrust', 'cleave', 'crush', 'unarmed']
const projection: Projection = { x: 0, y: 0, width: 640, height: 480, scale: 32, tilt: Math.PI / 4 }
interface Run { x: number; y: number; width: number; alpha: number; colour: string }
function frame(style: MeleeAttack['style'], age: number, options: Partial<MeleeStroke> = {}) {
  const runs: Run[] = []
  // Runs are local to the attacker; preserve nested contact-stamp transforms.
  let offset = { x: 0, y: 0 }
  const stack: typeof offset[] = []
  const ctx = {
    globalAlpha: 1, fillStyle: '',
    save() { stack.push({ ...offset }) }, restore() { offset = stack.pop() ?? { x: 0, y: 0 } },
    translate(x: number, y: number) { if (stack.length > 1) { offset.x += x; offset.y += y } }, scale() {},
    fillRect(x: number, y: number, width: number) { runs.push({ x: x + offset.x, y: y + offset.y, width, alpha: this.globalAlpha, colour: this.fillStyle }) },
  }
  const stroke: MeleeStroke = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, style, hit: true, born: 0, duration: meleeTiming(style).duration, ...options }
  drawMelee(ctx as unknown as Context2d, projection, stroke, age * stroke.duration)
  return runs
}
const area = (runs: Run[]) => runs.reduce((sum, r) => sum + r.width * r.alpha, 0)
const covers = (runs: Run[], x: number, y: number) => runs.some(r => r.alpha > 0.8 && r.x <= x && r.x + r.width > x && r.y <= y && r.y + 1 > y)

describe('pixel-art melee gestures', () => {
  it.each(styles)('%s reaches the defender at shared contact in every direction, including reaching weapons', style => {
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0]]) {
      const tx = x * 32, ty = Math.floor(y * groundDepth(projection.tilt) * 32)
      expect(covers(frame(style, 0.42001, { to: { x, y } }), tx, ty), `${style} contact ${x},${y}`).toBe(true)
      expect(covers(frame(style, 0.42001, { to: { x, y }, hit: false }), tx, ty), `${style} miss ${x},${y}`).toBe(false)
    }
  })

  it('gives thrusts a narrow profile, cleaves a broader sweep, and crushes an overhead path', () => {
    const span = (runs: Run[]) => Math.max(...runs.map(r => r.y)) - Math.min(...runs.map(r => r.y))
    expect(span(frame('thrust', 0.41))).toBeLessThan(span(frame('slash', 0.41)) / 2)
    expect(span(frame('cleave', 0.41))).toBeGreaterThan(span(frame('slash', 0.41)))
    expect(Math.min(...frame('crush', 0.3).map(r => r.y))).toBeLessThan(-12)
    expect(area(frame('unarmed', 0.41))).toBeLessThan(area(frame('slash', 0.41)))
  })

  it('brings overhead blows downward into the target even when attacking north', () => {
    const centreY = (runs: Run[]) => runs.reduce((sum, r) => sum + r.y * r.width * r.alpha, 0) / area(runs)
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, -1]]) {
      expect(centreY(frame('crush', 0.3, { to: { x, y } }))).toBeLessThan(centreY(frame('crush', 0.41, { to: { x, y } })))
    }
  })

  it.each(styles)('%s stays finite, bounded and on the tile pixel grid throughout its lifetime', style => {
    for (let i = 1; i < 100; i++) for (const hit of [false, true]) {
      const runs = frame(style, i / 100, { hit, intensity: 'heavy', to: { x: -1, y: -1 } })
      expect(runs.every(r => [r.x, r.y, r.width].every(Number.isInteger)
        && Math.abs(r.x) < 100 && Math.abs(r.y) < 100 && r.width > 0 && r.alpha > 0 && r.alpha <= 1)).toBe(true)
    }
  })

  it('scales the trail and sparks with confirmed strength and recolours elemental attacks', () => {
    expect(area(frame('cleave', 0.5, { intensity: 'heavy' }))).toBeGreaterThan(area(frame('cleave', 0.5, { intensity: 'light' })))
    expect(frame('slash', 0.5, { tone: 'fire' }).some(r => r.colour === '#ffe7ac')).toBe(true)
    expect(frame('slash', 0.5, { tone: 'cold' }).some(r => r.colour === '#e3fcf3')).toBe(true)
  })

  it.each(styles)('%s draws nothing before birth or after recovery', style => {
    for (const age of [-1, 0, 1, 2]) expect(frame(style, age)).toEqual([])
  })
})
