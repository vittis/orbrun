// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { emptyScene, type Dir8 } from '@orbrun/scene'
import { Render25d } from '@orbrun/render-2.5d'
import { Render2d } from '@orbrun/render-2d'
import { initialState } from '@orbrun/webtiles'
import { GameScreen } from '../src/game'
import { Runner, type RunnerHooks } from '../src/runner'
import { defaultSettings } from '../src/servers'
import type { Session } from '../src/session'

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

describe('the 2.5D level map', () => {
  it('borrows flat tiles and restores the selected dungeon view on close', () => {
    const screen = Object.assign(Object.create(GameScreen.prototype), {
      renderer: new Render25d(), renderMode: '2.5d', mapBorrowed2d: false,
      mapShown: true, lastMapView: false,
      settings: () => ({ ...defaultSettings }),
      hud: { hideMinimap: vi.fn(), showMinimap: vi.fn() },
    })
    screen.toggleRenderer = vi.fn((mode: string) => {
      screen.renderMode = mode
      screen.renderer = mode === '2d' ? new Render2d() : new Render25d()
    })
    screen.syncMapRenderer()
    expect(screen.toggleRenderer).toHaveBeenLastCalledWith('2d')
    expect(screen.mapBorrowed2d).toBe(true)
    screen.mapShown = false
    screen.syncMapRenderer()
    expect(screen.toggleRenderer).toHaveBeenLastCalledWith('2.5d')
    expect(screen.mapBorrowed2d).toBe(false)
    for (let cycle = 0; cycle < 5; cycle++) {
      screen.mapShown = true
      screen.syncMapRenderer()
      screen.syncMapRenderer()
      expect(screen.renderMode).toBe('2d')
      screen.mapShown = false
      screen.syncMapRenderer()
      expect(screen.renderMode).toBe('2.5d')
    }
    expect(screen.toggleRenderer).toHaveBeenCalledTimes(12)
  })

  it('keeps the map flat when dungeon settings change while it is open', () => {
    const screen = Object.assign(Object.create(GameScreen.prototype), {
      renderer: new Render2d(), renderMode: '2d', mapShown: true,
      mapBorrowed2d: true, settingsCache: null, exploreDelay: null,
      settings: () => ({ ...defaultSettings }),
      grid: { setTextSize: vi.fn() }, textPx: () => 16,
      shrinkText: vi.fn(),
      hud: { setMinimapTiles: vi.fn() }, relayout: vi.fn(), toggleRenderer: vi.fn(), wake: vi.fn(),
    })
    screen.applySettings()
    expect(screen.toggleRenderer).not.toHaveBeenCalled()
    expect(screen.mapBorrowed2d).toBe(true)
  })
})
