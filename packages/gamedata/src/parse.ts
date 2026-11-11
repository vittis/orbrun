import { parse, type Node, type Expression, type Statement, type FunctionExpression, type FunctionDeclaration, type MemberExpression } from 'acorn'
import type { AtlasName, Enums, FlagWord, TileInfoRaw } from './index.js'
import { ENUM_FUNCTION_TEMPLATE } from './enum-template.ts'

// Limits cover the generated tables in the recorded and live servers while
// bounding parser work and allocations. No source-controlled loops are run.
export const MAX_MODULE_CHARS = 4 * 1024 * 1024
const MAX_TOKENS = 600_000
const MAX_NODES = 400_000
const MAX_DEPTH = 64
const MAX_ARRAY = 100_000
const MAX_PROPERTIES = 100_000
type Data = number | string | boolean | null | undefined | Data[] | { [key: string]: Data }
type Dictionary = { [key: string]: Data }
type RemoteFunction = FunctionExpression | FunctionDeclaration
type Kind = AtlasName | 'enums' | 'status-icons'
const PREVIOUS: Record<AtlasName, string | null> = {
  floor: null, wall: 'floor', feat: 'wall', main: 'feat', player: 'main', gui: 'player', icons: 'gui',
}
const MAX_KEY: Record<AtlasName, string> = {
  floor: 'TILE_FLOOR_MAX', wall: 'TILE_WALL_MAX', feat: 'TILE_FEAT_MAX', main: 'TILE_MAIN_MAX',
  player: 'TILEP_PLAYER_MAX', gui: 'TILEG_GUI_MAX', icons: 'TILEI_ICONS_MAX',
}

function fail(message: string): never { throw new Error(`unsupported gamedata: ${message}`) }
function safeKey(key: string): string {
  if (['__proto__', 'prototype', 'constructor'].includes(key)) fail(`forbidden property ${key}`)
  return key
}
function record(value: Data): Dictionary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected a data object')
  return value
}
function numeric(value: Data): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('expected a finite number')
  return value
}
function integer(value: Data, min = 0, max = 1_000_000): number {
  const n = numeric(value)
  if (!Number.isInteger(n) || n < min || n > max) fail('integer outside supported bounds')
  return n
}
function list(value: Data): Data[] {
  if (!Array.isArray(value) || value.length > MAX_ARRAY) fail('expected a bounded data array')
  return value
}

/** Acorn parses syntax only. The token callback stops excessive nesting before
 * the parser recurses; the AST walk bounds non-bracket expression chains too. */
function syntax(src: string) {
  if (src.length > MAX_MODULE_CHARS) fail('module size limit exceeded')
  let tokens = 0, nesting = 0
  const ast = parse(src, {
    ecmaVersion: 2020,
    onToken(token) {
      if (++tokens > MAX_TOKENS) fail('token limit exceeded')
      const label = token.type.label
      if (label === '(' || label === '[' || label === '{' || label === '${') {
        if (++nesting > MAX_DEPTH) fail('nesting limit exceeded')
      } else if (label === ')' || label === ']' || label === '}') nesting--
    },
  })
  const pending: [unknown, number][] = [[ast, 0]]
  let nodes = 0
  while (pending.length) {
    const [value, depth] = pending.pop()!
    if (!value || typeof value !== 'object') continue
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail('AST size or depth limit exceeded')
    for (const child of Object.values(value)) if (child && typeof child === 'object') pending.push([child, depth + 1])
  }
  return ast
}

/** Comparison ignores source locations and spelling of literals, not code. */
function shape(node: Node): string {
  return JSON.stringify(node, (key, value) => ['start', 'end', 'loc', 'range', 'raw'].includes(key) ? undefined : value)
}
let enumFunctions: Map<string, string> | undefined
function enumTemplates(): Map<string, string> {
  if (enumFunctions) return enumFunctions
  const functions = new Map<string, string>()
  for (const statement of syntax(ENUM_FUNCTION_TEMPLATE).body) {
    if (statement.type === 'FunctionDeclaration') functions.set(statement.id!.name, shape(statement))
    else if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression') {
      const lhs = statement.expression.left as MemberExpression
      if (lhs.property.type === 'Identifier') functions.set(lhs.property.name, shape(statement.expression.right))
    }
  }
  return enumFunctions = functions
}

