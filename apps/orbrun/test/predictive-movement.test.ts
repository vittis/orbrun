import { afterEach, describe, expect, it, vi } from 'vitest'
import { cellKey, emptyScene } from '@orbrun/scene'
import { initialState, MouseMode, type ClientMessage, type ServerMessage } from '@orbrun/webtiles'
import { CameraController } from '../src/camera'
import { GameScreen } from '../src/game'
import { Runner, type RunnerHooks } from '../src/runner'
import { PredictiveMovement, PREDICTION_TIMEOUT_MS } from '../src/predictive-movement'
import type { Session } from '../src/session'

afterEach(() => vi.restoreAllMocks())

/** Actual runner sends, presentation reconciliation and camera; the network clock is controlled. */
function harness() {
  let now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const state = initialState()
  state.inputMode = MouseMode.COMMAND
  state.player.pos = { x: 0, y: 0 }
  const scene = emptyScene()
  scene.playerOnLevel = true
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) scene.cells.set(cellKey(x, y), {
    x, y, kind: 'floor', visibility: 'visible', occluder: false, floorTile: null,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false },
  })
  scene.billboards.push({ x: 0, y: 0, kind: 'player', tile: null, height: 1 })
  const session = { watching: false, closed: false, conn: { open: true }, server: { offline: false }, state, scene } as unknown as Session
  const cam = new CameraController()
  let enabled = true
  const prediction = new PredictiveMovement(session, cam, () => enabled)
  const runner = new Runner(session, cam, { context: () => ({ mode: state.inputMode === MouseMode.COMMAND ? 'command' : 'prompt' }), now: () => now, swing: vi.fn() } as unknown as RunnerHooks)
  const send = vi.fn((msg: ClientMessage) => prediction.sent(msg, runner.sendingStep, now))
  session.send = send
  const screen = Object.assign(Object.create(GameScreen.prototype), {
    session, cam, runner, prediction, wake: vi.fn(), lastPos: { x: 0, y: 0 }, hopPos: { x: 0, y: 0 },
    hops: [], jumped: false, lastLevel: `${state.player.place}:${state.player.depth}`,
    lastMonsters: new Set(), padStep: null, arrivalPending: false,
    actionTabUp: 'spells', packPage: null, packRow: new Map(),
  }) as { trackHop(): void; onScene(): void }
  const message = (msg: ServerMessage) => {
    if (msg.msg === 'input_mode') state.inputMode = msg.mode as number
    prediction.state(msg, now)
  }
  const position = (x: number, y: number) => {
    state.player.pos = { x, y }
    scene.player = { x, y }
    screen.trackHop()
  }
  const flush = () => { screen.onScene(); prediction.update(now) }
  const frame = (ms: number) => {
    now = 1000 + ms
    prediction.update(now)
    cam.update(1 / 120, now / 1000)
  }
  const reply = (ms: number, x: number, y: number) => {
    now = 1000 + ms
    // Real WebTiles batches can put command-ready before the player delta.
    message({ msg: 'input_mode', mode: MouseMode.COMMAND })
    position(x, y)
    flush()
  }
  return { cam, runner, state, scene, session, prediction, send, frame, reply, message, position, flush,
    enable: (value: boolean) => { enabled = value },
    cell: (x = 0, y = -1) => scene.cells.get(cellKey(x, y))!,
  }
}

