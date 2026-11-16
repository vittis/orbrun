/** Convert a scrubbed spectator recording into a bounded, self-contained menu clip.
 * node tools/record/curate-menu.mjs input.ndjson start-ms end-ms output.json
 * Retains all preceding state deltas as a silent bootstrap. Only idle pacing changes.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function curate(records, start, end) {
  const version = records.find(r => r.m.msg === 'game_client')?.m.version
  if (!/^[a-f0-9]{40}$/.test(version) || !(start >= 0 && end > start)) throw Error('Invalid capture or range')
  const allowed = new Set(['map', 'player', 'msgs'])
  const selected = records.filter(r => allowed.has(r.m.msg) && r.t <= end)
    .map(r => ({ t: r.t, m: JSON.parse(JSON.stringify(r.m).replace(/\bwatched\b/g, 'Adventurer')) }))
  const initial = selected.filter(r => r.t < start).map(r => r.m)
  if (!initial.some(m => m.msg === 'map') || !initial.some(m => m.msg === 'player')) throw Error('Missing initial state')
  const batches = []
  for (const r of selected.filter(r => r.t >= start)) {
    const last = batches.at(-1)
    // Preserve order and coalesce only the messages of a short network burst.
    if (last && r.t - last.t < 40) last.messages.push(r.m)
    else batches.push({ t: r.t, messages: [r.m] })
  }
  if (!batches.length) throw Error('Empty selection')
  let previous = start
  const frames = batches.map(batch => {
    const after = Math.max(100, Math.min(900, batch.t - previous))
    previous = batch.t
    return { after, messages: batch.messages }
  })
  return { format: 1, version, initial, frames }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, start, end, output] = process.argv
  const clip = curate(readFileSync(input, 'utf8').trim().split('\n').map(line => JSON.parse(line)), +start, +end)
  writeFileSync(output, JSON.stringify(clip) + '\n')
  console.log(JSON.stringify({ frames: clip.frames.length, durationMs: clip.frames.reduce((sum, f) => sum + f.after, 1600), bootstrapMessages: clip.initial.length }))
}
