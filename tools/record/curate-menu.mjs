/** Convert a scrubbed spectator recording into a bounded, self-contained menu clip.
 * node tools/record/curate-menu.mjs input.ndjson start-ms end-ms output.json
 * Retains all preceding state deltas as a silent bootstrap. Only idle pacing changes.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const stateMessages = new Set(['map', 'player', 'msgs'])

export function curate(records, start, end) {
  const version = records.find(r => r.m.msg === 'game_client')?.m.version
  if (!/^[a-f0-9]{40}$/.test(version) || !(start >= 0 && end > start)) throw Error('Invalid capture or range')
  const initial = []
  const frames = []
  let delivery = start, previous = start, projectileTime = 0, batchTime = -Infinity
  for (const { t, m } of records) {
    if (t > end) continue
    if (m.msg === 'delay' && t >= start && Number.isFinite(m.t)) {
      // A socket batch may contain a whole beam. Honour its WebTiles delays
      // once even when consecutive maps already arrived that far apart.
      const delay = Math.max(0, Math.min(1000, m.t))
      delivery = Math.max(t, delivery) + delay
      projectileTime += delay
      continue
    }
    if (!stateMessages.has(m.msg)) continue
    const message = JSON.parse(JSON.stringify(m).replace(/\bwatched\b/g, 'Adventurer'))
    if (t < start) { initial.push(message); continue }
    delivery = Math.max(delivery, t)
    const last = frames.at(-1)
    if (last && delivery - batchTime < 16 && projectileTime === (last.projectileTimeMs ?? 0)
        && last.messages.at(-1).msg !== 'map') {
      last.messages.push(message)
      if (m.msg === 'map') {
        last.after = Math.min(900, last.after + delivery - previous)
        previous = delivery
      }
      continue
    }
    const frame = { after: Math.min(900, delivery - previous), messages: [message] }
    if (projectileTime) frame.projectileTimeMs = projectileTime
    frames.push(frame)
    batchTime = previous = delivery
  }
  if (!initial.some(m => m.msg === 'map') || !initial.some(m => m.msg === 'player')) throw Error('Missing initial state')
  if (!frames.length) throw Error('Empty selection')
  return { format: 1, version, initial, frames }
}

/** Time the ordered engine packets for a staged run. The first input is the
 * spectator snapshot. An author can keep a screen-shake sequence atomic so
 * each presented map shows the player at their confirmed position.
 */
export function curateStaged(records, version, atomicInputs = new Set()) {
  const state = records.filter(r => stateMessages.has(r.m.msg))
  const [snapshot = [], ...actions] = Map.groupBy(state, r => r.input).values()
  const initial = snapshot.map(r => r.m)
  let pos = initial.find(m => m.msg === 'player')?.pos
  if (!pos || !initial.some(m => m.msg === 'map' && m.clear)) throw Error('Missing initial state')
  const frames = []
  let lastMapTime = snapshot.at(-1).t
  let awaitingTurn = false
  for (const action of actions) {
    const moved = action.some(r => r.m.msg === 'player' && r.m.pos)
    const advanced = action.some(r => r.m.msg === 'player' && r.m.turn !== undefined)
    const actionPause = moved ? 270 : advanced ? 370 : 150
    // A long-running effect can still be delivering maps when the recorder
    // supplies the next input. Keep that part of the flight on capture time.
    const pause = awaitingTurn ? Math.min(actionPause, Math.max(0, action[0].t - lastMapTime)) : actionPause
    awaitingTurn = !advanced
    let messages = [], first = true, shifted = false
    for (const [i, { t, m }] of action.entries()) {
      messages.push(m)
      if (m.msg === 'player' && m.pos) pos = m.pos
      if (m.msg === 'map') {
        let x = 0, y = 0
        for (const cell of m.cells ?? []) {
          x = cell.x ?? x + 1
          y = cell.y ?? y
          if (cell.g === '@') shifted = x !== pos.x || y !== pos.y
        }
      }
      if (i < action.length - 1 && (m.msg !== 'map' || shifted || atomicInputs.has(action[0].input))) continue
      frames.push({ after: first ? pause : Math.min(900, t - lastMapTime), messages })
      messages = []
      first = false
      lastMapTime = t
    }
  }
  if (!frames.length) throw Error('Empty selection')
  return { format: 1, version, initial, frames }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, start, end, output] = process.argv
  const clip = curate(readFileSync(input, 'utf8').trim().split('\n').map(line => JSON.parse(line)), +start, +end)
  writeFileSync(output, JSON.stringify(clip) + '\n')
  console.log(JSON.stringify({ frames: clip.frames.length, durationMs: clip.frames.reduce((sum, f) => sum + f.after, 1600), bootstrapMessages: clip.initial.length }))
}