/** A reader for generated declarations, not a JavaScript interpreter. Only
 * local data objects can be written; dependencies are read-only plain data. */
class Declarations {
  readonly locals = new Map<string, Data>()
  readonly functions = new Map<string, RemoteFunction>()
  readonly kind: Kind
  readonly parameter: string | undefined
  private owned = new WeakSet<object>()
  private properties = 0

  constructor(kind: Kind, parameter: string | undefined, dependency?: Record<string, unknown>) {
    this.kind = kind
    this.parameter = parameter
    if (parameter) this.locals.set(parameter, dependency as Dictionary | undefined)
  }

  private object(): Dictionary {
    const obj: Dictionary = Object.create(null)
    this.owned.add(obj)
    return obj
  }
  private key(node: MemberExpression): string {
    if (node.computed || node.property.type !== 'Identifier') fail('computed member access')
    return safeKey(node.property.name)
  }
  private get(node: Expression): Data {
    if (node.type === 'Identifier') {
      safeKey(node.name)
      if (!this.locals.has(node.name)) fail(`unknown binding ${node.name}`)
      return this.locals.get(node.name)
    }
    if (node.type === 'MemberExpression') {
      const obj = record(this.value(node.object as Expression))
      const key = this.key(node)
      if (!Object.hasOwn(obj, key)) fail(`unknown data property ${key}`)
      return obj[key]
    }
    return fail(`unsupported reference ${node.type}`)
  }
  private set(node: Expression, value: Data): Data {
    if (node.type === 'Identifier') {
      safeKey(node.name)
      if (!this.locals.has(node.name)) fail(`undeclared binding ${node.name}`)
      this.locals.set(node.name, value)
      return value
    }
    if (node.type !== 'MemberExpression') fail('invalid assignment target')
    const obj = record(this.value(node.object as Expression))
    const key = this.key(node)
    if (!this.owned.has(obj)) fail('dependency mutation')
    if (++this.properties > MAX_PROPERTIES) fail('data property limit exceeded')
    obj[key] = value
    return value
  }

  value(node: Expression): Data {
    switch (node.type) {
      case 'Literal': {
        const value = node.value
        if (value === null || typeof value === 'boolean') return value
        if (typeof value === 'number') return numeric(value)
        if (typeof value === 'string' && value.length <= 1024) return value
        return fail('unsupported literal')
      }
      case 'Identifier': case 'MemberExpression': return this.get(node)
      case 'ArrayExpression': {
        if (node.elements.length > MAX_ARRAY) fail('array size limit exceeded')
        const array = node.elements.map((entry) => {
          if (!entry || entry.type === 'SpreadElement') fail('sparse array or spread')
          return this.value(entry)
        })
        this.owned.add(array)
        return array
      }
      case 'ObjectExpression': {
        const obj = this.object()
        for (const property of node.properties) {
          if (property.type !== 'Property' || property.kind !== 'init' || property.method || property.computed || property.shorthand) fail('object accessor, method or spread')
          const key = property.key.type === 'Identifier' ? property.key.name : property.key.type === 'Literal' ? String(property.key.value) : fail('object key')
          safeKey(key)
          if (++this.properties > MAX_PROPERTIES) fail('data property limit exceeded')
          obj[key] = this.value(property.value as Expression)
        }
        return obj
      }
      case 'AssignmentExpression':
        if (node.operator !== '=') fail('compound assignment')
        return this.set(node.left as Expression, this.value(node.right))
      case 'UpdateExpression': {
        if (node.operator !== '++' || node.argument.type !== 'Identifier') fail('unsupported increment')
        const before = numeric(this.get(node.argument))
        const after = numeric(before + 1)
        this.set(node.argument, after)
        return node.prefix ? after : before
      }
      case 'UnaryExpression': {
        const value = numeric(this.value(node.argument))
        if (node.operator === '-') return -value
        if (node.operator === '+') return value
        if (node.operator === '~') return ~value
        return fail('unary operator')
      }
      case 'BinaryExpression': {
        const left = numeric(this.value(node.left as Expression)), right = numeric(this.value(node.right))
        switch (node.operator) {
          case '+': return numeric(left + right)
          case '-': return numeric(left - right)
          case '|': return left | right
          case '&': return left & right
          case '^': return left ^ right
          case '<<': return left << right
          case '>>': return left >> right
          case '>>>': return left >>> right
          default: return fail(`binary operator ${node.operator}`)
        }
      }
      default: return fail(`expression ${node.type}`)
    }
  }

