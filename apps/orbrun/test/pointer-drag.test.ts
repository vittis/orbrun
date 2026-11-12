// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { initialState } from '@orbrun/webtiles'
import { GameScreen } from '../src/game'

/**
 * A held button that goes up outside the window is never heard as a pointerup,
 * so the drag has to be let go of some other way: the page losing focus, or
 * the next move arriving with nothing held.
 */
function harness() {
  const canvas = document.createElement('canvas')
  Object.assign(canvas, {
    setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  })
  const onPointer = vi.fn()
  const screen = Object.assign(Object.create(GameScreen.prototype), {
    canvas, drag: null, hover: null, pointerLive: false, tooltipTimer: 0, ctx: { mode: 'command' },
    hud: { hideTooltip: vi.fn(), dismissesMoreAt: () => false }, session: { state: initialState() },
    inputFrom: vi.fn(), wake: vi.fn(), armCellTooltip: vi.fn(), onPointer,
  }) as { attachPointer(c: HTMLCanvasElement): void; cancelDrag(): void; setPresentation(): void; drag: unknown; canvas: HTMLCanvasElement }
  screen.attachPointer(canvas)
  const at = (type: string, x: number, y: number, buttons: number) => {
    canvas.dispatchEvent(Object.assign(new Event(type), { pointerId: 1, pointerType: 'mouse', button: 0, buttons, clientX: x, clientY: y, pageX: x, pageY: y }))
  }
  /** a finger at `t` ms; `type` pointercancel when the system takes it away */
  const touch = (type: string, x: number, y: number, t: number) => {
    const ev = Object.assign(new Event(type), { pointerId: 2, pointerType: 'touch', button: 0, buttons: 1, clientX: x, clientY: y, pageX: x, pageY: y })
    Object.defineProperty(ev, 'timeStamp', { value: t })
    canvas.dispatchEvent(ev)
  }
  return { screen, at, touch, onPointer }
}

describe('a drag whose release the page never saw', () => {
  it('lets go on the first move with no button held, without acting on a cell', () => {
    const h = harness()
    h.at('pointerdown', 100, 100, 1)
    h.at('pointermove', 200, 100, 1)
    // the button came up off the window; the pointer comes back over the canvas
    h.at('pointermove', 300, 100, 0)
    expect(h.screen.drag).toBe(null)
    expect(h.onPointer).not.toHaveBeenCalled()
    h.at('pointermove', 400, 100, 0)
  })

  it('lets go when the window loses focus, and the press that follows is a fresh one', () => {
    const h = harness()
    h.at('pointerdown', 100, 100, 1)
    h.at('pointermove', 200, 100, 1)
    window.dispatchEvent(new Event('blur'))
    expect(h.screen.drag).toBe(null)
    expect(h.onPointer).not.toHaveBeenCalled()
    h.at('pointermove', 300, 100, 1)
  })

  it('a stale drag is dropped without acting on the cell it ended over', () => {
    const h = harness()
    h.at('pointerdown', 100, 100, 1)
    h.at('pointermove', 101, 100, 0)
    expect(h.screen.drag).toBe(null)
    expect(h.onPointer).not.toHaveBeenCalled()
    expect(h.onPointer).not.toHaveBeenCalled()
  })

  it('a second canvas (a renderer swap) shares the one blur listener, so leaving the game leaves none behind', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const h = harness()
    const again = document.createElement('canvas')
    Object.assign(again, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: () => true })
    h.screen.attachPointer(again)
    const blurs = add.mock.calls.filter(([type]) => type === 'blur').map(([, fn]) => fn)
    expect(blurs.length).toBe(2)
    expect(new Set(blurs).size).toBe(1)
    add.mockRestore()
  })

  it('a finger on the view as the level map swaps it out lets go, and the next press is a fresh one', () => {
    const h = harness()
    document.body.append(h.screen.canvas)
    const swapped = { setCursor: vi.fn(), destroy: vi.fn() }
    Object.assign(h.screen, {
      renderer: { setCursor: vi.fn(), destroy: vi.fn() }, lastCursor: null,
      makeRenderer: () => swapped, relayout: vi.fn(), presentation: 'dungeon',
    })
    h.touch('pointerdown', 300, 300, 0)
    for (let t = 8; t <= 40; t += 8) h.touch('pointermove', 300, 300 + 4 * t, t)
    h.screen.setPresentation('flat-map')
    expect(h.screen.drag).toBe(null)
    expect(h.onPointer).not.toHaveBeenCalled()
  })
})
