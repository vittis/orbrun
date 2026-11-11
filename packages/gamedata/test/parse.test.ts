import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { parseEnums, parseTiles, parseStatusIcons, MAX_MODULE_CHARS } from '../src/parse'
import { browserIo, ATLASES, type Enums, type FlagWord } from '../src/index'

const root = new URL('../../scene-webtiles/test/fixtures/gamedata/acd3d60e20f899c1c8a546953d6ffa0f6c7fe0c8/', import.meta.url)
const source = (name: string) => readFileSync(fileURLToPath(new URL(name, root)), 'utf8')
const enumSource = source('enums.js')

// Reference execution is deliberately restricted to the pinned, repository-
// owned fixture. No malicious test string or fetched server text enters vm.
function trustedFixture(name: string, dependency?: Record<string, unknown>): Record<string, unknown> {
  let result: Record<string, unknown> | undefined
  runInNewContext(source(name), {
    define: (deps: unknown, fn?: (...args: unknown[]) => Record<string, unknown>) => {
      result = typeof deps === 'function' ? deps() : fn!(dependency)
    },
  }, { timeout: 1000 })
  return result!
}

describe('declarative gamedata compatibility', () => {
  it('accepts current trunk comma-separated flag declarations with the same bounded grammar', () => {
    const trunk = enumSource.replace('fg_flags.flags.FLYING  = 0x00080000;', `fg_flags.flags.FLYING = 0x00080000;
      fg_flags.flags.S_UNDER_GOOD = [0, 0x1000000],
      fg_flags.flags.S_UNDER_ARTEFACT = [0, 0x2000000],`)
    const enums = parseEnums(trunk)
    expect(enums.prepare_fg_flags([1, 0x1000000]).S_UNDER_GOOD).toBe(true)
    expect(enums.prepare_fg_flags([1, 0x2000000]).S_UNDER_ARTEFACT).toBe(true)
    expect(() => parseEnums(trunk.replace('fg_flags.flags.S_UNDER_GOOD = [0, 0x1000000]', 'globalThis.__gamedataEscape = true'))).toThrow()
    expect(Object.hasOwn(globalThis, '__gamedataEscape')).toBe(false)
  })
  it('preserves every tile constant, rectangle, variant and base in the pinned official tables', () => {
    let actual: Record<string, unknown> | undefined, reference: Record<string, unknown> | undefined
    let first = 0
    let compared = 0
    for (const atlas of ATLASES) {
      actual = parseTiles(source(`tileinfo-${atlas}.js`), atlas, actual)
      reference = trustedFixture(`tileinfo-${atlas}.js`, reference)
      const constants = (mod: Record<string, unknown>) => Object.fromEntries(Object.entries(mod).filter(([, value]) => typeof value === 'number'))
      expect(constants(actual)).toEqual(constants(reference))
      const end = actual[`${atlas.toUpperCase()}_MAX`] as number
      expect(Number.isInteger(end)).toBe(true)
      expect(end).toBeGreaterThan(first)
      for (let id = first; id < end; id++) {
        for (const method of ['get_tile_info', 'tile_count', 'basetile', 'get_img']) {
          expect((actual[method] as (id: number) => unknown)(id)).toEqual((reference[method] as (id: number) => unknown)(id))
          compared++
        }
      }
      first = end
    }
    expect(compared).toBeGreaterThan(40_000)
    const actualStatus = parseStatusIcons(source('status-icon-sizes.js'), actual!)
    const referenceStatus = trustedFixture('status-icon-sizes.js', reference)
    for (const value of Object.values(actual!)) if (typeof value === 'number') {
      expect(actualStatus.status_icon_size(value)).toBe((referenceStatus.status_icon_size as (id: number) => number)(value))
    }
  })

  it('matches official flag semantics across low/high bits and deterministic mixed words', () => {
    const actual = parseEnums(enumSource)
    const reference = trustedFixture('enums.js') as unknown as Enums
    const words: [number, number][] = [[0, 0], [0xffffffff, 0xffffffff]]
    for (let bit = 0; bit < 32; bit++) words.push([1 << bit, 0], [0, 1 << bit])
    let random = 42
    for (let i = 0; i < 500; i++) {
      random = Math.imul(random, 1664525) + 1013904223 | 0
      const lo = random
      random = Math.imul(random, 1664525) + 1013904223 | 0
      words.push([lo, random])
    }
    const fields = (word: FlagWord) => Object.fromEntries(Object.entries(word).filter(([key]) => !/^\d+$/.test(key)))
    for (const method of ['prepare_fg_flags', 'prepare_bg_flags'] as const) {
      for (const word of words) expect(fields(actual[method]([...word]))).toEqual(fields(reference[method]([...word])))
      expect(fields(actual[method](7))).toEqual(fields(reference[method](7)))
      const input = [65537, 0]
      actual[method](input)
      expect(Object.keys(input)).toEqual(['0', '1'])
    }
  })
})

