import { strFromU8, unzipSync } from 'fflate'
import type { FreshMessage } from '../message-occurrences'

export const OSP_URL = 'https://osp.nemelex.cards/build/latest.zip'
export const MAX_PACK_BYTES = 64 * 1024 * 1024
const MAX_EXPANDED = 192 * 1024 * 1024
const MAX_FILE = 8 * 1024 * 1024
export interface PackInfo { name: string; rules: number; sounds: number; warnings: number; details: string[] }
interface Rule { regex: RegExp; path: string }
export interface SoundPack { info: PackInfo; rules: Rule[]; files: Record<string, Uint8Array> }

function pathOf(path: string): string {
  path = path.trim().replace(/^(['"])(.*)\1$/, '$2').replaceAll('\\', '/').replace(/^\.\//, '')
  if (!path || path.length > 512 || path.startsWith('/') || /[:\x00-\x1f]/.test(path)
    || path.split('/').some(p => p === '..' || p === '.')) throw new Error('Unsafe sound-pack path')
  return path
}

/** Called only in the disposable worker. Validate all entries before any decompression. */
export function readPack(bytes: Uint8Array): SoundPack {
  if (bytes.byteLength > MAX_PACK_BYTES) throw new Error('Sound pack exceeds 64 MB')
  let entries = 0, expanded = 0
  const names = new Set<string>()
  unzipSync(bytes, { filter: entry => {
    pathOf(entry.name)
    if (names.has(entry.name)) throw new Error('Duplicate sound-pack path')
    names.add(entry.name)
    expanded += entry.originalSize
    if (++entries > 4096 || expanded > MAX_EXPANDED || entry.originalSize > MAX_FILE
      || (entry.name.endsWith('.txt') && entry.originalSize > 512 * 1024)) throw new Error('Sound pack exceeds extraction limits')
    return false
  } })
  if (!names.has('init.txt')) throw new Error('This pack needs an init.txt at the ZIP root')
  const texts = unzipSync(bytes, { filter: e => e.name === 'init.txt' || e.name === 'sound-pack-info' })
  const info: PackInfo = { name: texts['sound-pack-info'] ? strFromU8(texts['sound-pack-info']).trim().slice(0, 240) : 'Imported sound pack', rules: 0, sounds: 0, warnings: 0, details: [] }
  const warn = (line: number, reason: string) => {
    info.warnings++
    if (info.details.length < 30) info.details.push(`Line ${line}: ${reason}`)
  }
  const rules: Rule[] = []
  const wanted = new Set<string>()
  let base = '', count = 0
  for (const [index, raw] of strFromU8(texts['init.txt']).split(/\r?\n/).entries()) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (/^sound_file_path\s*=/.test(line)) {
      const value = line.slice(line.indexOf('=') + 1).split('#')[0].trim()
      base = value ? pathOf(value) : ''
      if (base && !base.endsWith('/')) base += '/'
      continue
    }
    const declaration = /^sound\s*[+^]=\s*(.*)$/.exec(line)
    if (!declaration) continue // No includes, Lua, unrelated RC options, music or executable content.
    if (++count > 10_000) throw new Error('Too many sound rules')
    try {
      const parts = declaration[1].split(/(?<!\\):/)
      if (parts.length !== 2 || !parts[0] || parts[0].length > 2048) throw new Error('Invalid sound rule')
      const regex = new RegExp(parts[0], 'g')
      const path = pathOf(base + parts[1].split('#')[0].trim().replace(/^(['"])(.*)\1$/, '$2').replaceAll('\\', '/').replace(/^\.\//, ''))
      if (!/\.(mp3|wav|ogg|m4a)$/i.test(path) || !names.has(path)) throw new Error(`Missing or unsupported audio: ${path}`)
      rules.push({ regex, path }); wanted.add(path)
    } catch (error) { warn(index + 1, error instanceof Error ? error.message : 'Invalid sound rule') }
  }
  if (!rules.length) throw new Error('No playable sound rules in init.txt')
  const files = unzipSync(bytes, { filter: e => wanted.has(e.name) })
  info.rules = rules.length
  info.sounds = wanted.size
  return { info, rules, files }
}

/** First playable rule wins. Old match spans in rewritten lines cannot trigger again. */
export function matchSound(pack: SoundPack, message: FreshMessage): string | null {
  if (message.text.length > 16_384) return null
  for (const { regex, path } of pack.rules) {
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(message.text))) {
      if (match[0].length && match.index + match[0].length > message.freshFrom) return path
      if (!match[0].length) regex.lastIndex++
    }
  }
  return null
}
