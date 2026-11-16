import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

function signature(cwd) {
  const hash = createHash('sha256')
  const paths = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd, encoding: 'utf8' })
    .split('\0').filter(Boolean).filter(path => !/(^|\/)(test|tests|testbed|project-notes|\.github)\//.test(path) && path !== 'AGENTS.md').sort()
  for (const path of paths) {
    hash.update(path + '\0')
    hash.update(existsSync(join(cwd, path)) ? readFileSync(join(cwd, path)) : 'deleted')
  }
  hash.update(process.version).update(process.env.NODE_ENV ?? 'production')
  return hash.digest('hex')
}

/** Only package changed app inputs. Git review and focused checks happen before publishing. */
export function prepareDeployment({ cwd = root, command = process.env.WRANGLER_COMMAND, build } = {}) {
  const deploying = command !== 'dev'
  const dist = join(cwd, 'apps/orbrun/dist'), stamp = join(dist, '.deploy-build.json')
  if (deploying && !build) execFileSync(process.execPath, [resolve(cwd, 'engine/prepare-menu.mjs')], { cwd, stdio: 'inherit' })
  const current = signature(cwd)
  try {
    const saved = JSON.parse(readFileSync(stamp, 'utf8'))
    if (deploying && saved.signature === current && saved.files.length && saved.files.every(path => existsSync(join(dist, path)))) {
      console.log('App inputs unchanged; reusing the production build.')
      return
    }
  } catch { /* first build or removed output */ }
  if (build) build()
  else execFileSync('npm', ['run', 'build'], { cwd, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, ...(deploying ? { REQUIRE_MENU_ENGINE: '1' } : {}) } })
  if (deploying && existsSync(dist)) {
    const files = readdirSync(dist, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name !== '.deploy-build.json')
      .map(entry => join(entry.parentPath, entry.name).slice(dist.length + 1))
    writeFileSync(stamp, JSON.stringify({ signature: current, files }))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { prepareDeployment() }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