  read(statements: Statement[]) {
    if (statements.at(-1)?.type !== 'ReturnStatement') fail('module must end with return exports')
    for (const statement of statements) {
      if (statement.type === 'VariableDeclaration') {
        if (statement.kind !== 'var') fail('unsupported declaration')
        for (const declaration of statement.declarations) {
          if (declaration.id.type !== 'Identifier') fail('binding pattern')
          const name = safeKey(declaration.id.name)
          if (this.locals.has(name)) fail(`duplicate binding ${name}`)
          this.locals.set(name, declaration.init ? this.value(declaration.init) : undefined)
        }
      } else if (statement.type === 'FunctionDeclaration') {
        if (!statement.id || this.kind !== 'enums') fail('unexpected helper function')
        this.function(statement.id.name, statement)
      } else if (statement.type === 'ReturnStatement') {
        if (statement !== statements.at(-1) || statement.argument?.type !== 'Identifier' || statement.argument.name !== 'exports') fail('unexpected return')
      } else if (statement.type === 'ExpressionStatement') {
        this.declarationExpression(statement.expression)
      } else if (statement.type !== 'EmptyStatement') fail(`statement ${statement.type}`)
    }
  }

  private declarationExpression(expression: Expression) {
    if (expression.type === 'Literal' && expression.value === 'use strict') return
    // Current trunk separates two flag assignments and a table append
    // with commas. Every constituent still obeys the same data grammar.
    if (expression.type === 'SequenceExpression') {
      for (const part of expression.expressions) this.declarationExpression(part)
    } else if (expression.type === 'AssignmentExpression' && expression.right.type === 'FunctionExpression') {
      const lhs = expression.left
      if (expression.operator !== '=' || lhs.type !== 'MemberExpression' || lhs.object.type !== 'Identifier' || lhs.object.name !== 'exports') fail('function assignment')
      this.function(this.key(lhs), expression.right)
    } else if (expression.type === 'CallExpression') {
      // Only a generated flag table append is accepted. This never looks
      // up or calls a method supplied by the module.
      const callee = expression.callee
      if (this.kind !== 'enums' || callee.type !== 'MemberExpression' || this.key(callee) !== 'push' || expression.arguments.length !== 1) fail('function call')
      const array = list(this.value(callee.object as Expression))
      const argument = expression.arguments[0]
      if (!this.owned.has(array) || array.length >= MAX_ARRAY || argument.type === 'SpreadElement') fail('invalid array append')
      array.push(this.value(argument))
    } else this.value(expression)
  }

  private function(name: string, fn: RemoteFunction) {
    if (this.functions.has(name)) fail(`duplicate function ${name}`)
    if (this.kind === 'enums' && enumTemplates().get(name) !== shape(fn)) fail(`changed enum helper ${name}`)
    this.functions.set(name, fn)
  }
}

function moduleData(src: string, kind: Kind, dependency?: Record<string, unknown>) {
  const ast = syntax(src)
  if (ast.body.length !== 1 || ast.body[0].type !== 'ExpressionStatement') fail('expected one AMD define')
  const call = ast.body[0].expression
  if (call.type !== 'CallExpression' || call.callee.type !== 'Identifier' || call.callee.name !== 'define') fail('expected AMD define')
  const args = call.arguments
  const fn = args.at(-1)
  if ((args.length !== 1 && args.length !== 2) || fn?.type !== 'FunctionExpression' || fn.async || fn.generator) fail('AMD factory')
  const expectedDep = kind === 'enums' ? null : kind === 'status-icons' ? 'icons' : PREVIOUS[kind]
  const deps = args.length === 2 ? args[0] : null
  if (deps && deps.type !== 'ArrayExpression') fail('AMD dependencies')
  const entries = deps?.type === 'ArrayExpression' ? deps.elements : []
  if (entries.length !== (expectedDep ? 1 : 0) || (expectedDep && (entries[0]?.type !== 'Literal' || entries[0].value !== `./tileinfo-${expectedDep}`))) fail('unexpected AMD dependency')
  if (fn.params.length > 1 || (fn.params[0] && fn.params[0].type !== 'Identifier') || (expectedDep && fn.params.length !== 1)) fail('AMD parameters')
  const parameter = fn.params[0]?.type === 'Identifier' ? fn.params[0].name : undefined
  const data = new Declarations(kind, parameter, dependency)
  data.read(fn.body.body)
  return data
}

