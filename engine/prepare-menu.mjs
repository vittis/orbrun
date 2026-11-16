// The guarded app deployment provisions its own pinned demo assets. No engine service or upload step.
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { recipe } from './recipe.mjs'

const root = import.meta.dirname
let ready = false
try {
  const pointer = JSON.parse(readFileSync(join(root, 'dist/menu/engine.json'), 'utf8'))
  const commit = readFileSync(join(root, 'menu-commit'), 'utf8').trim()
  ready = pointer.commit === commit && pointer.recipe === recipe()
    && pointer.build === `${commit}-${recipe()}` && pointer.files.length > 0
    && pointer.files.every(([file, size]) => statSync(join(root, 'dist', file)).size === size)
} catch { /* missing or incomplete build */ }
if (!ready) execFileSync('sh', [join(root, 'menu-build.sh')], { stdio: 'inherit' })
else console.log('Pinned menu engine is ready.')
