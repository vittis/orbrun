import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyScene } from '@orbrun/scene'
import { initialState, MouseMode } from '@orbrun/webtiles'
import { GameScreen } from '../src/game'
import { Runner, type RunnerHooks } from '../src/runner'
import type { Session } from '../src/session'

afterEach(() => vi.restoreAllMocks())

/** Real input, hop tracking and scene-to-camera routing; no socket, DOM or renderer. */
function harness() {
  const state = initialState()
  state.inputMode = MouseMode.COMMAND
  const scene = emptyScene()
  scene.playerOnLevel = true
  const send = vi.fn()
  const session = { watching: false, server: { offline: false }, state, scene, send } as unknown as Session
  const swing = vi.fn()
  const runner = new Runner(session, {
    context: () => ({ mode: 'command' }), now: () => performance.now(), swing,
  } as unknown as RunnerHooks)
  const screen = Object.assign(Object.create(GameScreen.prototype), {
    session, runner, wake: vi.fn(), lastPos: { x: 0, y: 0 }, hopPos: { x: 0, y: 0 },
    hops: [], jumped: false, lastLevel: `${state.player.place}:${state.player.depth}`,
    lastMonsters: new Set(), padStep: null, arrivalPending: false,
    actionTabUp: 'spells', packPage: null, packRow: new Map(),
  }) as { trackHop(): void; onScene(): void; actionTabUp: string; packPage: string | null; packRow: Map<string, number> }
  const position = (x: number, y: number) => {
    state.player.pos = { x, y }
    scene.player = { ...scene.player, x, y }
    screen.trackHop()
  }
  const echo = (x: number, y: number) => {
    position(x, y)
    screen.onScene()
  }
  return { screen, runner, state, scene, send, swing, position, echo, flush: () => screen.onScene() }
}

describe("X's and Y's tabs", () => {
  it('open where they were left while the player stands still, and on Spells and Gear once they move', () => {
    const h = harness()
    // a scroll of identify read from the Scrolls page, with an Abilities look before it
    h.screen.actionTabUp = 'abilities'
    h.screen.packPage = 'scrolls'
    h.screen.packRow.set('scrolls', 'e'.charCodeAt(0))
    h.flush()
    expect(h.screen.actionTabUp).toBe('abilities')
    expect(h.screen.packPage).toBe('scrolls')
    expect(h.screen.packRow.get('scrolls')).toBe('e'.charCodeAt(0))
    h.echo(1, 0)
    expect(h.screen.actionTabUp).toBe('spells')
    expect(h.screen.packPage).toBe(null)
    expect(h.screen.packRow.size).toBe(0)
    // a level change is a move too, even onto the same cell
    h.screen.packPage = 'potions'
    h.state.player.depth++
    h.echo(1, 0)
    expect(h.screen.packPage).toBe(null)
  })
})
