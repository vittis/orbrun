import { cpSync, createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, extname, join } from 'node:path'
import type { Plugin } from 'vite'

const ENGINE = join(import.meta.dirname, '../../engine')
const PREFIX = '/menu-engine/'
const ENGINE_FILES = ['crawl.js', 'crawl.wasm', 'crawl.data', 'prewarm/manifest.json', 'prewarm/prewarm.bin']
const ATLASES = ['floor', 'wall', 'feat', 'main', 'player', 'gui', 'icons']
const DATA_FILES = ['enums.js', 'status-icon-sizes.js', ...ATLASES.flatMap(a => [`tileinfo-${a}.js`, `${a}.png`])]

/** A fixed, closed file set: never publish offline channels, saves or arbitrary engine files. */
export function menuEngineFiles(root: string, commit: string, recipe: string) {
  const pointer = JSON.parse(readFileSync(join(root, 'menu/engine.json'), 'utf8')) as { commit: string; build: string; gamedata: string; recipe: string }
  if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-f0-9]{16}$/.test(recipe)
    || pointer.commit !== commit || pointer.gamedata !== commit || pointer.recipe !== recipe || pointer.build !== `${commit}-${recipe}`) {
    throw new Error('Menu engine is stale; rebuild with sh engine/build.sh menu')
  }
  const manifest = { protocol: 1, build: pointer.build, gamedata: pointer.gamedata }
  const paths = [...ENGINE_FILES.map(file => `builds/${pointer.build}/${file}`), ...DATA_FILES.map(file => `gamedata/${commit}/${file}`)]
  const files = paths.map(path => {
    const source = join(root, path), stat = statSync(source)
    if (!stat.isFile() || stat.size === 0 || stat.size > 25 * 1024 * 1024) throw new Error(`Invalid menu engine asset: ${path}`)
    return { path, source, size: stat.size }
  })
  return { manifest, files }
}

export function menuEngineAssets(): Plugin {
  const load = () => menuEngineFiles(join(ENGINE, 'dist'), readFileSync(join(ENGINE, 'menu-commit'), 'utf8').trim(),
    execFileSync(process.execPath, [join(ENGINE, 'recipe.mjs')], { encoding: 'utf8' }).trim())
  let assets: ReturnType<typeof load> | undefined
  return {
    name: 'orbrun-menu-engine',
    resolveId(id) { if (id === 'virtual:menu-engine') return '\0virtual:menu-engine' },
    load(id) {
      if (id !== '\0virtual:menu-engine') return
      // Pin startup URLs in the hashed app bundle: repeat visits need no manifest round trip.
      let manifest = null
      try { manifest = load().manifest } catch { /* ordinary builds may omit the engine */ }
      return `export default ${JSON.stringify(manifest)}`
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0]
        if (!path?.startsWith(PREFIX)) return next()
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end(); return }
        try { assets ??= load() } catch { res.statusCode = 404; res.end(); return }
        const relative = path.slice(PREFIX.length)
        res.setHeader('Cache-Control', 'no-cache')
        if (relative === 'manifest.json') {
          res.setHeader('Content-Type', 'application/json')
          res.end(req.method === 'HEAD' ? undefined : JSON.stringify(assets.manifest)); return
        }
        const file = assets.files.find(f => f.path === relative)
        if (!file) { res.statusCode = 404; res.end(); return }
        res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png' } as Record<string, string>)[extname(file.path)] ?? 'application/octet-stream')
        res.setHeader('Content-Length', file.size)
        if (req.method === 'HEAD') res.end()
        else createReadStream(file.source).pipe(res)
      })
    },
    writeBundle(options) {
      let built: ReturnType<typeof load>
      try { built = load() } catch (error) {
        if (process.env.REQUIRE_MENU_ENGINE === '1') throw error
        this.warn('Menu engine not provisioned/current: static poster fallback. Run sh engine/build.sh menu. Publishing requires REQUIRE_MENU_ENGINE=1.')
        return
      }
      const out = join(options.dir!, 'menu-engine')
      for (const file of built.files) {
        const destination = join(out, file.path)
        mkdirSync(dirname(destination), { recursive: true }); cpSync(file.source, destination)
      }
      writeFileSync(join(out, 'manifest.json'), JSON.stringify(built.manifest) + '\n')
    },
  }
}
