import { formattedStringToText, MouseMode, type GameState } from '@orbrun/webtiles'
import { isThreat, monstersInView, type Scene } from '@orbrun/scene'

export const MENU_RC = `weapon = war axe
show_more = false
autopickup =
default_manual_training = false
autofight_stop = 0
tile_show_minihealthbar = false
tile_show_minimagicbar = false
travel_delay = 0
rest_delay = 0
`

export function menuArgs(seed: number): string[] {
  return ['-headless', '-webtiles-socket', 'bridge', '-name', 'Menu', '-rc', '/menu.rc',
    '-sprint', '-sprint-map', 'orbrun_menu', '-species', 'minotaur', '-background', 'fighter',
    '-seed', String(seed)]
}

/** A bounded encounter, not an explorer. Crawl's own autofight chooses the move/attack. */
export class MenuDemoController {
  private actions = 0
  private empty = 0
  private stalled = 0
  private turn = -1

  next(state: GameState, scene: Scene): string | null {
    if (++this.actions > 100 || state.phase === 'ended' || state.player.received && state.player.hp <= 0) return null
    if (state.messages.more) return ' '
    const prompt = formattedStringToText(state.messages.lines.at(-1)?.text ?? '')
    if (/^Increase \(S\)trength, \(I\)ntelligence, or \(D\)exterity\?/.test(prompt)) return 'S'
    // Unexpected prompts never receive gameplay keys. End this disposable encounter.
    if (state.menus.length || state.ui.length || state.textInput || state.dialog || state.inputMode !== MouseMode.COMMAND) return null
    if (state.player.turn === this.turn) this.stalled++
    else this.stalled = 0
    this.turn = state.player.turn
    if (this.stalled >= 3) return null
    if (!monstersInView(scene).some(isThreat)) return ++this.empty > 4 ? null : 's'
    this.empty = 0
    return '\t'
  }
}