describe('predictive movement', () => {
  it.each([30, 75, 150, 250, 350])('starts immediately and never restarts for a %i ms matching reply', (delay) => {
    const h = harness()
    h.runner.step(0)
    h.frame(8)
    expect(h.cam.camera.eyeY).toBeLessThan(0)
    expect(h.cam.camera.y).toBe(0)
    expect(h.state.player.pos).toEqual({ x: 0, y: 0 })
    expect(h.scene.player).toEqual({ x: 0, y: 0 })
    let previous = -h.cam.camera.eyeY
    for (let ms = 10; ms < delay; ms += 5) {
      h.frame(ms)
      const progress = -h.cam.camera.eyeY
      if (ms <= 100) expect(progress).toBeGreaterThan(previous)
      else expect(progress).toBe(1)
      previous = progress
    }
    h.reply(delay, 0, -1)
    expect(-h.cam.camera.eyeY).toBeGreaterThanOrEqual(previous)
    expect(h.cam.camera.y).toBe(-1)
    h.frame(Math.max(100, delay))
    expect(h.cam.camera.eyeY).toBe(-1)
    h.frame(delay + 150)
    expect(h.cam.camera.eyeY).toBe(-1)
    expect(h.send).toHaveBeenCalledExactlyOnceWith({ msg: 'input', text: 'k' })
  })

  it('matching confirmation preserves exactly the same curve and deadline', () => {
    const h = harness()
    const baseline = new CameraController()
    baseline.walkTo(0, -1, [{ dx: 0, dy: -1 }], 1)
    h.runner.step(0)
    for (let ms = 5; ms <= 120; ms += 5) {
      if (ms === 40) h.reply(ms, 0, -1)
      h.frame(ms)
      baseline.update(0.005, 1 + ms / 1000)
      expect(h.cam.camera.eyeY).toBeCloseTo(baseline.camera.eyeY, 12)
    }
  })

  it('eases a refusal back without a jump, state mutation, or a replayed command', () => {
    const h = harness()
    h.runner.step(0)
    h.frame(150)
    h.message({ msg: 'input_mode', mode: MouseMode.COMMAND })
    h.frame(150) // no player/map update, hence no scene event
    expect(h.cam.camera.eyeY).toBe(-1)
    let previous = -1
    for (let ms = 160; ms <= 250; ms += 10) {
      h.frame(ms)
      expect(h.cam.camera.eyeY).toBeGreaterThan(previous)
      expect(h.cam.camera.eyeY).toBeLessThanOrEqual(0)
      previous = h.cam.camera.eyeY
    }
    expect(h.cam.camera.y).toBe(0)
    expect(h.send).toHaveBeenCalledTimes(1)
  })

  it('ignores unrelated traffic and scene refreshes while waiting', () => {
    const h = harness()
    h.runner.step(0)
    h.frame(120)
    for (const msg of [{ msg: 'ping' }, { msg: 'chat' }, { msg: 'player', hp: 10 }]) h.message(msg)
    h.flush()
    h.frame(300)
    expect(h.cam.camera.eyeY).toBe(-1)
    expect(h.cam.camera.y).toBe(0)
    h.reply(350, 0, -1)
    expect(h.cam.camera.eyeY).toBe(-1)
  })

  it('predicts only one step with repeated and differently directed commands in flight', () => {
    const h = harness()
    h.runner.step(0)
    h.frame(120)
    h.runner.step(2, { turns: false })
    h.frame(160)
    expect(h.cam.camera.eyeX).toBe(0)
    expect(h.cam.camera.eyeY).toBe(-1)
    h.reply(180, 0, -1)
    h.runner.step(0) // second reply still outstanding: cannot predict a third
    h.frame(190)
    expect(h.cam.camera.eyeY).toBe(-1)
    h.reply(220, 1, -1)
    h.reply(260, 1, -2)
    h.frame(500)
    expect(h.cam.camera.eyeX).toBe(1)
    expect(h.cam.camera.eyeY).toBe(-2)
    expect(h.send.mock.calls.map(([m]) => m.text)).toEqual(['k', 'l', 'k'])
  })

  it('can predict again once the previous step is confirmed and landed', () => {
    const h = harness()
    h.runner.step(0)
    h.reply(150, 0, -1)
    h.runner.step(0)
    h.frame(160)
    expect(h.cam.camera.eyeY).toBeLessThan(-1)
    expect(h.cam.camera.y).toBe(-1)
    h.reply(300, 0, -2)
    expect(h.cam.camera.eyeY).toBe(-2)
    expect(h.send).toHaveBeenCalledTimes(2)
  })

  it('keeps the first predicted step during a server processing notification', () => {
    const h = harness()
    h.runner.step(0)
    h.frame(40)
    h.message({ msg: 'input_mode', mode: MouseMode.NORMAL })
    h.flush()
    h.frame(120)
    expect(h.cam.camera.eyeY).toBe(-1)
    h.reply(200, 0, -1)
    expect(h.cam.camera.eyeY).toBe(-1)
  })

  it('keeps a newer local turn on confirmation and correction', () => {
    const h = harness()
    h.runner.step(0)
    h.runner.step(2, { turns: true })
    h.reply(150, 0, -1)
    expect(h.cam.facing).toBe(1)
    h.runner.step(0)
    h.frame(300)
    h.message({ msg: 'input_mode', mode: MouseMode.COMMAND })
    h.frame(450)
    expect(h.cam.facing).toBe(1)
  })

  it('corrects through the original tile on a different server destination', () => {
    const h = harness()
    h.runner.step(0)
    h.frame(150)
    h.reply(150, 1, 0)
    h.frame(170)
    expect(h.cam.camera.eyeX).toBe(0) // no diagonal cut across the corner
    expect(h.cam.camera.eyeY).toBeGreaterThan(-1)
    h.frame(400)
    expect(h.cam.camera.eyeX).toBe(1)
    expect(h.cam.camera.eyeY).toBe(0)
  })

  it('handles several confirmed hops in one scene without inventing another step', () => {
    const h = harness()
    h.runner.step(0)
    h.runner.step(0)
    h.frame(150)
    h.position(0, -1)
    h.position(0, -2)
    h.flush()
    h.frame(400)
    expect(h.cam.camera.eyeY).toBe(-2)
    expect(h.send).toHaveBeenCalledTimes(2)
  })

  it.each(['level', 'multi-cell'] as const)('discards prediction on %s changes', (kind) => {
    const h = harness()
    h.runner.step(0)
    h.frame(50)
    if (kind === 'level') h.state.player.depth++
    const x = kind === 'level' ? 0 : 20
    h.reply(60, x, -1)
    if (kind === 'level') {
      expect(h.cam.camera.eyeX).toBe(x)
      expect(h.cam.camera.eyeY).toBe(-1)
    } else {
      expect(h.cam.camera.eyeX).toBe(0)
      expect(h.cam.camera.eyeY).toBeGreaterThan(-1)
      expect(h.cam.camera.eyeY).toBeLessThan(0)
      h.frame(80)
      expect(h.cam.camera.eyeX).toBeGreaterThan(0)
      expect(h.cam.camera.eyeX).toBeLessThan(x)
    }
    h.frame(300)
    expect(h.cam.camera.eyeX).toBe(x)
    expect(h.cam.camera.eyeY).toBe(-1)
  })

  it.each(['disabled', 'closed', 'prompt', 'timeout', 'other-command'] as const)('returns to confirmed position after %s', (reason) => {
    const h = harness()
    h.runner.step(0)
    h.frame(150)
    if (reason === 'disabled') h.enable(false)
    if (reason === 'closed') h.session.closed = true
    if (reason === 'prompt') h.message({ msg: 'input_mode', mode: MouseMode.MORE })
    if (reason === 'other-command') h.runner.send({ msg: 'input', text: '.' })
    const start = reason === 'timeout' ? PREDICTION_TIMEOUT_MS : 150
    h.frame(start)
    h.frame(start + 100)
    expect(h.cam.camera.eyeY).toBe(0)
    expect(h.state.player.pos).toEqual({ x: 0, y: 0 })
    expect(h.send).toHaveBeenCalledTimes(reason === 'other-command' ? 2 : 1)
  })

  it('a timeout does not permit another prediction against the still-unconfirmed position', () => {
    const h = harness()
    h.runner.step(0)
    h.frame(PREDICTION_TIMEOUT_MS)
    h.frame(PREDICTION_TIMEOUT_MS + 100)
    h.runner.step(0)
    h.frame(PREDICTION_TIMEOUT_MS + 120)
    expect(h.cam.camera.eyeY).toBe(0)
    expect(h.send).toHaveBeenCalledTimes(2)
    h.reply(PREDICTION_TIMEOUT_MS + 150, 0, -1)
    h.frame(PREDICTION_TIMEOUT_MS + 300)
    expect(h.cam.camera.eyeY).toBe(-1)
  })

  it.each([
    ['disabled', (h: ReturnType<typeof harness>) => h.enable(false)],
    ['offline', (h) => { h.session.server.offline = true }],
    ['reduced motion', (h) => { h.cam.reducedMotion = true }],
    ['remembered floor', (h) => { h.cell().visibility = 'remembered' }],
    ['unknown floor', (h) => { h.scene.cells.delete(cellKey(0, -1)) }],
    ['door', (h) => { h.cell().kind = 'door' }],
    ['trap', (h) => { h.cell().feature = { type: 'trap' } }],
    ['water', (h) => { h.cell().flags.water = true }],
    ['lava', (h) => { h.cell().flags.lava = true }],
    ['exclusion', (h) => { h.cell().flags.excluded = true }],
    ['occluder', (h) => { h.cell().occluder = true }],
    ['active status', (h) => { h.state.player.status = [{ text: 'Confused' }] }],
    ['monster in view', (h) => { h.scene.billboards.push({ x: 2, y: 2, kind: 'monster', tile: null, height: 1 }) }],
    ['cloud', (h) => { h.scene.billboards.push({ x: 0, y: -1, kind: 'cloud', tile: null, height: 1 }) }],
    ['item', (h) => { h.scene.billboards.push({ x: 0, y: -1, kind: 'item', tile: null, height: 1 }) }],
    ['stale scene', (h) => { h.state.player.pos = { x: 0, y: -1 } }],
  ] satisfies [string, (h: ReturnType<typeof harness>) => void][])('does not predict %s, but still sends the command', (_, configure) => {
    const h = harness()
    configure(h)
    h.runner.step(0)
    h.frame(50)
    expect(h.cam.camera.eyeY).toBe(0)
    expect(h.send).toHaveBeenCalledTimes(1)
  })

  it('does not predict across an occluding diagonal corner', () => {
    const h = harness()
    h.cell(1, 0).kind = 'wall'
    h.runner.step(1)
    h.frame(50)
    expect(h.cam.camera.eyeY).toBe(0)
    expect(h.send).toHaveBeenCalledExactlyOnceWith({ msg: 'input', text: 'u' })
  })

  it('menu navigation does not leave phantom movement commands outstanding', () => {
    const h = harness()
    h.runner.send({ msg: 'input', text: 'i' })
    h.message({ msg: 'input_mode', mode: MouseMode.PROMPT })
    h.runner.send({ msg: 'input', text: 'a' })
    h.runner.send({ msg: 'key', keycode: 27 })
    h.message({ msg: 'input_mode', mode: MouseMode.COMMAND })
    h.runner.step(0)
    h.frame(20)
    expect(h.cam.camera.eyeY).toBeLessThan(0)
    expect(h.send).toHaveBeenCalledTimes(4)
  })

  it('does not start prediction while a previous non-movement command is unanswered', () => {
    const h = harness()
    h.runner.send({ msg: 'input', text: '.' })
    h.runner.step(0)
    h.frame(50)
    expect(h.cam.camera.eyeY).toBe(0)
    expect(h.send).toHaveBeenCalledTimes(2)
  })

  it.each([{ run: true }, { attack: true }])('leaves modified steps authoritative (%j)', (opts) => {
    const h = harness()
    h.runner.step(0, opts)
    h.frame(50)
    expect(h.cam.camera.eyeY).toBe(0)
    expect(h.send).toHaveBeenCalledTimes(1)
  })

  it('does not predict for spectators or targeting', () => {
    const h = harness()
    Object.assign(h.session, { watching: true })
    h.runner.step(0)
    expect(h.send).not.toHaveBeenCalled()
    Object.assign(h.session, { watching: false })
    h.state.inputMode = MouseMode.PROMPT
    h.runner.step(0)
    h.frame(50)
    expect(h.cam.camera.eyeY).toBe(0)
    expect(h.send).toHaveBeenCalledTimes(1)
  })
})
