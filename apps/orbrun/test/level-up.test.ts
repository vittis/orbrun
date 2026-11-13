// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import { LevelUp } from '../src/level-up'

function setup(loaded = true) {
  const state = initialState()
  if (loaded) Object.assign(state.player, { received: true, name: 'Delver', xl: 3, hp: 30 })
  const popup = new LevelUp(state)
  const receive = (msg: ServerMessage, now = 1000) => {
    reduce(state, msg)
    popup.observe(state, msg, now)
  }
  return { state, popup, receive }
}

describe('level-up popup', () => {
  it('only celebrates confirmed XL increases, including partial player updates', () => {
    const { popup, receive } = setup(false)
    receive({ msg: 'player', name: 'Delver', xl: 8, hp: 30 })
    receive({ msg: 'player', hp: 25 })
    receive({ msg: 'msgs', messages: [{ text: 'Welcome to level 9!', turn: 1 }] })
    expect(popup.active).toBe(false)
    receive({ msg: 'player', xl: 9 })
    popup.render(1100, true, false)
    expect(popup.root.hidden).toBe(false)
    expect(popup.root.querySelector('.level-up-number')?.textContent).toBe('9')
    expect(popup.announcement.textContent).toBe('Level up. You are now level 9.')
    expect(popup.root.getAttribute('aria-hidden')).toBe('true')
    expect(popup.announcement.getAttribute('role')).toBe('status')
    // Duplicates and unrelated updates cannot extend the presentation lifetime.
    receive({ msg: 'player', xl: 9, hp: 29 }, 4000)
    popup.render(4400, true, false)
    expect(popup.root.hidden).toBe(true)
    expect(popup.active).toBe(false)
  })

  it('coalesces rapid gains into the latest confirmed level and expires while hidden', () => {
    const { popup, receive } = setup()
    receive({ msg: 'player', xl: 4 })
    receive({ msg: 'player', xl: 7 }, 1200)
    popup.render(1250, true, false)
    expect(popup.root.querySelector('.level-up-number')?.textContent).toBe('7')
    popup.render(1300, false, false)
    expect(popup.root.hidden).toBe(true)
    popup.render(4600, false, false)
    popup.render(4700, true, false)
    expect(popup.active).toBe(false)
    expect(popup.root.hidden).toBe(true)
  })

  it('clears on death and run boundaries without celebrating a loaded character', () => {
    const { popup, receive } = setup()
    receive({ msg: 'player', xl: 4 })
    receive({ msg: 'player', hp: 0 })
    expect(popup.active).toBe(false)
    expect(popup.announcement.textContent).toBe('')
    receive({ msg: 'game_client' })
    receive({ msg: 'player', xl: 15, hp: 50 })
    expect(popup.active).toBe(false)
    receive({ msg: 'player', xl: 16 })
    expect(popup.active).toBe(true)
    receive({ msg: 'go_lobby' })
    expect(popup.active).toBe(false)
    receive({ msg: 'player', xl: 20, hp: 50 })
    expect(popup.active).toBe(false)
  })

  it('keeps the milestone readable in Still mode and clears the announcement at expiry', () => {
    const { popup, receive } = setup()
    receive({ msg: 'player', xl: 4 })
    popup.render(1000, true, true)
    expect(popup.root.hidden).toBe(false)
    expect(popup.root.classList.contains('still')).toBe(true)
    popup.render(1500, true, false)
    expect(popup.root.classList.contains('still')).toBe(false)
    popup.render(4400, true, true)
    expect(popup.root.hidden).toBe(true)
    expect(popup.announcement.textContent).toBe('')
  })
})
