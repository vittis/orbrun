// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cellKey, emptyScene, type Billboard } from '@orbrun/scene'
import { initialState, MouseMode } from '@orbrun/webtiles'
import { Render25d, fittedScale } from '@orbrun/render-2.5d'
import { TileCache } from '../../../packages/render-2.5d/src/tiles'
import { GameScreen } from '../src/game'
import { FpsCounter } from '../src/fps'
import { NearDeath } from '../src/near-death'
import type { Session } from '../src/session'

// These tests drive GameScreen.loop directly; scheduler ordering is tested in frames.test.ts.
vi.mock('../src/frames', () => ({
  requestRenderFrame: (fn: FrameRequestCallback) => requestAnimationFrame(fn),
  cancelFrame: (id: number) => cancelAnimationFrame(id),
}))

/** Real frame/camera/motion wiring, without a socket or WebGL drawing. */
function harness() {
  const state = initialState()
  state.phase = 'playing'
  state.inputMode = MouseMode.COMMAND
  const scene = emptyScene()
  scene.revision = 1
  const monster: Billboard = { kind: 'monster', x: 3, y: -1, tile: 0, attitude: 'hostile', ref: { id: 1 } }
  scene.billboards = [monster]
  scene.cells.set(cellKey(3, -1), {
    x: 3, y: -1, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 0,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false },
  })
  const renderer = new Render25d()
  renderer.setScene(scene, 1)
  const session = { state, scene, sceneChangedAt: 1050, flushScene: vi.fn(() => false) }
  const screen = Object.assign(Object.create(GameScreen.prototype), {
    session, renderer, nearDeath: new NearDeath(state), lastFrame: 1000, hooks: {},
    awake: () => false, wake: vi.fn(), idleTick: vi.fn(), sceneTime: undefined, fps: new FpsCounter(),
  }) as {
    loop(now: number): void
    advancePresentation(now: number): void
    sceneTime: number | undefined
  }
  return { screen, state, scene, session, renderer, monster }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('game presentation', () => {
  it.each([60, 120])('delivers the 2.5D centre with the received scene and keeps the player steady at %i Hz', hz => {
    vi.useFakeTimers()
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(7)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const h = harness()
    h.renderer.destroy()
    const renderer = new Render25d(), gradient = { addColorStop: vi.fn() }
    const ctx = new Proxy({ createRadialGradient: () => gradient, createLinearGradient: () => gradient } as Record<string, unknown>, {
      get(target, key: string) { return target[key] ??= vi.fn() },
    })
    renderer.mount({ getContext: () => ctx } as unknown as HTMLCanvasElement)
    renderer.resize(900, 700, 1)
    const draw = vi.spyOn(TileCache.prototype, 'draw')
    h.scene.playerOnLevel = true
    h.scene.billboards = [{ kind: 'player', x: 0, y: 0, tile: 2, height: 1, life: { motion: 'still' } }]
    for (let x = -1; x <= 2; x++) h.scene.cells.set(cellKey(x, 0), { ...h.scene.cells.get(cellKey(3, -1))!, x, y: 0 })
    h.state.player.place = 'Dungeon'; h.state.player.depth = 1
    h.state.map.viewCenter = { x: 0, y: 0 }
    const screen = Object.assign(h.screen, {
      renderer, hops: [{ dx: 1, dy: 0 }], jumped: false, lastLevel: 'Dungeon:1', lastPos: { x: 0, y: 0 },
      lastMonsters: new Set(), forgetTabs: vi.fn(), runner: { stepForMove: () => null, lastWaitAt: -Infinity },
    }) as typeof h.screen & { onScene(): void; syncRendererScene(scene: typeof h.scene, now?: number): void }
    screen.syncRendererScene(h.scene, 1)
    const arrival = 1000 + 250 / hz, frame = 1000 + 1000 / hz
    h.session.sceneChangedAt = arrival
    h.session.flushScene.mockImplementationOnce(() => {
      h.scene.player = { x: 1, y: 0 }
      h.scene.billboards[0].x = 1
      h.scene.revision++
      h.state.map.viewCenter = { x: 1, y: 0 }
      screen.onScene() // actual receipt-time path, before advancePresentation and drawing
      return true
    })
    screen.loop(frame)
    renderer.render(frame / 1000)
    const size = fittedScale(900, 700, 50 * Math.PI / 180)
    const cameraX = (450 - renderer.project(0, 0).x) / size
    expect(cameraX).toBeGreaterThan(0)
    expect(cameraX).toBeLessThan(1)
    const playerSample = draw.mock.calls.at(-1)![9]!
    expect(playerSample.x + size * 1.5).toBeCloseTo(450, 10)
    // A later presentation pass and unrelated revised scene must not restart either mover.
    h.scene.revision++
    screen.advancePresentation(frame / 1000 + 0.01)
    renderer.render(frame / 1000 + 0.01)
    expect(draw.mock.calls.at(-1)![9]!.x + size * 1.5).toBeCloseTo(450, 10)
    expect((450 - renderer.project(0, 0).x) / size).toBeGreaterThan(cameraX)
    renderer.destroy()
  })

  it.each([0, 9999])('clamps a stale or future update timestamp (%i) to this frame interval', (arrival) => {
    vi.useFakeTimers()
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(7)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const h = harness()
    h.session.sceneChangedAt = arrival
    h.session.flushScene.mockImplementationOnce(() => {
      expect(h.screen.sceneTime).toBe(arrival === 0 ? 1 : 1.05)
      return false
    })
    h.screen.loop(1050)
    h.renderer.destroy()
  })
})