describe('remote code is data, never executable', () => {
  const insert = (code: string) => enumSource.replace('var exports = {}, val;', `var exports = {}, val; ${code}`)
  it.each([
    'globalThis.__gamedataEscape = true;',
    'var escape = this;',
    'var escape = Function("return globalThis")();',
    'var escape = ({}).constructor.constructor("return globalThis")();',
    'exports.__proto__ = {};',
    'var escape = { __proto__: {} };',
    'var escape = { get value() { globalThis.__gamedataEscape = true; } };',
    'var escape = { value() { return 1; } };',
    'var escape = (() => 1)();',
    'var escape = import("https://example.invalid/code.js");',
    'while (true) {}',
    'for (;;) {}',
    'var huge = new Array(1000000000);',
    'exports["constructor"] = 1;',
    'fg_flags.exclusive_flags.push(...[]);',
  ])('rejects executable or prototype-bearing input: %s', (code) => {
    expect(() => parseEnums(insert(code))).toThrow()
    expect(Object.hasOwn(globalThis, '__gamedataEscape')).toBe(false)
    expect(Object.hasOwn(Object.prototype, '__gamedataEscape')).toBe(false)
  })

  it('rejects changed helpers instead of executing them or guessing semantics', () => {
    const changed = enumSource.replace('cache.size++;', 'globalThis.__gamedataEscape = true; cache.size++;')
    expect(() => parseEnums(changed)).toThrow('changed enum helper prepare_flags')
    expect(Object.hasOwn(globalThis, '__gamedataEscape')).toBe(false)
    const floor = source('tileinfo-floor.js').replace('return "floor";', 'return fetch("https://example.invalid/");')
    expect(() => parseTiles(floor, 'floor')).toThrow('changed tile helper get_img')
  })

  it('rejects changed AMD dependencies and writes to a previous module', () => {
    const floor = parseTiles(source('tileinfo-floor.js'), 'floor')
    const wall = source('tileinfo-wall.js')
    expect(() => parseTiles(wall.replace('./tileinfo-floor', './arbitrary-code'), 'wall', floor)).toThrow('unexpected AMD dependency')
    const previousMax = floor.TILE_FLOOR_MAX
    expect(() => parseTiles(wall.replace('var exports = {};', 'var exports = {}; m.TILE_FLOOR_MAX = 0;'), 'wall', floor)).toThrow('dependency mutation')
    expect(floor.TILE_FLOOR_MAX).toBe(previousMax)
  })

  it('rejects status code and malformed ranges', () => {
    expect(() => parseStatusIcons('define(["./tileinfo-icons"], function(icons) { var exports = {}; exports.status_icon_size = function(icon) { while(true) {} }; return exports; });', {})).toThrow('status icon switch')
    const malformed = source('tileinfo-floor.js').replace('var tile_info = [', 'exports.TILE_FLOOR_MAX = 999999999; var tile_info = [')
    expect(() => parseTiles(malformed, 'floor')).toThrow('integer outside supported bounds')
  })

  it('bounds source size and syntax nesting before extraction', () => {
    expect(() => parseEnums(' '.repeat(MAX_MODULE_CHARS + 1))).toThrow('module size limit')
    expect(() => parseEnums(insert(`var deep = ${'['.repeat(70)}0${']'.repeat(70)};`))).toThrow('nesting limit')
    expect(() => parseEnums(insert('var chain = ' + '1+'.repeat(100) + '1;'))).toThrow('AST size or depth limit')
  })

  it('rejects array-structural flag names and excessive per-tile flag work', () => {
    for (const name of ['length', '0', '4294967294', 'value', 'constructor']) {
      const changed = enumSource.replace('fg_flags.flags.S_UNDER = 0x00040000;', `fg_flags.flags = { "${name}": 1 };`)
      expect(() => parseEnums(changed)).toThrow()
    }
    const flags = Array.from({ length: 257 }, (_, i) => `F${i}: 1`).join(',')
    expect(() => parseEnums(enumSource.replace('fg_flags.flags.S_UNDER = 0x00040000;', `fg_flags.flags = { ${flags} };`))).toThrow('flag table size limit')
    const groups = Array.from({ length: 33 }, () => 'fg_flags.exclusive_flags.push({mask: 1, TEST: 1});').join('\n')
    expect(() => parseEnums(enumSource.replace('fg_flags.mask             = 0x0000FFFF;', groups + '\nfg_flags.mask = 65535;'))).toThrow('exclusive flag group limit')
  })
})

describe('browser script download limits', () => {
  it('cancels oversized streaming responses before buffering the entire body', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)) },
      cancel,
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))
    try {
      await expect(browserIo().fetchText('https://example.invalid/enums.js')).rejects.toThrow('module size limit')
      expect(cancel).toHaveBeenCalledOnce()
    } finally { vi.unstubAllGlobals() }
  })
})
