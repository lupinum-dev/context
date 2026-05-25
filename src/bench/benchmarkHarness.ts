import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { performance } from 'perf_hooks'
import { ContextWorkflow } from '../app/ContextWorkflow'
import { assembleContext } from '../core/context/ContextAssembler'
import { generateFileStructureTree } from '../core/context/ProjectTreeBuilder'
import { FileIndex, type FileIndexHost, type IndexedFile } from '../core/files/FileIndex'
import { FileSelection } from '../core/files/FileSelection'
import { formatReadableGitDiffs } from '../core/git/GitDiffFormatter'
import { getTokenEstimateProfile } from '../core/tokens/TokenEstimateProfiles'

export type BenchmarkScale = 'smoke' | 'large'

export interface BenchmarkCliOptions {
  scale: BenchmarkScale
  files?: number
}

export interface BenchmarkFixturePlan {
  scale: BenchmarkScale
  seed: number
  rawFiles: readonly FixtureFile[]
  indexedFiles: readonly FixtureFile[]
  selectedFiles: readonly FixtureFile[]
}

export interface FixtureFile {
  relativePath: string
  bytes: number
  kind: 'text' | 'binary' | 'oversized' | 'ignored'
}

export interface BenchmarkResult {
  name: string
  description: string
  iterations: number
  meanMs: number
  minMs: number
  maxMs: number
  p95Ms: number
}

export interface BenchmarkReport {
  generatedAt: string
  scale: BenchmarkScale
  fixture: {
    rootDir: string
    totalFiles: number
    indexedFiles: number
    selectedFiles: number
    totalBytes: number
    selectedBytes: number
    omittedFileCount: number
    largestFileBytes: number
    deepestPathSegments: number
  }
  memory: {
    beforeBytes: number
    afterBytes: number
  }
  results: readonly BenchmarkResult[]
  thresholds: readonly BenchmarkThresholdResult[]
}

export interface BenchmarkThresholdResult {
  name: string
  meanBudgetMs: number
  meanMs: number
  passed: boolean
}

interface BenchmarkCase {
  name: string
  description: string
  iterations: number
  run(): Promise<void> | void
}

interface BenchmarkState {
  rootDir: string
  workspace: { id: string; name: string; rootPath: string }
  fixture: BenchmarkFixturePlan
  index: FileIndex
  selection: FileSelection
  builder: ContextWorkflow
  selectedIndexedFiles: readonly IndexedFile[]
}

const SMOKE_TOTAL_FILES = 1_000
const SMOKE_SELECTED_FILES = 250
const LARGE_TOTAL_FILES = 10_000
const LARGE_SELECTED_FILES = 1_000
const SEED = 17

const SMOKE_THRESHOLDS = new Map([
  ['index:refresh', 500],
  ['snapshot:hot', 10],
  ['selection:derive', 50],
  ['tree:selected', 50],
  ['tree:full', 150],
  ['preflight:selected', 100],
  ['context:selected-readable', 250],
  ['context:selected-compact', 250],
  ['file-safety:mixed', 250],
  ['git-diff:synthetic', 100],
])

export function parseBenchmarkArgs(args: readonly string[]): BenchmarkCliOptions {
  let scale: BenchmarkScale = 'smoke'
  let files: number | undefined

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--scale') {
      scale = parseScale(args[index + 1])
      index += 1
      continue
    }
    if (arg === '--scale=large' || arg === '--large') {
      scale = 'large'
      continue
    }
    if (arg === '--scale=smoke') {
      scale = 'smoke'
      continue
    }
    if (arg === '--files') {
      files = parsePositiveInteger(args[index + 1], '--files')
      index += 1
      continue
    }
    if (arg.startsWith('--files=')) {
      files = parsePositiveInteger(arg.slice('--files='.length), '--files')
    }
  }

  return { scale, files }
}

