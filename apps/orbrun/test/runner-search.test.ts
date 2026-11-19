import { afterEach, describe, expect, it, vi } from 'vitest'
import { cm, initialState, MouseMode, UiState, type ClientMessage } from '@orbrun/webtiles'
import { Runner, type RunnerHooks } from '../src/runner'
import type { Session, SessionEvent } from '../src/session'

function harness() {
  const state = initialState()
  state.inputMode = MouseMode.COMMAND
  state.uiState = UiState.VIEW_MAP
  const sent: ClientMessage[] = []
  const listeners = new Set<(e: SessionEvent) => void>()
  const session = { state, watching: false, send: (m: ClientMessage) => sent.push(m),
    on: (fn: (e: SessionEvent) => void) => { listeners.add(fn); return () => listeners.delete(fn) },
  } as unknown as Session
  const runner = new Runner(session, { context: () => ({ mode: 'levelmap' }), status: vi.fn(), keepMap: vi.fn() } as unknown as RunnerHooks)
  const emit = (e: SessionEvent = { type: 'state', msg: { msg: 'input_mode', mode: MouseMode.COMMAND } }) => [...listeners].forEach(fn => fn(e))
  const prompt = () => { state.textInput = { tag: 'stash_search', text: 'old search' }; emit() }
  return { runner, state, session, sent, emit, prompt }
}

const OPEN_SEARCH = [cm.key(27), cm.key(6)]
afterEach(() => vi.useRealTimers())

describe('level-map item search', () => {
  it('waits for the stash field, clears prefill and submits the current-level query exactly once', () => {
    const h = harness()
    h.runner.findItems(true)
    expect(h.sent).toEqual(OPEN_SEARCH)
    h.state.uiState = UiState.NORMAL
    h.state.inputMode = MouseMode.PROMPT
    h.emit()
    expect(h.sent).toEqual(OPEN_SEARCH)
    h.prompt()
    h.prompt()
    expect(h.sent).toEqual([...OPEN_SEARCH, cm.key(21), cm.key(11), cm.textInput('.\r')])
  })

  it('leaves a custom search empty for the player to fill', () => {
    const h = harness()
    h.runner.findItems(false)
    h.prompt()
    expect(h.sent).toEqual(OPEN_SEARCH)
  })

  it.each(['more', 'other prompt', 'closed', 'cancel', 'timeout', 'destroy'] as const)('drops the automatic reply after %s', reason => {
    vi.useFakeTimers()
    const h = harness()
    h.runner.findItems(true)
    if (reason === 'more') { h.state.messages.more = true; h.emit(); h.state.messages.more = false }
    if (reason === 'other prompt') { h.state.textInput = { tag: 'travel_depth' }; h.emit() }
    if (reason === 'closed') h.emit({ type: 'closed', reason: 'disconnected' })
    if (reason === 'cancel') h.runner.send(cm.key(27))
    if (reason === 'timeout') vi.advanceTimersByTime(5000)
    if (reason === 'destroy') h.runner.abortSequence()
    h.prompt()
    expect(h.sent).toEqual(reason === 'cancel' ? [...OPEN_SEARCH, cm.key(27)] : OPEN_SEARCH)
  })

  it('requires a playable level map', () => {
    const h = harness()
    h.session.watching = true
    h.runner.findItems(true)
    h.session.watching = false
    h.state.uiState = UiState.NORMAL
    h.runner.findItems(true)
    expect(h.sent).toEqual([])
  })
})
