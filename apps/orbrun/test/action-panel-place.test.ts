// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Hud } from '../src/hud'
import { GridHost } from '../src/grid/host'
import { gameSplit } from '../src/grid/console'
import { initialState, reduce } from '@orbrun/webtiles'
import { emptyScene, makeCamera } from '@orbrun/scene'

/** the HUD on a 1600×900 screen, and where it put the action panel: its left edge is the strip's own left edge */
function place(opts: { minimapTiles?: number; hideStats?: boolean; hideSidebar?: boolean; mapView?: boolean; phone?: boolean; dungeon?: boolean } = {}) {
  const host = document.createElement('div')
  Object.defineProperty(host, 'clientWidth', { value: 1600 })
  Object.defineProperty(host, 'clientHeight', { value: 900 })
  document.body.append(host)
  const hud = new Hud(host, { onSelectMonster() {}, onBarAction() {}, onMinimapClick() {}, onPanelItem() {}, onPanelShow() {} })
  if (opts.minimapTiles) hud.setMinimapTiles(opts.minimapTiles)
  if (opts.dungeon) hud.setMinimapEnabled(false)
  const grid = new GridHost(host, 16)
  grid.setLeast(!!opts.phone)
  const cells = gameSplit(grid.grid, 7, undefined, 0, 0, undefined, 0, 0, 0, opts.dungeon)
  // game.ts gives the HUD the whole view as the free part while the level map is open, the panes stepping aside
  const free = opts.mapView ? cells.view : cells.clear
  hud.layout(grid, cells, free, { stats: !!opts.hideStats, sidebar: !!opts.hideSidebar, messages: false })
  const panel = (hud as unknown as { actionPanel: HTMLElement }).actionPanel
  const stats = grid.px(cells.stats)
  const side = grid.px(cells.sidebar)
  const minimapW = Number.parseFloat((hud as unknown as { minimapCanvas: HTMLCanvasElement }).minimapCanvas.style.width) || 0
  return {
    hud, host, grid, cells,
    left: Number.parseFloat(panel.style.left),
    top: Number.parseFloat(panel.style.top),
    statsRight: stats.left + stats.width,
    statsLeft: stats.left,
    statsBottom: stats.top + stats.height,
    sidebarTop: side.top,
    minimapLeft: side.left + side.width - minimapW,
    freeRight: grid.px(free).left + grid.px(free).width,
    cell: grid.grid.cw,
    minimapW,
    width: (hud as unknown as { panelBox: { width: number } }).panelBox.width,
  }
}

describe('the action panel stands in the strip between the stats pane and the minimap', () => {
  it('keeps the right column below wrapped character statuses and restores its position when they clear', () => {
    const { hud, host, grid, cells } = place({ dungeon: true })
    const st = initialState(), scene = emptyScene(), cam = makeCamera(0, 0, 0)
    const update = () => hud.update(st, scene, cam, { mode: 'command', layer: 'macro', hostilesInView: 0 } as never, 'xbox', null, false, 'keyboard', 'list', false)
    update()
    const sidebar = host.querySelector<HTMLElement>('.sidebar')!
    const originalTop = parseFloat(sidebar.style.top)
    reduce(st, { msg: 'player', status: Array.from({ length: 30 }, (_, i) => ({ light: 'LongStatus' + i, text: 'LongStatus' + i, col: 7 })) })
    update()
    const rows = host.querySelector('.stats')!.children.length - 1
    const statsBottom = grid.px(cells.stats).top + rows * grid.grid.ch
    expect(parseFloat(sidebar.style.top)).toBeGreaterThan(statsBottom)
    expect(parseFloat(sidebar.style.top)).toBeGreaterThan(originalTop)
    reduce(st, { msg: 'player', status: [] })
    update()
    expect(parseFloat(sidebar.style.top)).toBe(originalTop)
    hud.destroy(); grid.destroy(); host.remove()
  })
  it('moves the dungeon character pane right, leaves the item strip left and starts the list below the character', () => {
    const p = place({ dungeon: true })
    expect(p.statsLeft).toBeGreaterThan(place().statsLeft)
    expect(p.statsRight).toBeGreaterThan(p.freeRight)
    expect(p.sidebarTop).toBeGreaterThan(p.statsBottom)
    expect(p.left).toBeLessThan(p.statsLeft)
    expect(p.width).toBeGreaterThan(0)
    expect(p.left + p.width).toBeLessThanOrEqual(p.statsLeft)
    expect(p.minimapW).toBe(0)
  })
  it('is left aligned in the strip, along the top of the view, as action_panel.js stands it in the dungeon corner', () => {
    const p = place()
    // 900 tall: the tiles never come under 20px (minimapFit)
    expect(p.minimapW).toBe(19 * 20)
    // a gutter clear of the stats pane, and well short of the minimap it must not reach
    expect(p.left).toBeGreaterThan(p.statsRight)
    expect(p.left).toBeCloseTo(p.statsRight + p.cell, -1)
    expect(p.left).toBeLessThan(p.minimapLeft)
    expect(p.top).toBeCloseTo(3, 0)
  })
  it('keeps its left edge when the minimap grows over the view: only the room to its right is lost', () => {
    const wide = place({ minimapTiles: 45 })
    expect(wide.minimapW).toBeGreaterThan(place().minimapW)
    expect(wide.left).toBe(place().left)
    expect(wide.left).toBeLessThan(wide.minimapLeft)
  })
  it('takes the room a pane that has stepped aside leaves', () => {
    // the new-game chooser hides the stats pane: the strip reaches the view's left edge
    const noStats = place({ hideStats: true })
    expect(noStats.left).toBeLessThan(place().left)
    // the level map hides both and gives the HUD the whole view: the strip starts at the screen's own edge
    const bare = place({ hideStats: true, hideSidebar: true, mapView: true })
    expect(bare.left).toBeCloseTo(noStats.left, -1)
  })
})

describe('on a phone', () => {
  it('has no strip for the action panel, upright or on its side: it stands nowhere', () => {
    expect(place({ phone: true }).width).toBe(0)
    expect(place().width).toBeGreaterThan(0)
  })
})
