import { describe, it, expect, vi } from 'vitest'
import { dirFromDelta, emptyScene, type Scene } from '@orbrun/scene'
import { MouseMode } from '@orbrun/webtiles'
import { LOOK_WINDOW_MS, Runner, type RunnerHooks } from '../src/runner'
import type { Session, SessionEvent } from '../src/session'
import type { Context } from '../src/context'

/**
 * R3: examine, and LT: fire. Both send their key and nothing besides: no
 * `target_cursor` of the runner's places the cursor, so an aim opens on the
 * cell crawl chose (the player for a look, directn.cc
 * `_look_around_target`; a default target for `f` or a spell where there is
 * one). What these cover is what the pad adds on top: `x` does not turn the
 * view, the look is paired with the targeting that follows it so A
 * describes instead of travelling, the fire holds the heading until the
 * cursor is first stepped, and the d-pad walks that cursor round the player
 * against the grid in view.
 */
function harness(facing = 0, ahead: Context['ahead'] = { kind: 'monster', monster: {} as never, hostile: true, label: 'goblin' }) {
  const sent: { msg: string; text?: string }[] = []
  const listeners: ((e: SessionEvent) => void)[] = []
  const state = { inputMode: MouseMode.COMMAND, messages: { more: false }, menus: [], ui: [], textInput: null, cursors: [] as ({ x: number; y: number } | null)[] }
  const scene = emptyScene()
  scene.player = { x: 10, y: 10 }
  scene.playerOnLevel = true
  const session = {
    watching: false,
    scene,
    state,
    send: (m: { msg: string; text?: string }) => sent.push(m),
    on: (fn: (e: SessionEvent) => void) => (listeners.push(fn), () => listeners.splice(listeners.indexOf(fn), 1)),
  } as unknown as Session
  const ctx = { mode: 'command', under: { kind: 'none' }, ahead, hostilesInView: 0 } as unknown as Context
  let now = 1000
  const hooks = { context: () => ctx, now: () => now, status: () => {}, confirmDangerous: () => false } as unknown as RunnerHooks
  const r = new Runner(session, hooks)
  const emit = (e: SessionEvent) => listeners.slice().forEach((fn) => fn(e))
  // the server opens a mode: its cursor (id 0) lands on the player unless placed elsewhere; then a frame runs
  const mode = (m: number, cursor: { x: number; y: number } | null = m === MouseMode.COMMAND ? null : { x: 10, y: 10 }) => {
    state.inputMode = m
    state.cursors = cursor ? [cursor] : []
    ctx.mode = m === MouseMode.COMMAND ? 'command' : 'targeting'
    emit({ type: 'state', msg: { msg: 'input_mode', mode: m } })
    frame()
  }
  const frame = () => {
    ctx.examining = r.examining(ctx.mode)
  }
  // what went out: a key's text, or `@x,y` for a target_cursor
  const keys = () => sent.map((m) => (m.msg === 'target_cursor' ? `@${(m as { x: number }).x},${(m as { y: number }).y}` : m.text))
  // the server's cursor, with the runner's own walk settled: a cell put
  // there by anything but a walk of ours (the mouse, the aim opening) with
  // no step of ours still in flight
  const cursor = (c: { x: number; y: number }) => {
    state.cursors = [c]
    now += 1001
  }
  return { r, sent, ctx, mode, frame, state, keys, cursor, tick: (ms: number) => (now += ms) }
}

/** the step each movement key takes, x east and y south */
const DIRS = { k: [0, -1], u: [1, -1], l: [1, 0], n: [1, 1], j: [0, 1], b: [-1, 1], h: [-1, 0], y: [-1, -1] } as const

describe('LB opens look mode without touching the cursor', () => {
  it('sends x alone: the cursor crawl opens on the player is left there', () => {
    // facing north-east: nothing about the facing reaches the cursor
    const h = harness(1)
    h.r.examine()
    expect(h.keys()).toEqual(['x'])
    // the view did not turn as x went out
    // the server opened the look with its cursor on the player: it stays there
    h.mode(MouseMode.TARGET)
    expect(h.keys()).toEqual(['x'])
  })

  it('never sends a direction key or a target message of its own, whatever stands ahead', () => {
    for (const ahead of [
      { kind: 'none', label: 'floor' },
      { kind: 'unknown', label: 'unexplored' },
      { kind: 'item', label: 'a dagger' },
      { kind: 'door-closed', label: 'closed door' },
    ] as Context['ahead'][]) {
      const h = harness(4, ahead)
      h.r.examine()
      h.frame()
      h.mode(MouseMode.TARGET)
      h.frame()
      expect(h.keys()).toEqual(['x'])
    }
  })

  it('in look mode A describes the cell under the cursor with v', () => {
    const h = harness(0)
    h.r.examine()
    h.mode(MouseMode.TARGET)
    expect(h.r.examining('targeting')).toBe(true)
    h.ctx.examining = true
    h.r.examine()
    expect(h.keys()).toEqual(['x', 'v'])
  })
})

