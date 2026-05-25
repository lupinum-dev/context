import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import {
  createBenchmarkFixturePlan,
  createBenchmarkReport,
  evaluateThresholds,
  formatMarkdownReport,
  parseBenchmarkArgs,
  type BenchmarkResult,
} from '../bench/benchmarkHarness'

const BENCHMARK_NAMES = [
  'index:refresh',
  'snapshot:hot',
  'selection:derive',
  'tree:selected',
  'tree:full',
  'preflight:selected',
  'context:selected-readable',
  'context:selected-compact',
  'file-safety:mixed',
  'git-diff:synthetic',
]

test('benchmark args default to smoke and parse scale/files overrides', () => {
  assert.deepEqual(parseBenchmarkArgs([]), { scale: 'smoke', files: undefined })
  assert.deepEqual(parseBenchmarkArgs(['--scale', 'large', '--files', '50000']), {
    scale: 'large',
    files: 50_000,
  })
  assert.deepEqual(parseBenchmarkArgs(['--large', '--files=100000']), {
    scale: 'large',
    files: 100_000,
  })
})

test('benchmark fixture generator is deterministic and includes safety coverage', () => {
  const first = createBenchmarkFixturePlan({ scale: 'smoke' })
  const second = createBenchmarkFixturePlan({ scale: 'smoke' })

  assert.deepEqual(first.rawFiles, second.rawFiles)
  assert.equal(first.rawFiles.length, 1_000)
  assert.equal(first.selectedFiles.length, 250)
  assert.ok(first.rawFiles.some((file) => file.kind === 'ignored'))
  assert.ok(first.selectedFiles.some((file) => file.kind === 'binary'))
  assert.ok(first.selectedFiles.some((file) => file.kind === 'oversized'))
  assert.equal(
    first.indexedFiles.some((file) => file.kind === 'ignored'),
    false,
  )
})

test('benchmark report formatting includes results and smoke threshold status', () => {
  const fixture = createBenchmarkFixturePlan({ scale: 'smoke' })
  const results = BENCHMARK_NAMES.map((name): BenchmarkResult => createResult(name, 1))
  const report = createBenchmarkReport({
    rootDir: '/tmp/bench',
    fixture,
    results,
    memoryBefore: 100,
    memoryAfter: 200,
  })
  const markdown = formatMarkdownReport(report)

  assert.equal(report.results.length, BENCHMARK_NAMES.length)
  assert.equal(report.thresholds.length, BENCHMARK_NAMES.length)
  assert.ok(report.thresholds.every((threshold) => threshold.passed))
  assert.match(markdown, /## Results/)
  assert.match(markdown, /index:refresh/)
  assert.match(markdown, /## Smoke Thresholds/)
})

test('benchmark smoke thresholds fail only when measured means exceed budgets', () => {
  const thresholds = evaluateThresholds('smoke', [
    createResult('index:refresh', 501),
    createResult('tree:selected', 1),
  ])

  assert.deepEqual(
    thresholds.map((threshold) => ({ name: threshold.name, passed: threshold.passed })),
    [
      { name: 'index:refresh', passed: false },
      { name: 'tree:selected', passed: true },
    ],
  )
  assert.deepEqual(evaluateThresholds('large', [createResult('index:refresh', 9999)]), [])
})

function createResult(name: string, meanMs: number): BenchmarkResult {
  return {
    name,
    description: name,
    iterations: 4,
    meanMs,
    minMs: meanMs,
    maxMs: meanMs,
    p95Ms: meanMs,
  }
}
