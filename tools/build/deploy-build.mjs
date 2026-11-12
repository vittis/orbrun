import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertDeployable } from './deploy-guard.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))

/** Wrangler calls this before packaging/uploading, including direct CLI deployments. */
export function prepareDeployment({ cwd = root, command = process.env.WRANGLER_COMMAND, build } = {}) {
  // Local Worker development still builds assets, without imposing production Git rules.
  const deploying = command !== 'dev'
  const before = deploying ? assertDeployable(cwd) : null
  if (build) build()
  else execFileSync('npm', ['run', 'build'], { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (deploying) {
    const after = assertDeployable(cwd)
    if (before !== after) throw new Error('Deployment refused: HEAD changed during the build. Retry to rebuild the current commit.')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { prepareDeployment() }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
