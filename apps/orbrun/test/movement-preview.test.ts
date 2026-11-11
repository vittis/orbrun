// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cellKey, emptyScene, type Dir8, type SceneCell } from '@orbrun/scene'
import { initialState, MouseMode } from '@orbrun/webtiles'
import { CameraController } from '../src/camera'
import { canPreviewStep } from '../src/movement-preview'
import { GameScreen } from '../src/game'
import { Runner, type RunnerHooks } from '../src/runner'
import type { Session } from '../src/session'
import type { Context } from '../src/context'

afterEach(() => vi.restoreAllMocks())

function floor() {
  const scene = emptyScene()
  scene.playerOnLevel = true
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) {
    scene.cells.set(cellKey(x, y), {
      x, y, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 1,
      flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false },
    })
  }
  return scene
}

describe('movement preview eligibility', () => {
  it('allows visible empty floor in every direction', () => {
    for (let d = 0; d < 8; d++) expect(canPreviewStep(floor(), d as Dir8)).toBe(true)
  })

  it.each<Partial<SceneCell>>([
    { visibility: 'remembered' }, { visibility: 'unseen' }, { kind: 'unknown' },
    { kind: 'door' }, { occluder: true }, { feature: { type: 'trap' } },
    { feature: { type: 'door', state: 'open' } }, { featureTile: 4 }, { cloud: 4 },
  ])('rejects uncertain or special ground: %j', (patch) => {
    const scene = floor()
    Object.assign(scene.cells.get(cellKey(0, -1))!, patch)
    expect(canPreviewStep(scene, 0)).toBe(false)
  })

  it.each(['water', 'lava', 'excluded', 'excludeRoot'] as const)('rejects %s', (flag) => {
    const scene = floor()
    scene.cells.get(cellKey(0, -1))!.flags[flag] = true
    expect(canPreviewStep(scene, 0)).toBe(false)
  })

  it('rejects a diagonal past a corner, items underfoot, and any visible monster', () => {
    const scene = floor()
    scene.cells.get(cellKey(1, 0))!.occluder = true
    expect(canPreviewStep(scene, 1)).toBe(false)
    scene.billboards.push({ kind: 'item', x: 0, y: 0, tile: 1 })
    expect(canPreviewStep(scene, 0)).toBe(false)
    scene.billboards = [{ kind: 'monster', x: -1, y: 1, tile: 1, attitude: 'friendly' }]
    expect(canPreviewStep(scene, 0)).toBe(false)
  })
})

describe('bounded camera anticipation', () => {
  it.each([60, 120])('shows motion on the first frame at %i Hz without moving the player', (hz) => {
    const c = new CameraController()
    c.previewStep(2, 1)
    c.update(1 / hz, 1 + 1 / hz)
    expect(c.camera.eyeX).toBeGreaterThan(0)
    expect(c.camera.eyeX).toBeLessThan(0.18)
    expect([c.camera.x, c.camera.y]).toEqual([0, 0])
  })

  it('caps repeated input, expires without a reply, and returns exactly to rest', () => {
    const c = new CameraController()
    c.previewStep(2, 1)
    for (const at of [1.1, 1.2, 1.3, 1.4]) {
      c.previewStep(2, at)
      c.update(0.1, at)
      expect(c.camera.eyeX).toBeGreaterThanOrEqual(0)
      expect(c.camera.eyeX).toBeLessThanOrEqual(0.18)
      expect(c.camera.x).toBe(0)
    }
    c.update(0.1, 1.5)
    expect(c.camera.eyeX).toBe(0)
    expect(c.previewDirection).toBeNull()
    expect(c.update(0.1, 1.6)).toBe(false)
  })

  it('returns smoothly when refused or another direction is pressed', () => {
    const c = new CameraController()
    c.previewStep(2, 1)
    c.update(0.1, 1.1)
    c.previewStep(0, 1.1)
    expect(c.camera.eyeX).toBeCloseTo(0.18)
    c.update(0.04, 1.14)
    expect(c.camera.eyeX).toBeCloseTo(0.09)
    expect(c.camera.eyeY).toBe(0)
    c.update(0.05, 1.19)
    expect(c.camera.eyeX).toBe(0)
    expect(c.previewDirection).toBeNull()
  })

  it('joins a delayed confirmation continuously and lands within 60 ms of the reply', () => {
    const c = new CameraController()
    c.previewStep(2, 1)
    c.update(0.1, 1.1)
    c.walkTo(1, 0, [{ dx: 1, dy: 0 }], 1.15, 1)
    expect(c.camera.eyeX).toBeCloseTo(0.18)
    expect(c.camera.x).toBe(1)
    expect(c.previewDirection).toBeNull()
    c.update(0.03, 1.18)
    expect(c.camera.eyeX).toBeGreaterThan(0.18)
    expect(c.camera.eyeX).toBeLessThan(1)
    c.update(0.03, 1.21)
    expect(c.camera.eyeX).toBe(1)
  })

  it('never cuts diagonally from a mistaken preview into a different confirmed path', () => {
    const c = new CameraController()
    c.previewStep(2, 1)
    c.update(0.1, 1.1)
    c.walkTo(0, -1, [{ dx: 0, dy: -1 }], 1.15, 1)
    for (let t = 1.151; t < 1.22; t += 0.001) {
      c.update(0.001, t)
      expect(c.camera.eyeX === 0 || c.camera.eyeY === 0).toBe(true)
    }
    expect([c.camera.eyeX, c.camera.eyeY]).toEqual([0, -1])
  })

  it('keeps fast replies animated, and does not accelerate unattributed or batched movement', () => {
    const fast = new CameraController()
    fast.walkTo(1, 0, [{ dx: 1, dy: 0 }], 1.01, 1)
    fast.update(0.06, 1.07)
    expect(fast.camera.eyeX).toBeLessThan(1)
    fast.update(0.03, 1.1)
    expect(fast.camera.eyeX).toBe(1)
    const ordinary = new CameraController()
    ordinary.walkTo(1, 0, [{ dx: 1, dy: 0 }], 1.15)
    ordinary.update(0.06, 1.21)
    expect(ordinary.camera.eyeX).toBeLessThan(1)
    const batch = new CameraController()
    batch.walkTo(2, 0, [{ dx: 1, dy: 0 }, { dx: 1, dy: 0 }], 1.15, 1)
    batch.update(0.06, 1.21)
    expect(batch.camera.eyeX).toBeLessThan(2)
  })

  it('clears on teleports, reduced motion and suspension; never previews during a confirmed glide', () => {
    const c = new CameraController()
    c.previewStep(2, 1)
    c.update(0.1, 1.1)
    c.snapTo(20, 30)
    expect(c.previewDirection).toBeNull()
    expect([c.camera.eyeX, c.camera.eyeY]).toEqual([20, 30])
    c.previewStep(2, 2)
    c.reducedMotion = true
    c.update(0.01, 2.01)
    expect(c.previewDirection).toBeNull()
    c.previewStep(2, 3)
    expect(c.previewDirection).toBeNull()
    c.reducedMotion = false
    c.previewStep(2, 4)
    c.update(0.1, 10)
    expect(c.camera.eyeX).toBe(20)
    c.walkTo(21, 30, [{ dx: 1, dy: 0 }], 11)
    c.previewStep(2, 11.01)
    expect(c.previewDirection).toBeNull()
  })
})

