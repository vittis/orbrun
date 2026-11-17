import { strToU8, zipSync } from 'fflate'
import type { Page } from '@playwright/test'

/** Authored PCM tone, not a redistributed OSP asset or a public-server dependency. */
export function audioArchive() {
  const samples = 8000, wav = new Uint8Array(44 + samples * 2), view = new DataView(wav.buffer)
  const word = (at: number, text: string) => wav.set(strToU8(text), at)
  word(0, 'RIFF'); view.setUint32(4, wav.length - 8, true); word(8, 'WAVE'); word(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  word(36, 'data'); view.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(i / 16000 * Math.PI * 2 * 440) * 2000), true)
  return Buffer.from(zipSync({
    'init.txt': strToU8('sound ^= You hit:se/hit.wav\nsound ^= You miss:se/hit.wav\nsound ^= You kill:se/hit.wav'),
    'se/hit.wav': wav,
    'sound-pack-info': strToU8('Orbrun audio acceptance fixture'),
  }))
}

export async function observeAudio(page: Page) {
  await page.addInitScript(() => {
    const evidence = { starts: 0, stops: 0 }
    Object.assign(window, { __audioEvidence: evidence })
    const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop
    AudioBufferSourceNode.prototype.start = function (...args) { evidence.starts++; return start.apply(this, args) }
    AudioBufferSourceNode.prototype.stop = function (...args) { evidence.stops++; return stop.apply(this, args) }
  })
}

export function audioStarts(page: Page) {
  return page.evaluate(() => (window as unknown as { __audioEvidence: { starts: number } }).__audioEvidence.starts)
}