export function createBenchmarkFixturePlan(options: BenchmarkCliOptions): BenchmarkFixturePlan {
  const totalFiles =
    options.files ?? (options.scale === 'large' ? LARGE_TOTAL_FILES : SMOKE_TOTAL_FILES)
  const selectedCount = options.scale === 'large' ? LARGE_SELECTED_FILES : SMOKE_SELECTED_FILES
  const ignoredCount = Math.max(1, Math.floor(totalFiles * 0.05))
  const normalCount = Math.max(0, totalFiles - ignoredCount - 2)
  const rawFiles: FixtureFile[] = []

  for (let index = 0; index < normalCount; index++) {
    rawFiles.push({
      relativePath: createNormalPath(index),
      bytes: createTextSize(index),
      kind: 'text',
    })
  }

  for (let index = 0; index < ignoredCount; index++) {
    rawFiles.push({
      relativePath: `vendor/generated/group-${index % 8}/ignored-${index}.js`,
      bytes: 256 + (index % 512),
      kind: 'ignored',
    })
  }

  rawFiles.push({
    relativePath: 'src/selected/safety/oversized-context-file.txt',
    bytes: 2_000_001,
    kind: 'oversized',
  })
  rawFiles.push({
    relativePath: 'src/selected/safety/binary-context-file.dat',
    bytes: 8_192,
    kind: 'binary',
  })

  const indexedFiles = rawFiles.filter((file) => file.kind !== 'ignored')
  const safeSelected = indexedFiles
    .filter((file) => file.kind === 'text')
    .slice(0, Math.max(0, selectedCount - 2))
  const selectedFiles = [
    ...safeSelected,
    ...indexedFiles.filter((file) => file.kind === 'oversized' || file.kind === 'binary'),
  ].slice(0, selectedCount)

  return {
    scale: options.scale,
    seed: SEED,
    rawFiles,
    indexedFiles,
    selectedFiles,
  }
}

