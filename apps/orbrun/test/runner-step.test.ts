import { describe, expect, it, vi } from 'vitest'
import { emptyScene, type Dir8 } from '@orbrun/scene'
import { initialState } from '@orbrun/webtiles'
import { Runner, type RunnerHooks } from '../src/runner'
import type { Session } from '../src/session'
import type { Mode } from '../src/context'

function harness(mode: Mode = 'command', watching = false) {
  const send = vi.fn()
  const state = initialState(), scene = emptyScene()
  const session = { state, scene, watching, send } as unknown as Session
  const runner = new Runner(session, { context: () => ({ mode }), facing: () => 3, now: () => 1000 } as RunnerHooks)
  return { runner, send, scene }
}

describe('compass movement and targeting', () => {
  it.each(['command', 'targeting', 'prompt', 'levelmap'] as const)('sends all eight compass directions in %s independent of heading', mode => {
    const { runner, send } = harness(mode)
    for (let d = 0; d < 8; d++) runner.step(d as Dir8)
    expect(send.mock.calls.map(([m]) => m)).toEqual(['k', 'u', 'l', 'n', 'j', 'b', 'h', 'y'].map(text => ({ msg: 'input', text })))
  })

  it('preserves run and attack modifiers without local turning', () => {
    const { runner, send } = harness()
    runner.step(2, { run: true })
    runner.step(6, { attack: true })
    expect(send.mock.calls.map(([m]) => m)).toEqual([{ msg: 'input', text: 'L' }, { msg: 'key', keycode: 8 }])
  })

  it('sends repeated input immediately and never predicts player positions', () => {
    const { runner, send, scene } = harness()
    runner.step(2)
    runner.step(2)
    expect(send).toHaveBeenCalledTimes(2)
    expect(scene.player).toEqual({ x: 0, y: 0 })
    expect(runner.lastStep).toEqual({ dir: 2, t: 1000 })
  })

  it('sends no gameplay input while spectating or in a menu', () => {
    for (const h of [harness('command', true), harness('menu')]) {
      h.runner.step(2)
      expect(h.send).not.toHaveBeenCalled()
      expect(h.runner.lastStep).toBeNull()
    }
  })
})

describe('interaction heading', () => {
  it.each(['closed door', 'blocked step', 'attack'] as const)('retains the requested compass direction after a %s without predicting movement', kind => {
    const send = vi.fn(), scene = emptyScene()
    const ctx = { mode: 'command', under: { kind: 'none' }, ahead: { kind: 'door-closed' }, hostilesInView: 0 }
    let facing: Dir8 = 0
    const runner = new Runner({ state: initialState(), scene, watching: false, send } as unknown as Session, {
      context: () => ctx, facing: () => facing, direction: dir => { facing = dir }, now: () => 1000,
    } as RunnerHooks)
    runner.step(2, { attack: kind === 'attack' })
    expect(scene.player).toEqual({ x: 0, y: 0 })
    expect(facing).toBe(2)
    runner.contextual()
    expect(send).toHaveBeenLastCalledWith({ msg: 'input', text: 'l' })
  })

  it('remembers an adjacent left-click direction without changing scene state', () => {
    let facing: Dir8 = 0
    const scene = emptyScene(), send = vi.fn()
    const runner = new Runner({ scene, watching: false, send } as unknown as Session, {
      context: () => ({ mode: 'command' }), direction: dir => { facing = dir }, now: () => 1000,
    } as RunnerHooks)
    runner.clickCell(-1, 0, 1)
    expect(facing).toBe(6)
    expect(scene.player).toEqual({ x: 0, y: 0 })
    expect(send).toHaveBeenCalledExactlyOnceWith({ msg: 'click_cell', x: -1, y: 0, button: 1 })
  })
})