describe('LT fires', () => {
  it('sends f to open the aim and f again to confirm it, whichever side of the round trip the tap lands', () => {
    const h = harness(0)
    h.ctx.hostilesInView = 1
    h.r.fire()
    // the second tap arrives before the server has reported the aim: still f, which confirms the shot
    h.r.fire()
    // the aim opened on its default target, a monster: the cursor is left on it
    h.mode(MouseMode.TARGET_PATH, { x: 13, y: 8 })
    h.r.fire()
    expect(h.keys()).toEqual(['f', 'f', 'f'])
    expect(h.r.examining('targeting')).toBe(false)
  })

  it('with nothing for crawl to pick, f still goes out alone: the aim opens on the player and stays there', () => {
    const h = harness(3)
    h.ctx.readiedAction = 'a stone'
    h.r.fire()
    expect(h.keys()).toEqual(['f'])
    // the view did not turn as f went out
    h.mode(MouseMode.TARGET_PATH)
    expect(h.keys()).toEqual(['f'])
  })

  it('with a hostile in view, or nothing quivered, f goes out alone too', () => {
    const h = harness(3)
    h.ctx.readiedAction = 'a stone'
    h.ctx.hostilesInView = 2
    h.r.fire()
    expect(h.keys()).toEqual(['f'])
    // the hostile was out of range: crawl opened on the player, and it stays
    h.mode(MouseMode.TARGET_PATH)
    expect(h.keys()).toEqual(['f'])
    const e = harness(3)
    e.r.fire()
    expect(e.keys()).toEqual(['f'])
  })

  it('a typed z (a spell), or any key, opens its aim untouched; the compass prompt is left alone too', () => {
    const h = harness(2)
    h.r.send({ msg: 'input', text: 'z' })
    h.r.send({ msg: 'input', text: 'a' })
    expect(h.keys()).toEqual(['z', 'a'])
    h.mode(MouseMode.TARGET)
    expect(h.keys()).toEqual(['z', 'a'])
    const d = harness(2)
    d.r.send({ msg: 'input', text: 'C' })
    d.mode(MouseMode.TARGET_DIR, null)
    expect(d.keys()).toEqual(['C'])
  })

  it('does nothing in look mode: the look is not an aim', () => {
    const h = harness(0, { kind: 'none', label: 'floor' })
    h.r.examine()
    h.mode(MouseMode.TARGET)
    h.r.fire()
    expect(h.keys()).toEqual(['x'])
  })
})

describe('the runner pairs its x with the targeting that follows', () => {
  it('is look mode from the targeting after x until that targeting ends', () => {
    const h = harness(0)
    expect(h.r.examining('command')).toBe(false)
    h.r.examine()
    expect(h.r.examining('command')).toBe(false)
    expect(h.r.examining('targeting')).toBe(true)
    expect(h.r.examining('targeting')).toBe(true)
    expect(h.r.examining('command')).toBe(false)
    // the next targeting is an aim, not a look
    expect(h.r.examining('targeting')).toBe(false)
  })

  it('survives a --more-- and the description popup: A must not turn into travel when the look resumes', () => {
    const h = harness(0)
    h.r.examine()
    expect(h.r.examining('targeting')).toBe(true)
    expect(h.r.examining('more')).toBe(false)
    expect(h.r.examining('targeting')).toBe(true)
    expect(h.r.examining('popup')).toBe(false)
    expect(h.r.examining('targeting')).toBe(true)
    // crawl ends the look after a description (directn.cc describe_target: force_cancel)
    expect(h.r.examining('command')).toBe(false)
    expect(h.r.examining('targeting')).toBe(false)
  })

  it('a typed x counts too: the keyboard gets the same look mode', () => {
    const h = harness(3)
    h.r.send({ msg: 'input', text: 'x' })
    expect(h.r.examining('targeting')).toBe(true)
  })

  it('forgets an x nothing followed within the window', () => {
    const h = harness(0)
    h.r.examine()
    h.tick(LOOK_WINDOW_MS + 1)
    expect(h.r.examining('command')).toBe(false)
    expect(h.r.examining('targeting')).toBe(false)
  })

  it('an x sent outside command mode (cancel in targeting) is not a look', () => {
    const h = harness(0)
    h.ctx.mode = 'targeting'
    h.r.send({ msg: 'input', text: 'x' })
    expect(h.r.examining('targeting')).toBe(false)
  })
})
