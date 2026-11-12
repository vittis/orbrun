import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import type { Gamedata } from '@orbrun/gamedata'
import { fixtureGamedata, fixtureMessages, fixtureState } from './recording'
import { cellKey, type Scene } from '@orbrun/scene'
import { buildScene } from '../src/index.js'

/**
 * The incremental build (`BuildOptions.dirty`) must give the scene the full
 * build gives, at every flush, for the whole recorded session: the same
 * cells, billboards, lids, level and bounds, and the same layout revisions
 * as the plain `previous` chain. Replayed at several flush cadences, since a
 * flush may gather one message or many.
 */
/** Everything a scene says, with the bookkeeping revisions left out and the cells in key order. */
function semantics(s: Scene) {
  const cells = [...s.cells.entries()].sort((a, b) => a[0] - b[0]).map(([k, c]) => [k, c] as const)
  return { bounds: s.bounds, player: s.player, playerOnLevel: s.playerOnLevel, level: s.level, cells, billboards: s.billboards }
}

describe('incremental scene building', () => {
  let gd: Gamedata
  let messages: ServerMessage[]
  beforeAll(async () => {
    gd = await fixtureGamedata()
  })
  beforeEach(() => { messages = fixtureMessages() })

  for (const every of [1, 7, 50]) {
    it(`matches the full build at every flush, one flush every ${every} message${every > 1 ? 's' : ''}`, () => {
      const state = initialState()
      let chained: Scene | undefined
      let incremental: Scene | undefined
      let flushes = 0
      let reused = 0
      let carried = 0
      const flush = () => {
        flushes++
        const full = buildScene(state, gd)
        chained = buildScene(state, gd, { previous: chained })
        const before = incremental
        incremental = buildScene(state, gd, { previous: incremental, dirty: { cells: state.dirtyCells, mapCleared: state.mapCleared } })
        state.dirtyCells.clear()
        state.mapCleared = false
        expect(semantics(incremental)).toEqual(semantics(full))
        // the layout revisions move as the plain chain's do: same on the same flushes, new on the same flushes
        expect(incremental.layoutRevision === incremental.revision).toBe(chained.layoutRevision === chained.revision)
        expect(incremental.revision).toBe(chained.revision)
        if (before) {
          reused++
          for (const [k, c] of incremental.cells) if (before.cells.get(k) === c) carried++
        }
      }
      for (const [i, m] of messages.entries()) {
        reduce(state, m)
        if ((i + 1) % every === 0) flush()
      }
      flush()
      expect(flushes).toBeGreaterThan(2)
      // and it did carry cells over rather than rebuild them: most of an explored level stands still between flushes
      expect(carried).toBeGreaterThan(0)
      expect(reused).toBeGreaterThan(0)
    }, 60_000) // three builds per message over the whole recording: slow under a loaded suite, never flaky
  }

  it('carries untouched cells and billboards over by identity, and rebuilds the touched ones', () => {
    const state = fixtureState()
    const a = buildScene(state, gd, { dirty: { cells: state.dirtyCells, mapCleared: state.mapCleared } })
    state.dirtyCells.clear()
    state.mapCleared = false
    // nothing touched: everything stands as it is
    const b = buildScene(state, gd, { previous: a, dirty: { cells: state.dirtyCells, mapCleared: false } })
    for (const [k, c] of a.cells) expect(b.cells.get(k)).toBe(c)
    expect(b.billboards.map((x) => a.billboards.indexOf(x))).not.toContain(-1)
    expect(b.layoutRevision).toBe(a.layoutRevision)
    // one cell touched: that cell is new, the rest stand
    const some = [...state.map.cells.values()].find((mc) => mc.t?.fg)!
    const key = ((some.y + 512) << 10) | (some.x + 512)
    const c = buildScene(state, gd, { previous: b, dirty: { cells: new Set([key]), mapCleared: false } })
    expect(c.cells.get(cellKey(some.x, some.y))).not.toBe(b.cells.get(cellKey(some.x, some.y)))
    let same = 0
    for (const [k, cell] of c.cells) if (b.cells.get(k) === cell) same++
    expect(same).toBe(c.cells.size - 1)
    expect(c.layoutRevision).toBe(b.layoutRevision)
    // a clear builds everything afresh
    const d = buildScene(state, gd, { previous: c, dirty: { cells: new Set(), mapCleared: true } })
    for (const [k, cell] of d.cells) expect(c.cells.get(k)).not.toBe(cell)
  })

  it('does not trust a previous scene built from another state', () => {
    const state = fixtureState()
    const other = initialState()
    for (const m of messages.slice(0, 40)) reduce(other, m)
    const foreign = buildScene(other, gd)
    const s = buildScene(state, gd, { previous: foreign, dirty: { cells: new Set(), mapCleared: false } })
    expect(semantics(s)).toEqual(semantics(buildScene(state, gd)))
  })

  it('refreshes player flight from species and status changes without map updates', () => {
    const state = fixtureState()
    state.player.species = 'Human'; state.player.status = []
    let scene = buildScene(state, gd)
    const player = () => scene.billboards.find(b => b.kind === 'player')!
    const refresh = () => { scene = buildScene(state, gd, { previous: scene, dirty: { cells: new Set(), mapCleared: false } }) }
    // Player tile FLYING means no water clipping, not actual flight.
    const mc = [...state.map.cells.values()].find(c => c.x === state.player.pos.x && c.y === state.player.pos.y)!
    expect(gd.fg(mc.t?.fg).FLYING).toBe(true)
    expect(player().life).toMatchObject({ motion: 'breath', flying: false })
    state.player.species = 'Djinni'; state.player.status = [{ light: 'Fly', text: 'flying' }]; refresh()
    expect(player().life).toMatchObject({ motion: 'fly', flying: true })
    // A form suppressing innate flight must also stop a Djinni's hover.
    state.player.status = [{ light: 'Tree', text: 'tree-form' }]; refresh()
    expect(player().life).toMatchObject({ motion: 'breath', flying: false })
    state.player.species = 'Gnoll'; state.player.status = []; refresh()
    expect(player().life).toMatchObject({ motion: 'breath', flying: false })
    state.player.status = [{ light: 'Fly', text: 'flying' }]; refresh()
    expect(player().life).toMatchObject({ motion: 'fly', flying: true })
    // A stable short label must not hide changes in the long status text.
    state.player.status = [{ light: 'Other', text: 'flying' }]; refresh()
    expect(player().life).toMatchObject({ motion: 'fly', flying: true })
    state.player.status = [{ light: 'Other', text: 'grounded' }]; refresh()
    expect(player().life).toMatchObject({ motion: 'breath', flying: false })
    state.player.species = 'Djinni'; state.player.status = [{ light: 'Fly', text: 'flying' }, { light: 'Para', text: 'paralysed' }]; refresh()
    expect(player().life).toMatchObject({ motion: 'fly', flying: true, held: true })
  })

  it.each(['Gnoll', 'Human', 'Minotaur', 'Merfolk', 'Naga', 'Gargoyle', 'Tengu', 'Draconian', 'Djinni'])(
    'keeps a %s grounded without an active flight status, despite the player tile flag', species => {
      const state = fixtureState()
      state.player.species = species; state.player.status = []
      const scene = buildScene(state, gd)
      expect(scene.billboards.find(b => b.kind === 'player')!.life).toMatchObject({ motion: 'breath', flying: false })
    },
  )

  it.each([
    { light: 'Fly', text: 'flying' },
    { text: 'flying' },
    { text: 'flying (expiring)' },
  ])('recognises active flight status %j for a normally grounded player', status => {
    const state = fixtureState()
    state.player.species = 'Gnoll'; state.player.status = [status]
    const scene = buildScene(state, gd)
    expect(scene.billboards.find(b => b.kind === 'player')!.life).toMatchObject({ motion: 'fly', flying: true })
  })

  it.each(['flightless', 'no flight', 'flight', 'water walking'])('does not infer player flight from %s', text => {
    const state = fixtureState()
    state.player.species = 'Gnoll'; state.player.status = [{ text }]
    const scene = buildScene(state, gd)
    expect(scene.billboards.find(b => b.kind === 'player')!.life).toMatchObject({ motion: 'breath', flying: false })
  })

  it('moves the lid of a cell whose wall neighbourhood changed', () => {
    const state = fixtureState()
    const a = buildScene(state, gd, { dirty: { cells: state.dirtyCells, mapCleared: state.mapCleared } })
    state.dirtyCells.clear()
    state.mapCleared = false
    // find a wall cell of a non-dominant type: if the walls are all one type there is nothing to test here
    const wallCells = [...a.cells.values()].filter((c) => c.kind === 'wall' && c.wallTile !== undefined)
    const dominant = a.level.ceilingTile
    const odd = wallCells.find((c) => gd.modules.wall.basetile(c.wallTile!) !== dominant)
    if (!odd) return
    // turn a dominant wall next to a floor into the odd type, the way a `map` message would
    const floor = [...a.cells.values()].find((c) => c.kind === 'floor')
    const target = wallCells.find((c) => gd.modules.wall.basetile(c.wallTile!) === dominant && Math.max(Math.abs(c.x - floor!.x), Math.abs(c.y - floor!.y)) <= 1)
    if (!target) return
    const mc = state.map.cells.get(((target.y + 512) << 10) | (target.x + 512))!
    const oddMc = state.map.cells.get(((odd.y + 512) << 10) | (odd.x + 512))!
    mc.t = { ...mc.t, bg: oddMc.t!.bg }
    state.dirtyCells.add(((target.y + 512) << 10) | (target.x + 512))
    const b = buildScene(state, gd, { previous: a, dirty: { cells: state.dirtyCells, mapCleared: false } })
    expect(semantics(b)).toEqual(semantics(buildScene(state, gd)))
  })
})