export async function runBenchmarkCli(args: readonly string[], rootDir: string): Promise<void> {
  const options = parseBenchmarkArgs(args)
  const report = await runBenchmarkSuite(options)
  const reportBase = path.join(rootDir, 'benchmarks', 'reports', `latest-${options.scale}`)
  await mkdir(path.dirname(reportBase), { recursive: true })
  await writeFile(`${reportBase}.json`, `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(`${reportBase}.md`, formatMarkdownReport(report))
  printSummary(report)

  const failures = report.thresholds.filter((threshold) => !threshold.passed)
  if (options.scale === 'smoke' && failures.length > 0) {
    throw new Error(`Smoke benchmark thresholds failed: ${failures.map((f) => f.name).join(', ')}`)
  }
}

export async function runBenchmarkSuite(options: BenchmarkCliOptions): Promise<BenchmarkReport> {
  const fixture = createBenchmarkFixturePlan(options)
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'lupinum-context-bench-'))
  const memoryBefore = process.memoryUsage().heapUsed

  try {
    await writeFixture(rootDir, fixture)
    const state = await createBenchmarkState(rootDir, fixture)
    const results = []

    for (const benchmark of createBenchmarkCases(rootDir, fixture, state)) {
      results.push(await runBenchmark(benchmark))
    }

    const memoryAfter = process.memoryUsage().heapUsed
    const report = createBenchmarkReport({
      rootDir,
      fixture,
      results,
      memoryBefore,
      memoryAfter,
    })

    return report
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

export function createBenchmarkReport(input: {
  rootDir: string
  fixture: BenchmarkFixturePlan
  results: readonly BenchmarkResult[]
  memoryBefore: number
  memoryAfter: number
}): BenchmarkReport {
  const totalBytes = input.fixture.rawFiles.reduce((sum, file) => sum + file.bytes, 0)
  const selectedBytes = input.fixture.selectedFiles.reduce((sum, file) => sum + file.bytes, 0)

  return {
    generatedAt: new Date().toISOString(),
    scale: input.fixture.scale,
    fixture: {
      rootDir: input.rootDir,
      totalFiles: input.fixture.rawFiles.length,
      indexedFiles: input.fixture.indexedFiles.length,
      selectedFiles: input.fixture.selectedFiles.length,
      totalBytes,
      selectedBytes,
      omittedFileCount: input.fixture.selectedFiles.filter(
        (file) => file.kind === 'binary' || file.kind === 'oversized',
      ).length,
      largestFileBytes: Math.max(...input.fixture.rawFiles.map((file) => file.bytes)),
      deepestPathSegments: Math.max(
        ...input.fixture.rawFiles.map((file) => file.relativePath.split('/').length),
      ),
    },
    memory: {
      beforeBytes: input.memoryBefore,
      afterBytes: input.memoryAfter,
    },
    results: input.results,
    thresholds: evaluateThresholds(input.fixture.scale, input.results),
  }
}

export function evaluateThresholds(
  scale: BenchmarkScale,
  results: readonly BenchmarkResult[],
): BenchmarkThresholdResult[] {
  if (scale !== 'smoke') {
    return []
  }

  return results
    .filter((result) => SMOKE_THRESHOLDS.has(result.name))
    .map((result) => {
      const meanBudgetMs = SMOKE_THRESHOLDS.get(result.name) as number
      return {
        name: result.name,
        meanBudgetMs,
        meanMs: result.meanMs,
        passed: result.meanMs <= meanBudgetMs,
      }
    })
}

export function formatMarkdownReport(report: BenchmarkReport): string {
  const lines = [
    `# Lupinum Context benchmark report (${report.scale})`,
    '',
    `Generated: ${report.generatedAt}`,
    `Fixture: ${report.fixture.totalFiles} total files, ${report.fixture.indexedFiles} indexed files, ${report.fixture.selectedFiles} selected files`,
    `Fixture bytes: ${report.fixture.totalBytes} total, ${report.fixture.selectedBytes} selected, largest file ${report.fixture.largestFileBytes}, deepest path ${report.fixture.deepestPathSegments} segments`,
    `Memory: ${report.memory.beforeBytes} bytes before, ${report.memory.afterBytes} bytes after`,
    '',
    '## Results',
    '',
    '| Benchmark | Mean (ms) | P95 (ms) | Min (ms) | Max (ms) | Iterations |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...report.results.map(
      (result) =>
        `| ${result.name} | ${formatMs(result.meanMs)} | ${formatMs(result.p95Ms)} | ${formatMs(result.minMs)} | ${formatMs(result.maxMs)} | ${result.iterations} |`,
    ),
  ]

  if (report.thresholds.length > 0) {
    lines.push(
      '',
      '## Smoke Thresholds',
      '',
      '| Benchmark | Mean (ms) | Budget (ms) | Status |',
      '| --- | ---: | ---: | --- |',
      ...report.thresholds.map(
        (threshold) =>
          `| ${threshold.name} | ${formatMs(threshold.meanMs)} | ${formatMs(threshold.meanBudgetMs)} | ${threshold.passed ? 'pass' : 'fail'} |`,
      ),
    )
  }

  return `${lines.join('\n')}\n`
}

async function createBenchmarkState(
  rootDir: string,
  fixture: BenchmarkFixturePlan,
): Promise<BenchmarkState> {
  const workspace = { id: 'w', name: 'bench', rootPath: rootDir }
  const host = createFixtureHost(rootDir, fixture)
  const index = new FileIndex(host, [workspace], getTokenEstimateProfile('claude'))
  await index.ensureFresh()
  const selection = new FileSelection()
  const snapshot = index.getSnapshot()
  for (const file of fixture.selectedFiles) {
    selection.setNodeIncluded(snapshot, `w:${file.relativePath}`, true)
  }
  const builder = new ContextWorkflow(
    index,
    selection,
    createFixtureTextFileSystem(),
    getTokenEstimateProfile('claude'),
    () => [workspace],
    async () => [createSyntheticGitDiff()],
  )
  const selectedIndexedFiles = selection.getSnapshot().selectedFiles

  return {
    rootDir,
    workspace,
    fixture,
    index,
    selection,
    builder,
    selectedIndexedFiles,
  }
}