/** Real runner, camera and screen preview hooks with no socket/DOM UI construction. */
function screenHarness() {
  const state = initialState()
  state.phase = 'playing'
  state.inputMode = MouseMode.COMMAND
  state.player.pos = { x: 0, y: 0 }
  const scene = floor()
  const cam = new CameraController()
  const sent: unknown[] = []
  const session = { state, scene, server: { offline: false }, watching: false, closed: false, loading: false,
    send: (m: unknown) => { sent.push(m); screen.previewPending = true },
  } as unknown as Session
  const screen = Object.assign(Object.create(GameScreen.prototype), {
    session, cam, is3d: true, overlays: { hasClientOverlay: false }, chat: { capturing: false },
    previewReply: false, previewPending: false, wake: vi.fn(),
  }) as { previewMovement(dir: Dir8 | null): void; reconcilePreview(now: number): void; previewReply: boolean; previewPending: boolean; is3d: boolean }
  const ctx = { mode: 'command' } as Context
  const runner = new Runner(session, cam, {
    context: () => ctx, now: () => performance.now(), swing: vi.fn(),
    beforeSend: (dir) => screen.previewMovement(dir),
  } as unknown as RunnerHooks)
  return { screen, session, cam, runner, ctx, state, sent }
}

describe('online command integration', () => {
  it('previews one command without buffering, duplicating or extending it with repeats', () => {
    const h = screenHarness()
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    h.runner.step(0)
    expect(h.sent).toHaveLength(1)
    h.cam.update(0.1, 1.1)
    expect(h.cam.camera.eyeY).toBeCloseTo(-0.18)
    h.runner.step(0)
    expect(h.sent).toHaveLength(2)
    h.cam.update(0.1, 1.5)
    vi.mocked(performance.now).mockReturnValue(1500)
    h.runner.step(0)
    expect(h.sent).toHaveLength(3)
    expect(h.cam.previewDirection).toBeNull() // no reply: no fresh preview
    expect(h.state.player.pos).toEqual({ x: 0, y: 0 })
  })

  it('reconciles a refusal after scene processing, then allows the next step', () => {
    const h = screenHarness()
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    h.runner.step(0)
    h.cam.update(0.1, 1.1)
    h.screen.previewReply = true
    h.screen.reconcilePreview(1.15)
    h.cam.update(0.09, 1.24)
    expect(h.cam.camera.eyeY).toBe(0)
    vi.mocked(performance.now).mockReturnValue(1250)
    h.runner.step(0)
    expect(h.cam.previewDirection).toBe(0)
  })

  it.each(['prompt', 'monster', 'overlay', 'closed', 'status'] as const)('returns a pending preview when %s arrives', (reason) => {
    const h = screenHarness()
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    h.runner.step(0)
    h.cam.update(0.1, 1.1)
    if (reason === 'prompt') h.state.inputMode = MouseMode.YESNO
    if (reason === 'monster') h.session.scene.billboards.push({ kind: 'monster', x: 1, y: 1, tile: 1 })
    if (reason === 'overlay') (h.screen as any).overlays.hasClientOverlay = true
    if (reason === 'closed') h.session.closed = true
    if (reason === 'status') h.state.player.status.push({ light: 'Conf', text: 'Confused' } as never)
    h.screen.reconcilePreview(1.15)
    h.cam.update(0.09, 1.24)
    expect(h.cam.camera.eyeY).toBe(0)
    expect(h.sent).toHaveLength(1)
  })

  it.each(['attack', 'run', 'offline', '2d', 'spectating', 'prompt'] as const)('does not preview %s', (kind) => {
    const h = screenHarness()
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    if (kind === 'offline') h.session.server.offline = true
    if (kind === '2d') h.screen.is3d = false
    if (kind === 'spectating') h.session.watching = true
    if (kind === 'prompt') { h.ctx.mode = 'prompt'; h.state.inputMode = MouseMode.PROMPT }
    h.runner.step(0, { attack: kind === 'attack', run: kind === 'run' })
    expect(h.cam.previewDirection).toBeNull()
  })
})