interface FlagData { flags: Record<string, number[]>; exclusive: Record<string, number[]>[]; mask: number }
function flagData(value: Data): FlagData {
  const data = record(value)
  const words = (value: Data): number[] => {
    const parts = Array.isArray(value) ? value : [value]
    if (parts.length < 1 || parts.length > 2) fail('flag mask must contain one or two words')
    return parts.map((part) => integer(part, -0x80000000, 0xffffffff))
  }
  const table = (value: Data, max: number, allowMask = false) => {
    const entries = Object.entries(record(value))
    if (entries.length > max) fail('flag table size limit exceeded')
    return Object.fromEntries(entries.map(([name, value]) => {
      // Flags become named properties of an Array. Numeric/length/prototype
      // keys must never be accepted, even though input dictionaries are safe.
      if (!/^[A-Z][A-Z0-9_]*$/.test(name) && !(allowMask && name === 'mask')) fail(`invalid flag name ${name}`)
      return [name, words(value)]
    }))
  }
  const groups = list(data.exclusive_flags)
  if (groups.length > 32) fail('exclusive flag group limit exceeded')
  const exclusive = groups.map((group) => table(group, 64, true))
  if (exclusive.some((entry) => !entry.mask)) fail('exclusive flag group missing mask')
  return { flags: table(data.flags, 256), exclusive, mask: integer(data.mask, -0x80000000, 0xffffffff) }
}

/** Local flag decoder. Remote helpers are verified templates, never called. */
function decoder(data: FlagData): Enums['prepare_fg_flags'] {
  const cache = new Map<string, FlagWord>()
  return (word) => {
    const source = typeof word === 'number' ? [word] : word
    if (!Array.isArray(source) || source.length > 2 || source.some((part) => typeof part !== 'number' || !Number.isFinite(part))) throw new Error('invalid tile flag word')
    const key = `${source[0] || 0}:${source[1] || 0}`
    const existing = cache.get(key)
    if (existing) return existing
    const out = [source[0] || 0, source[1] || 0] as FlagWord
    for (const [name, mask] of Object.entries(data.flags)) out[name] = mask.some((part, index) => (out[index] & part) !== 0)
    for (const group of data.exclusive) {
      const masked = group.mask.map((part, index) => out[index] & part)
      for (const [name, value] of Object.entries(group)) if (name !== 'mask') {
        out[name] = Array.from({ length: Math.max(masked.length, value.length) }, (_, i) => (masked[i] || 0) === (value[i] || 0)).every(Boolean)
      }
    }
    out.value = out[0] & data.mask
    if (cache.size >= 250) cache.clear()
    cache.set(key, out)
    return out
  }
}

export function parseEnums(src: string): Enums {
  const data = moduleData(src, 'enums')
  if (data.functions.size !== enumTemplates().size) fail('missing enum helper')
  const exports = record(data.locals.get('exports'))
  for (const key of ['mouse_mode', 'menu_flag', 'texture']) {
    for (const value of Object.values(record(exports[key]))) integer(value)
  }
  return Object.assign(exports, {
    prepare_fg_flags: decoder(flagData(data.locals.get('fg_flags'))),
    prepare_bg_flags: decoder(flagData(data.locals.get('bg_flags'))),
    reverse_lookup: (table: Record<string, unknown>, value: unknown) => Object.keys(table).find((key) => table[key] === value),
  }) as unknown as Enums
}

function expectFunction(actual: RemoteFunction | undefined, expected: string, name: string) {
  const ast = syntax(`(${expected})`)
  const statement = ast.body[0]
  if (!actual || statement.type !== 'ExpressionStatement' || shape(actual) !== shape(statement.expression)) fail(`changed tile helper ${name}`)
}

