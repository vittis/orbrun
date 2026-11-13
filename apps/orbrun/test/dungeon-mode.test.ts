// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { Render25d } from '@orbrun/render-2.5d'
import { Render2d } from '@orbrun/render-2d'
import { GameScreen } from '../src/game'
import { defaultSettings } from '../src/settings'

describe('effective dungeon animation', () => {
  it('passes configured movement properties to the renderer', () => {
    const screen = Object.assign(Object.create(GameScreen.prototype), { reducedMotion: false })
    expect(screen.render25dOptions({ ...defaultSettings, depthMovement: false, depthMovementDuration: 0.18, depthMovementEasing: 'smooth' })).toMatchObject({
      movement: false, movementDuration: 0.18, movementEasing: 'smooth',
    })
  })
  it.each([
    ['auto', false, true], ['auto', true, false],
    [true, false, true], [true, true, true],
    [false, false, false], [false, true, false],
  ] as const)('honours %s with device reduced motion %s', (depthAnimate, reducedMotion, expected) => {
    const screen = Object.assign(Object.create(GameScreen.prototype), { reducedMotion })
    expect(screen.render25dOptions({ ...defaultSettings, depthAnimate }).animate).toBe(expected)
  })
})

describe('the Dungeon presentation lifecycle', () => {
  it('swaps once per transition, transfers the cursor and destroys each outgoing renderer', () => {
    const canvas = document.createElement('canvas')
    canvas.className = 'view'
    const root = document.createElement('div')
    root.append(canvas)
    const renderers = [{ setCursor: vi.fn(), destroy: vi.fn() }]
    const screen = Object.assign(Object.create(GameScreen.prototype), {
      canvas, renderer: renderers[0], presentation: 'dungeon',
      lastCursor: { x: 12, y: 7, mode: 'map' },
      cancelDrag: vi.fn(), attachPointer: vi.fn(), relayout: vi.fn(), wake: vi.fn(),
      makeRenderer: vi.fn(() => {
        const next = { setCursor: vi.fn(), destroy: vi.fn() }
        renderers.push(next)
        return next
      }),
    })
    for (let cycle = 0; cycle < 6; cycle++) {
      screen.setPresentation('flat-map')
      expect(screen.mapShown).toBe(true)
      expect(screen.renderer.setCursor).toHaveBeenCalledExactlyOnceWith(screen.lastCursor)
      screen.setPresentation('flat-map')
      expect(root.querySelectorAll('canvas.view')).toHaveLength(1)
      screen.lastCursor = null
      screen.setPresentation('dungeon')
      expect(screen.mapShown).toBe(false)
      expect(screen.renderer.setCursor).toHaveBeenCalledExactlyOnceWith(null)
      screen.setPresentation('dungeon')
    }
    expect(screen.makeRenderer).toHaveBeenCalledTimes(12)
    for (const old of renderers.slice(0, -1)) expect(old.destroy).toHaveBeenCalledOnce()
    expect(renderers.at(-1)!.destroy).not.toHaveBeenCalled()
    expect(screen.cancelDrag).toHaveBeenCalledTimes(12)
  })

  it('keeps a temporary map and its renderer when dungeon settings change', () => {
    const renderer = new Render2d()
    const screen = Object.assign(Object.create(GameScreen.prototype), {
      renderer, root: document.createElement('div'), presentation: 'flat-map', settingsCache: null, exploreDelay: null,
      settings: () => ({ ...defaultSettings }),
      grid: { setTextSize: vi.fn() }, textPx: () => 16, shrinkText: vi.fn(),
      hud: { setMinimapTiles: vi.fn() }, relayout: vi.fn(), setPresentation: vi.fn(), wake: vi.fn(),
    })
    screen.applySettings()
    expect(screen.setPresentation).not.toHaveBeenCalled()
    expect(screen.renderer).toBe(renderer)
    expect(screen.mapShown).toBe(true)
    expect(screen.relayout).toHaveBeenCalledWith(true)
  })
})
