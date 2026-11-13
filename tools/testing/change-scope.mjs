import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Conservative CI routing. Unknown paths run every gate; never silently skip new tooling.
 * @param {string[]} paths
 */
export function changeScope(paths) {
  const scope = { code: false, browser: 'none', production: false, deploy: false }
  const full = () => Object.assign(scope, { code: true, browser: 'full', production: true, deploy: true })
  for (const path of paths) {
    // ABOUT/INSTALL/STEAM/CHANGELOG are built into the site and are NOT docs-only.
    if (/^project-notes\/.*\.(?:md|json|png|jpg)$/.test(path) || /^(README|CONTRIBUTING|AGENTS)\.md$/.test(path)) continue
    scope.code = true
    if (/^(tools\/testing\/|tests\/browser\/|\.github\/|(?:package(?:-lock)?\.json|.*config\.[^/]+)$)/.test(path)) { full(); continue }
    if (/^tools\/build\//.test(path) || path === 'apps/orbrun/test/deploy-guard.test.ts') {
      scope.deploy = true; scope.production = true; continue
    }
    if (/^(apps\/[^/]+\/test\/|packages\/[^/]+\/test\/)/.test(path)) continue
    if (/^packages\/(render-2(?:\.5)?d|scene(?:-webtiles)?)\//.test(path) || /^apps\/orbrun\/(testbed|public\/room|src\/room)\//.test(path)) {
      scope.browser = 'full'; continue
    }
    if (/^apps\/orbrun\/src\/(?:main|menu|site|servers|count|analytics|markdown)\.ts$/.test(path)) scope.production = true
    if (/^apps\/orbrun\/src\//.test(path) || /^packages\/(webtiles|gamedata)\//.test(path)) {
      if (scope.browser === 'none') scope.browser = 'smoke'
      continue
    }
    if (/^packages\/(offline|vault)\//.test(path)) continue
    if (/^apps\/orbrun\/(worker\/|public\/|site\/|[^/]+$)/.test(path) || /^(ABOUT|INSTALL|STEAM|CHANGELOG)\.md$/.test(path)) {
      scope.production = true
      if (scope.browser === 'none') scope.browser = 'smoke'
      continue
    }
    full()
  }
  return scope
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2]
  if (!base) throw new Error('Usage: node tools/testing/change-scope.mjs <base-commit> [head-commit]')
  // Include both sides of renames so moving code into a docs path cannot hide it.
  const paths = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', base, process.argv[3] ?? 'HEAD'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  const scope = changeScope(paths)
  console.log(JSON.stringify({ paths, ...scope }, null, 2))
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    Object.entries(scope).map(([key, value]) => `${key}=${value}\n`).join(''))
}
