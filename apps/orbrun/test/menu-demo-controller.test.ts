import { expect, it } from 'vitest'
import { initialState, MouseMode } from '@orbrun/webtiles'
import { cellKey, emptyScene, type Billboard, type SceneCell } from '@orbrun/scene'
import { MenuDemoController, menuArgs } from '../src/menu-demo-controller'

function encounter() {
  const state = initialState(); state.phase = 'playing'; state.player.received = true; state.player.hp = 30; state.inputMode = MouseMode.COMMAND
  const scene = emptyScene(); scene.playerOnLevel = true
  scene.cells.set(cellKey(1, 0), { x: 1, y: 0, visibility: 'visible' } as SceneCell)
  scene.billboards = [{ x: 1, y: 0, kind: 'monster', attitude: 'hostile' } as Billboard]
  return { state, scene, controller: new MenuDemoController() }
}
it('uses Crawl autofight only for a confirmed visible hostile and bounds stalled encounters', () => {
  const { state, scene, controller } = encounter()
  expect(controller.next(state, scene)).toBe('\t')
  scene.cells.get(cellKey(1, 0))!.visibility = 'remembered'
  state.player.turn++
  expect(controller.next(state, scene)).toBe('s')
  scene.cells.get(cellKey(1, 0))!.visibility = 'visible'
  scene.billboards[0].attitude = 'friendly'
  state.player.turn++
  expect(controller.next(state, scene)).toBe('s')
  controller.next(state, scene); controller.next(state, scene)
  expect(controller.next(state, scene)).toBeNull()
})
it('handles more and attribute prompts, but never sends attacks into unexpected dialogs', () => {
  const { state, scene, controller } = encounter()
  state.messages.more = true
  expect(controller.next(state, scene)).toBe(' ')
  state.messages.more = false
  state.inputMode = MouseMode.PROMPT
  state.messages.lines.push({ text: 'Increase (S)trength, (I)ntelligence, or (D)exterity? ', channel: 0 })
  expect(controller.next(state, scene)).toBe('S')
  state.messages.lines = []
  expect(controller.next(state, scene)).toBeNull()
})
it('ends cleared encounters and deaths; starts a fixed map with an explicit seed', () => {
  const { state, scene, controller } = encounter()
  scene.billboards = []
  for (let i = 0; i < 4; i++) { state.player.turn++; expect(controller.next(state, scene)).toBe('s') }
  state.player.turn++; expect(controller.next(state, scene)).toBeNull()
  state.player.hp = 0; expect(new MenuDemoController().next(state, scene)).toBeNull()
  expect(menuArgs(42)).toEqual(expect.arrayContaining(['-sprint-map', 'orbrun_menu', '-seed', '42']))
})
