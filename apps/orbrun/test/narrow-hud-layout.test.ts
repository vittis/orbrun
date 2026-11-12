import { describe, expect, it } from 'vitest'
import { initialState } from '@orbrun/webtiles'
import { fitGrid, gameSplit, isPortrait, levelMapSplit, levelMapCanvas, STAT_WIDTH, touchBeside } from '../src/grid/console'
import { statsRows } from '../src/grid/stats'
import { rowLength } from '../src/grid/rows'

const dungeon = (grid: ReturnType<typeof fitGrid>) => gameSplit(grid, 5, undefined, 0, 0, undefined, 0, 0, 0, true)

describe('Dungeon HUD space in a narrow desktop window', () => {
  it.each([390, 640])('keeps readable character and monster panes at %ipx without selecting phone layout', width => {
    const g = fitGrid(width, 844, 9.6, 19)
    const cells = dungeon(g)
    expect(isPortrait(g)).toBe(false)
    expect(cells.stats.w).toBe(Math.min(STAT_WIDTH, g.cols))
    expect(cells.stats.x + cells.stats.w).toBe(g.cols)
    expect(cells.sidebar.w).toBe(cells.stats.w)
    expect(cells.sidebar.y).toBeGreaterThan(cells.stats.y + cells.stats.h)
    expect(cells.messages.w).toBe(g.cols)
    expect(cells.clear.w).toBe(g.cols)
    expect(cells.clear.y).toBeGreaterThan(cells.sidebar.y + cells.sidebar.h)
    expect(cells.view).toEqual({ x: 0, y: 0, w: g.cols, h: g.rows })
    // The map retains a full readable width, whether or not the sidebar is hidden.
    const map = levelMapSplit(g, cells, {})
    expect(map.w).toBe(g.cols)
    expect(map.y).toBe(cells.clear.y)
    expect(map.h).toBe(cells.clear.h)
    expect(levelMapSplit(g, cells, { hideSidebar: true }).w).toBe(g.cols)
    const state = initialState()
    Object.assign(state.player, { name: 'Lifecycle', species: 'Formicid', hp: 123, hp_max: 145, mp: 12, mp_max: 20, xl: 27, str: 25, int: 17, dex: 18 })
    const rows = statsRows(state.player, state.options, {}, cells.stats.w, 9).rows
    for (const row of rows) expect(rowLength(row)).toBeLessThanOrEqual(cells.stats.w)
    const text = rows.flat().map(span => span.text).join('')
    expect(text).toContain('123')
    expect(text).toContain('145')
    expect(text).toContain('27')
  })

  it.each([0.8, 1, 1.5])('uses available cells at UI scale %s', scale => {
    const g = fitGrid(390, 844, 9.6 * scale, 19 * scale)
    const cells = dungeon(g)
    expect(cells.stats.w).toBeGreaterThanOrEqual(36)
    expect(cells.messages.x + cells.messages.w).toBeLessThanOrEqual(g.cols)
    expect(cells.clear.h).toBeGreaterThanOrEqual(0)
  })

  it.each([240, 390, 600])('keeps panes and prompts separate at a constrained height of %ipx', height => {
    const g = fitGrid(390, height, 9.6, 19)
    const cells = gameSplit(g, 20, undefined, 0, 0, undefined, 0, 0, 0, true)
    expect(cells.stats.y + cells.stats.h).toBeLessThan(cells.sidebar.y)
    expect(cells.sidebar.y + cells.sidebar.h).toBeLessThan(cells.clear.y)
    expect(cells.clear.h).toBeGreaterThanOrEqual(4)
    expect(cells.clear.y + cells.clear.h).toBe(cells.messages.y)
    expect(cells.messages.y + cells.messages.h).toBeLessThanOrEqual(g.rows)
    const map = levelMapSplit(g, cells, { hideMessages: true })
    const canvas = levelMapCanvas(cells, map, false, g.rows)
    expect(canvas.y).toBe(cells.clear.y)
    expect(canvas.y + canvas.h).toBe(g.rows)
    expect(levelMapSplit(g, cells, { hideSidebar: true }).y).toBe(0)
  })

  it('preserves the wide desktop rectangles', () => {
    const g = fitGrid(1440, 900, 9.6, 19)
    const cells = dungeon(g)
    expect(cells.stats).toEqual({ x: g.cols - 42, y: 0, w: 42, h: 13 })
    expect(cells.sidebar).toEqual({ x: g.cols - 42, y: 14, w: 42, h: g.rows - 14 })
    expect(cells.clear).toEqual({ x: 0, y: 0, w: g.cols - 42, h: g.rows - 6 })
    expect(cells.messages).toEqual({ x: 0, y: g.rows - 6, w: g.cols - 42, h: 6 })
  })

  it('preserves phone portrait and touch placement independently of desktop fallback', () => {
    const g = { ...fitGrid(390, 844, 6.6, 13), phone: true }
    const cells = dungeon(g)
    expect(isPortrait(g)).toBe(true)
    expect(touchBeside(g)).toBe(false)
    expect(cells.stats.w).toBe(g.cols - 1)
    expect(cells.messages.w).toBe(g.cols)
    const landscape = { ...fitGrid(844, 390, 6.6, 13), phone: true }
    expect(isPortrait(landscape)).toBe(false)
    expect(touchBeside(landscape)).toBe(true)
    expect(dungeon(landscape).clear.y).toBe(0)
  })
})
