// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { emptyScene, type Dir8 } from '@orbrun/scene'
import { Render25d } from '@orbrun/render-2.5d'
import { Render2d } from '@orbrun/render-2d'
import { initialState } from '@orbrun/webtiles'
import { GameScreen } from '../src/game'
import { Runner, type RunnerHooks } from '../src/runner'
import { CameraController } from '../src/camera'
import { defaultSettings } from '../src/servers'
import type { Session } from '../src/session'

describe('compass controls in overhead views', () => {
  it.each(['command', 'targeting', 'prompt', 'levelmap'] as const)('uses compass directions in %s even after the first-person camera has turned', mode => {
    const sent: { text: string }[] = []
    const cam = new CameraController()
    cam.setFacing(3)
    const turn = vi.spyOn(cam, 'turn')
    const scene = emptyScene()
    const session = { scene, state: initialState(), watching: false, send: (m: { text: string }) => sent.push(m) } as unknown as Session
    const hooks = { context: () => ({ mode }), northUp: () => true, now: () => 1000, swing: vi.fn() } as unknown as RunnerHooks
    const runner = new Runner(session, cam, hooks)
    for (let d = 0; d < 8; d++) runner.step(d as Dir8, { turns: true })
    expect(sent.map(m => m.text)).toEqual(['k', 'u', 'l', 'n', 'j', 'b', 'h', 'y'])
    expect(turn).not.toHaveBeenCalled()
  })
})

describe('effective dungeon animation', () => {
  it.each([
    ['auto', false, true], ['auto', true, false],
    [true, false, true], [true, true, true],
    [false, false, false], [false, true, false],
  ] as const)('honours %s with device reduced motion %s', (depthAnimate, reducedMotion, expected) => {
    const screen = Object.assign(Object.create(GameScreen.prototype), { cam: { reducedMotion } })
    expect(screen.render25dOptions({ ...defaultSettings, depthAnimate }).animate).toBe(expected)
  })
})

describe('the 2.5D level map', () => {
  it('borrows flat tiles and restores the selected dungeon view on close', () => {
    const screen = Object.assign(Object.create(GameScreen.prototype), {
      renderer: new Render25d(), is3d: false, renderMode: '2.5d', mapBorrowed2d: false,
      mapShown: true, lastMapView: false,
      settings: () => ({ ...defaultSettings, renderer: '2.5d' }),
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
  })

  it('keeps the map flat if the preferred projection changes while it is open', () => {
    const screen = Object.assign(Object.create(GameScreen.prototype), {
      renderer: new Render2d(), is3d: false, renderMode: '2d', mapShown: true,
      mapBorrowed2d: true, settingsCache: null, exploreDelay: null,
      settings: () => ({ ...defaultSettings, renderer: '2.5d' }),
      cam: { setRestPitch: vi.fn() }, grid: { setTextSize: vi.fn() }, textPx: () => 16,
      shrinkText: vi.fn(), park: { clear: vi.fn() },
      hud: { setMinimapTiles: vi.fn() }, relayout: vi.fn(), toggleRenderer: vi.fn(), wake: vi.fn(),
    })
    screen.applySettings()
    expect(screen.toggleRenderer).not.toHaveBeenCalled()
    expect(screen.mapBorrowed2d).toBe(true)
  })
})
