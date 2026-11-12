import { MSGCH, type GameMessage, type GameState } from '@orbrun/webtiles'
import { cellKey, type CellKey, type Scene } from '@orbrun/scene'

/**
 * The lines that arrived since `last` was the newest. When `last` is gone
 * (rolled back by the server, or nothing has been read yet) the lines of the
 * current `turn` stand in, so a warning is never lost and never older than
 * the turn it belongs to.
 */
export function linesSince(lines: readonly GameMessage[], last: GameMessage | undefined, turn: number): GameMessage[] {
  const i = last === undefined ? -1 : lines.lastIndexOf(last)
  if (i >= 0) return lines.slice(i + 1)
  return lines.filter((l) => l.turn === turn)
}

/**
 * Whether `o` would only say again that there is nowhere left to go. Crawl
 * says so when an explore finds no target (travel.cc
 * `_explore_find_target_square`): "Done exploring.", or "Partly explored, …"
 * for a door it will not open, a transporter, or a place or an item out of
 * reach, both on MSGCH_PLAIN. Explore heads for ground never seen and the
 * items it is greedy for, so the word holds until the level could offer
 * either: another level, ground the map did not have (a door opened onto it,
 * a magic map), or an item where none lay. A guess past that (an exclusion
 * lifted, flight over the water), so Explore is dimmed, not taken away: the
 * tap still goes to crawl, which has the last word.
 */
export class ExploreDone {
  private last: GameMessage | undefined
  private said: { place: string; revision: number; known: number; items: Set<CellKey> } | null = null

  /** Read once per change of the messages or the scene. */
  update(st: GameState, scene: Scene): boolean {
    const lines = st.messages.lines
    const fresh = linesSince(lines, this.last, st.player.turn)
    this.last = lines[lines.length - 1]
    // the level map is looking at another level, which says nothing of this one
    if (!scene.playerOnLevel) return this.said !== null
    const place = st.player.place + ':' + st.player.depth
    if (fresh.some((l) => l.channel === MSGCH.PLAIN && sentences(stripTags(l.text)).some((s) => s === 'Done exploring.' || s.startsWith('Partly explored, ')))) {
      this.said = { place, revision: scene.revision, ...explorable(scene) }
    } else if (this.said && scene.revision !== this.said.revision) {
      const said = this.said
      const now = explorable(scene)
      if (place !== said.place || now.known > said.known || [...now.items].some((k) => !said.items.has(k))) this.said = null
      else said.revision = scene.revision
    }
    return this.said !== null
  }
}

/** What an explore could head for: how many cells the map has, and where items lie. */
function explorable(scene: Scene): { known: number; items: Set<CellKey> } {
  let known = 0
  for (const c of scene.cells.values()) if (c.kind !== 'unknown') known++
  const items = new Set<CellKey>()
  for (const b of scene.billboards) if (b.kind === 'item' && !b.scenery) items.add(cellKey(b.x, b.y))
  return { known, items }
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '')
}