function createBenchmarkCases(
  rootDir: string,
  fixture: BenchmarkFixturePlan,
  state: BenchmarkState,
): BenchmarkCase[] {
  const iterations = fixture.scale === 'large' ? 3 : 4
  return [
    {
      name: 'index:refresh',
      description: 'Refresh file index with generated fixture files and stats',
      iterations,
      async run() {
        const index = new FileIndex(
          createFixtureHost(rootDir, fixture),
          [state.workspace],
          getTokenEstimateProfile('claude'),
        )
        await index.ensureFresh()
      },
    },
    {
      name: 'snapshot:hot',
      description: 'Read the current immutable file index snapshot repeatedly',
      iterations,
      run() {
        for (let count = 0; count < 1_000; count++) {
          state.index.getSnapshot()
        }
      },
    },
    {
      name: 'selection:derive',
      description: 'Derive selection after folder include, child exclude, and file-kind filter',
      iterations,
      run() {
        const selection = new FileSelection()
        const snapshot = state.index.getSnapshot()
        selection.setNodeIncluded(snapshot, 'w:src', true)
        selection.setNodeIncluded(snapshot, state.selectedIndexedFiles[0].id, false)
        selection.setFileTypeFilterExcluded(snapshot, 'pattern:test', true)
      },
    },
    {
      name: 'tree:selected',
      description: 'Generate project tree for selected files only',
      iterations,
      run() {
        generateFileStructureTree(
          rootDir,
          state.selectedIndexedFiles.map((file) => ({ tree: file.relativePath })),
        )
      },
    },
    {
      name: 'tree:full',
      description: 'Generate project tree for the full indexed repository view',
      iterations,
      run() {
        generateFileStructureTree(
          rootDir,
          state.index.getSnapshot().files.map((file) => ({ tree: file.relativePath })),
        )
      },
    },
    {
      name: 'preflight:selected',
      description: 'Preflight selected context without reading full file contents',
      iterations,
      async run() {
        await state.builder.preflightContext({
          prefix: 'Review this benchmark fixture.',
          treeMode: 'selectedFilesOnly',
          outputMode: 'readable',
        })
      },
    },
    {
      name: 'context:selected-readable',
      description: 'Generate readable context for selected files',
      iterations,
      async run() {
        await state.builder.createContextFromSelection({
          prefix: 'Review this benchmark fixture.',
          treeMode: 'selectedFilesOnly',
          outputMode: 'readable',
        })
      },
    },
    {
      name: 'context:selected-compact',
      description: 'Generate compact context for selected files',
      iterations,
      async run() {
        await state.builder.createContextFromSelection({
          prefix: 'Review this benchmark fixture.',
          treeMode: 'selectedFilesOnly',
          outputMode: 'compact',
        })
      },
    },
    {
      name: 'file-safety:mixed',
      description: 'Generate context with selected safe, oversized, and binary-looking files',
      iterations,
      async run() {
        const output = await state.builder.createContextFromSelection({
          prefix: '',
          treeMode: 'none',
          outputMode: 'compact',
        })
        if (!output.warnings.some((warning) => warning.type === 'omittedFile')) {
          throw new Error('Expected selected unsafe files to be omitted')
        }
      },
    },
    {
      name: 'git-diff:synthetic',
      description: 'Format and assemble synthetic selected Git diffs without invoking Git',
      iterations,
      run() {
        const diff = createSyntheticGitDiff()
        formatReadableGitDiffs([diff])
        assembleContext({
          files: [],
          snapshots: new Map(),
          prefix: '',
          projectTree: '',
          treeMode: 'none',
          outputMode: 'compact',
          gitDiffs: [diff],
        })
      },
    },
  ]
}

