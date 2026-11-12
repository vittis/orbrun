import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

// Sequential full-suite runs: concurrent benchmarks would compete for CPU.
// Every variant keeps file isolation, assertions and timeouts unchanged.
const { values } = parseArgs({ options: {
  rounds: { type: 'string', default: '2' },
  output: { type: 'string' },
  cases: { type: 'string' },
} })
const rounds = Number(values.rounds)
if (!Number.isInteger(rounds) || rounds < 1) throw new Error('--rounds must be a positive integer')
const root = fileURLToPath(new URL('../../', import.meta.url))
const output = resolve(values.output ?? mkdtempSync(join(tmpdir(), 'orbrun-vitest-')))
mkdirSync(output, { recursive: true })
const variants = [
  { name: 'forks-default', args: ['--pool=forks',
    `--minWorkers=${Math.max(availableParallelism() - 1, 1)}`,
    `--maxWorkers=${Math.max(availableParallelism() - 1, 1)}`] },
  { name: 'threads-all', args: ['--pool=threads', '--minWorkers=1', '--maxWorkers=100%'] },
  ...[1, 2, 4].flatMap((workers) => ['forks', 'threads'].map((pool) => ({
    name: `${pool}-${workers}`,
    args: [`--pool=${pool}`, '--minWorkers=1', `--maxWorkers=${workers}`],
  }))),
]
const selected = values.cases ? values.cases.split(',') : variants.map((v) => v.name)
if (selected.some((name) => !variants.some((v) => v.name === name))) throw new Error('Unknown benchmark case')
const cases = selected.map((name) => variants.find((v) => v.name === name))
const results = []
let expected
let failed = false
for (let round = 1; round <= rounds; round++) {
  for (const variant of round % 2 ? cases : [...cases].reverse()) {
    const name = `${variant.name}-${round}`
    const reportPath = join(output, `${name}.json`)
    const start = performance.now()
    const run = spawnSync(process.execPath, [
      join(root, 'node_modules/vitest/vitest.mjs'), 'run',
      '--isolate', '--reporter=json', `--outputFile=${reportPath}`, ...variant.args,
    ], { cwd: root, env: { ...process.env, NODE_ENV: 'test' }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    const seconds = Number(((performance.now() - start) / 1000).toFixed(2))
    writeFileSync(join(output, `${name}.log`), (run.stdout ?? '') + (run.stderr ?? ''))
    if (run.error) throw run.error
    const report = JSON.parse(readFileSync(reportPath, 'utf8'))
    const inventory = report.testResults.flatMap((file) => file.assertionResults.map((test) =>
      JSON.stringify([relative(root, file.name), test.fullName, test.status === 'pending' ? 'pending' : 'active']),
    )).sort()
    expected ??= inventory
    const sameTests = JSON.stringify(inventory) === JSON.stringify(expected)
    const row = { case: variant.name, round, seconds, exitCode: run.status,
      passed: report.numPassedTests, skipped: report.numPendingTests, failed: report.numFailedTests, sameTests }
    results.push(row)
    failed ||= run.status !== 0 || !sameTests
    writeFileSync(join(output, 'results.json'), JSON.stringify({
      node: process.version, platform: process.platform, availableParallelism: availableParallelism(), results,
    }, null, 2) + '\n')
    console.log(JSON.stringify(row))
  }
}
console.table(cases.map(({ name }) => {
  const samples = results.filter((row) => row.case === name)
  const seconds = samples.map((row) => row.seconds).sort((a, b) => a - b)
  const median = (seconds[Math.floor((seconds.length - 1) / 2)] + seconds[Math.floor(seconds.length / 2)]) / 2
  return { case: name, medianSeconds: Number(median.toFixed(2)),
    passed: samples.every((row) => row.exitCode === 0 && row.sameTests) }
}))
console.log(`Reports: ${output}`)
process.exitCode = failed ? 1 : 0
