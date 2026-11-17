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
    expect(popup.root.dataset.level).toBe('9')
    expect(popup.announcement.textContent).toBe('Level up. You are now level 9.')
    expect(popup.root.getAttribute('aria-hidden')).toBe('true')
    expect(popup.announcement.getAttribute('role')).toBe('status')
    // Duplicates and unrelated updates cannot extend the presentation lifetime.
    receive({ msg: 'player', xl: 9, hp: 29 }, 4000)
    popup.render(4000, true, false)
    expect(popup.root.hidden).toBe(true)
    expect(popup.active).toBe(false)
  })

  it('shows the native announcement before the stat choice and never replays the delayed XL delta', () => {
    const { state, popup, receive } = setup()
    receive({ msg: 'player', xl: 2 })
    receive({ msg: 'msgs', messages: [
      { text: '<lightgreen>You have reached level 3!</lightgreen>', channel: 11, turn: 41 },
      { text: 'Your experience leads to an increase in your attributes!', channel: 11, turn: 41 },
      { text: 'Increase (S)trength, (I)ntelligence, or (D)exterity?', channel: 2, turn: 41 },
    ] })
    popup.render(1000, true, false)
    expect(state.player.xl).toBe(2) // The server has not sent XL yet.
    expect(popup.root.hidden).toBe(false)
    expect(popup.root.dataset.level).toBe('3')
    // Replacing a message line and waiting for a stat answer must not restart it.
    receive({ msg: 'msgs', rollback: 3, messages: [
      { text: 'You have reached level 3!', channel: 11, turn: 41 },
    ] }, 3500)
    popup.render(4000, true, false)
    expect(popup.active).toBe(false)
    receive({ msg: 'player', xl: 3 }, 8000)
    popup.render(8000, true, false)
    expect(popup.active).toBe(false)
    expect(popup.root.hidden).toBe(true)
  })

  it('ignores replayed history and announcements from unrelated channels or characters', () => {
    const { popup, receive } = setup(false)
    receive({ msg: 'player', xl: 2, hp: 30 })
    const gain = { text: 'You have reached level 3!', channel: 11 }
    receive({ msg: 'msgs', messages: [gain] })
    receive({ msg: 'msgs', messages: [{ ...gain, channel: 4 },
      { ...gain, text: 'The goblin has reached level 3!' }] })
    expect(popup.active).toBe(false)
    receive({ msg: 'msgs', messages: [gain] })
    expect(popup.active).toBe(true)
    receive({ msg: 'player', hp: 0 })
    receive({ msg: 'msgs', messages: [{ ...gain, text: 'You have reached level 4!' }] })
    expect(popup.active).toBe(false)
  })

  it('coalesces rapid gains into the latest confirmed level and expires while hidden', () => {
    const { popup, receive } = setup()
    receive({ msg: 'player', xl: 4 })
    receive({ msg: 'player', xl: 7 }, 1200)
    popup.render(1250, true, false)
    expect(popup.root.dataset.level).toBe('7')
    popup.render(1300, false, false)
    expect(popup.root.hidden).toBe(true)
    popup.render(4200, false, false)
    popup.render(4300, true, false)
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
    popup.render(4000, true, true)
    expect(popup.root.hidden).toBe(true)
    expect(popup.announcement.textContent).toBe('')
  })
})