export function parseTiles(src: string, atlas: AtlasName, dependency?: Record<string, unknown>): Record<string, unknown> {
  const data = moduleData(src, atlas, dependency)
  const exports = record(data.locals.get('exports'))
  const previous = PREVIOUS[atlas] as AtlasName | null
  const first = previous ? integer(dependency?.[MAX_KEY[previous]] as Data) : 0
  const end = integer(exports[MAX_KEY[atlas]])
  if (end < first || end - first > MAX_ARRAY) fail('tile range')
  const fn = data.functions.get('get_tile_info')
  // The generated accessor's dependency parameter is the AMD parameter. Its
  // spelling is read from the syntax, never interpolated from source text.
  const depName = data.parameter ?? 'm'
  const offset = previous ? `${depName}.${MAX_KEY[previous]}` : '0'
  expectFunction(fn, `function (idx) { return tile_info[idx - ${offset}]; }`, 'get_tile_info')
  expectFunction(data.functions.get('tile_count'), `function (idx) { return _tile_count[idx - ${offset}]; }`, 'tile_count')
  expectFunction(data.functions.get('basetile'), `function (idx) { return _basetiles[idx - ${offset}] + ${offset}; }`, 'basetile')
  expectFunction(data.functions.get('get_img'), `function (idx) { return "${atlas}"; }`, 'get_img')
  if (data.functions.size !== 4) fail('unexpected tile helper')
  const info = list(data.locals.get('tile_info')).map((value) => {
    const row = record(value)
    for (const key of ['w', 'h', 'ox', 'oy', 'sx', 'sy', 'ex', 'ey']) integer(row[key], key === 'ox' || key === 'oy' ? -4096 : 0, 32768)
    if (numeric(row.ex) < numeric(row.sx) || numeric(row.ey) < numeric(row.sy)) fail('reversed tile rectangle')
    return row as unknown as TileInfoRaw
  })
  const count = list(data.locals.get('_tile_count')).map((value) => integer(value, 1, MAX_ARRAY))
  const bases = list(data.locals.get('_basetiles')).map((value) => integer(value, 0, Math.max(0, end - first - 1)))
  if ([info, count, bases].some((rows) => rows.length !== end - first)) fail('tile table length does not match range')
  for (const value of Object.values(exports)) integer(value)
  return Object.assign(exports, {
    get_tile_info: (id: number) => info[id - first],
    tile_count: (id: number) => count[id - first],
    basetile: (id: number) => bases[id - first] + first,
    get_img: () => atlas,
  })
}

export function parseStatusIcons(src: string, icons: Record<string, unknown>): { status_icon_size: (id: number) => number } {
  const data = moduleData(src, 'status-icons', icons)
  const fn = data.functions.get('status_icon_size')
  if (data.functions.size !== 1 || !fn || fn.async || fn.generator || fn.params.length !== 1 || fn.params[0].type !== 'Identifier' || fn.body.type !== 'BlockStatement' || fn.body.body.length !== 1) fail('status icon helper')
  const switchNode = fn.body.body[0]
  if (switchNode.type !== 'SwitchStatement' || switchNode.discriminant.type !== 'Identifier' || switchNode.discriminant.name !== fn.params[0].name) fail('status icon switch')
  const sizes = new Map<number, number>()
  let pending: number[] = [], fallback: number | undefined
  for (const branch of switchNode.cases) {
    if (branch.test) pending.push(integer(data.value(branch.test)))
    else if (branch !== switchNode.cases.at(-1)) fail('status default must be last')
    if (!branch.consequent.length) continue
    const ret = branch.consequent[0]
    if (branch.consequent.length !== 1 || ret.type !== 'ReturnStatement' || !ret.argument) fail('status icon return')
    const size = integer(data.value(ret.argument), -1, 1024)
    for (const id of pending) sizes.set(id, size)
    pending = []
    if (!branch.test) fallback = size
  }
  if (fallback === undefined || pending.length) fail('status icon default missing')
  return { status_icon_size: (id) => sizes.get(id) ?? fallback! }
}