async function runBenchmark(benchmark: BenchmarkCase): Promise<BenchmarkResult> {
  const durations: number[] = []
  for (let index = 0; index < benchmark.iterations; index++) {
    const startedAt = performance.now()
    await benchmark.run()
    durations.push(performance.now() - startedAt)
  }
  durations.sort((left, right) => left - right)
  const meanMs = durations.reduce((sum, duration) => sum + duration, 0) / durations.length
  const p95Index = Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)

  return {
    name: benchmark.name,
    description: benchmark.description,
    iterations: benchmark.iterations,
    meanMs,
    minMs: durations[0],
    maxMs: durations[durations.length - 1],
    p95Ms: durations[p95Index],
  }
}

async function writeFixture(rootDir: string, fixture: BenchmarkFixturePlan): Promise<void> {
  for (const file of fixture.rawFiles) {
    const absolutePath = path.join(rootDir, file.relativePath)
    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, createFileContent(file))
  }
}

function createFixtureHost(rootDir: string, fixture: BenchmarkFixturePlan): FileIndexHost {
  return {
    async listFiles() {
      return fixture.indexedFiles.map((file) => path.join(rootDir, file.relativePath))
    },
    async statFile(absolutePath) {
      const relativePath = path.relative(rootDir, absolutePath).replace(/\\/g, '/')
      const file = fixture.indexedFiles.find((candidate) => candidate.relativePath === relativePath)
      return file ? { sizeBytes: file.bytes, mtimeMs: 1 } : null
    },
  }
}

function createFixtureTextFileSystem() {
  return {
    async readText(absolutePath: string): Promise<string> {
      return readFile(absolutePath, 'utf8')
    },
    async readBytes(absolutePath: string, maxBytes: number): Promise<Uint8Array> {
      const bytes = await readFile(absolutePath)
      return bytes.subarray(0, maxBytes)
    },
  }
}

function createFileContent(file: FixtureFile): string | Buffer {
  if (file.kind === 'binary') {
    return Buffer.from([0, 1, 2, 3, 4, 5, 6, 7])
  }
  const unit = `// ${file.relativePath}\nexport const value = '${file.relativePath}';\n`
  return unit.repeat(Math.ceil(file.bytes / unit.length)).slice(0, file.bytes)
}

function createNormalPath(index: number): string {
  const extension = ['.ts', '.tsx', '.md', '.json', '.test.ts'][index % 5]
  const depth = 2 + (index % 7)
  const parts = ['src', index < 2_000 ? 'selected' : 'modules']
  for (let part = 0; part < depth - 2; part++) {
    parts.push(`g${(index + part * SEED) % 23}`)
  }
  parts.push(`file-${index}${extension}`)
  return parts.join('/')
}

function createTextSize(index: number): number {
  if (index % 97 === 0) {
    return 7_500
  }
  return 200 + ((index * SEED) % 1_200)
}

function createSyntheticGitDiff() {
  return {
    commit: {
      id: 'w:abc123',
      workspaceId: 'w',
      hash: 'abc123',
      shortHash: 'abc123',
      workspaceName: 'bench',
      rootPath: '/tmp/bench',
      authorName: 'Ada',
      authorDate: '2026-05-18T00:00:00.000Z',
      subject: 'Synthetic benchmark diff',
    },
    patch: Array.from({ length: 250 }, (_, index) => `+export const value${index} = ${index}`).join(
      '\n',
    ),
  }
}

function printSummary(report: BenchmarkReport): void {
  console.log(formatMarkdownReport(report))
}

function parseScale(value: string | undefined): BenchmarkScale {
  if (value === 'smoke' || value === 'large') {
    return value
  }
  throw new Error(`Expected --scale smoke|large, received ${value ?? '(missing)'}`)
}

function parsePositiveInteger(value: string | undefined, flag: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected ${flag} to be a positive integer`)
  }
  return parsed
}

function formatMs(value: number): string {
  return value.toFixed(2)
}
