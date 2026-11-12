import { describe, expect, it } from 'vitest'
import { PointerDrag } from '../src/pointer-drag'
const MOUSE_SLOP = 6, TOUCH_SLOP = 8

describe('PointerDrag', () => {
  it('is no drag under the slop, a finger’s wider than a mouse’s', () => {
    const finger = new PointerDrag(true, { t: 0, x: 0, y: 0 })
    const mouse = new PointerDrag(false, { t: 0, x: 0, y: 0 })
    expect(finger.move([{ t: 8, x: TOUCH_SLOP - 1, y: 0 }])).toBe(null)
    expect(mouse.move([{ t: 8, x: MOUSE_SLOP, y: 0 }])).not.toBe(null)
    expect(finger.moved).toBe(false)
    expect(mouse.moved).toBe(true)
  })

  it('swallows the slop it crossed, so the view does not jump as the drag starts', () => {
    const g = new PointerDrag(true, { t: 0, x: 0, y: 0 })
    g.move([{ t: 8, x: 7, y: 0 }])
    expect(g.move([{ t: 16, x: 9, y: 0 }])).toEqual({ dx: 2, dy: 0 })
  })
})
