import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { assembleContext } from '../../core/context/ContextAssembler'
import { estimateContextCharacters } from '../../core/context/ContextEstimate'
import type { ContextWarning } from '../../core/context/ContextFormat'
import { FileIndex, type IndexedWorkspace } from '../../core/files/FileIndex'
import { FileSelection } from '../../core/files/FileSelection'
import { getTokenEstimateProfile } from '../../core/tokens/TokenEstimateProfiles'
import { ContextWorkflow } from '../../app/ContextWorkflow'
import { createSelectedGitDiffReader } from '../../app/SelectedGitDiffs'
import { GitSelection } from '../../core/git/GitSelection'
import type { GitCommit } from '../../core/git/GitTypes'
import { readFixture } from '../helpers'

const CONTEXT_FIXTURE_TREE = 'demo\n└─ src/\n   └─ example.ts'
const CONTEXT_FIXTURE_FILE = {
  id: 'example',
  absolutePath: '/workspace/demo/src/example.ts',
  relativePath: 'src/example.ts',
  name: 'example.ts',
}
const CONTEXT_FIXTURE_SNAPSHOTS = new Map([
  ['example', { content: '\nexport const value = 1;\n\n' }],
])

test('context token estimate includes tree modes and minified wrapper shape', () => {
  const base = {
    prefix: '',
    suffix: '',
    selectedFileBlockChars: 100,
    selectedFileCount: 1,
    projectTree: 'clipper2-ts\n└─ bench/',
  }

  const fullTreeChars = estimateContextCharacters({
    ...base,
    treeType: 'fullFilesAndDirectories',
    minify: false,
  })
  const selectedTreeChars = estimateContextCharacters({
    ...base,
    treeType: 'selectedFilesOnly',
    minify: false,
  })
  const directoriesOnlyChars = estimateContextCharacters({
    ...base,
    treeType: 'fullDirectoriesOnly',
    minify: false,
  })
  const noTreeChars = estimateContextCharacters({
    ...base,
    treeType: 'none',
    minify: false,
  })
  const minifiedChars = estimateContextCharacters({
    ...base,
    treeType: 'fullFilesAndDirectories',
    minify: true,
  })
  const gitChars = estimateContextCharacters({
    ...base,
    selectedGitDiffChars: 80,
    treeType: 'none',
    minify: false,
  })

  assert.ok(fullTreeChars > noTreeChars)
  assert.equal(selectedTreeChars, fullTreeChars)
  assert.equal(directoriesOnlyChars, fullTreeChars)
  assert.ok(minifiedChars < fullTreeChars)
  assert.ok(gitChars > noTreeChars)
})

test('ContextAssembler matches readable golden fixture', async () => {
  const result = assembleContext({
    files: [CONTEXT_FIXTURE_FILE],
    snapshots: CONTEXT_FIXTURE_SNAPSHOTS,
    prefix: 'Audit prefix',
    suffix: 'Review carefully.',
    projectTree: CONTEXT_FIXTURE_TREE,
    treeMode: 'selectedFilesOnly',
    outputMode: 'readable',
  })

  assert.equal(result.text, await readFixture('context/basic-readable.expected.xml'))
  assert.equal(result.fileCount, 1)
  assert.equal(result.warnings.length, 0)
})

test('ContextAssembler matches compact golden fixture', async () => {
  const result = assembleContext({
    files: [CONTEXT_FIXTURE_FILE],
    snapshots: CONTEXT_FIXTURE_SNAPSHOTS,
    prefix: '',
    projectTree: CONTEXT_FIXTURE_TREE,
    treeMode: 'fullFilesAndDirectories',
    outputMode: 'compact',
  })

  assert.equal(result.text, await readFixture('context/basic-compact.expected.xml'))
})

test('ContextAssembler escapes XML-sensitive file content and git diffs', () => {
  const result = assembleContext({
    files: [CONTEXT_FIXTURE_FILE],
    snapshots: new Map([
      ['example', { content: '<script>if (a < b && c > d) return "</file>"</script>' }],
    ]),
    prefix: '',
    projectTree: 'demo\n└─ danger<&>.ts',
    treeMode: 'selectedFilesOnly',
    outputMode: 'readable',
    gitDiffs: [
      {
        commit: {
          id: 'workspace:abc123',
          workspaceName: 'demo',
          hash: 'abc123',
          shortHash: 'abc123',
          authorName: 'Ada & Bob',
          authorDate: '2026-05-16T10:00:00.000Z',
          subject: 'Escape <diff>',
        },
        patch: '+if (a < b && c > d) return "</diff>"\n',
      },
    ],
  })

  assert.match(
    result.text,
    /&lt;script&gt;if \(a &lt; b &amp;&amp; c &gt; d\) return "&lt;\/file&gt;"/,
  )
  assert.match(result.text, /danger&lt;&amp;&gt;\.ts/)
  assert.match(result.text, /Author: Ada &amp; Bob/)
  assert.match(result.text, /subject="Escape &lt;diff&gt;"/)
  assert.match(result.text, /\+if \(a &lt; b &amp;&amp; c &gt; d\) return "&lt;\/diff&gt;"/)
  assert.doesNotMatch(result.text, /<script>/)
  assert.doesNotMatch(result.text, /<\/file><\/file>/)
})

test('ContextAssembler omits tree when tree mode is none', async () => {
  const result = assembleContext({
    files: [CONTEXT_FIXTURE_FILE],
    snapshots: CONTEXT_FIXTURE_SNAPSHOTS,
    prefix: '',
    projectTree: CONTEXT_FIXTURE_TREE,
    treeMode: 'none',
    outputMode: 'readable',
  })

  assert.equal(result.text, await readFixture('context/tree-none.expected.xml'))
})

test('ContextAssembler emits tree-only output when no files are selected', async () => {
  const result = assembleContext({
    files: [],
    snapshots: new Map(),
    prefix: '',
    projectTree: CONTEXT_FIXTURE_TREE,
    treeMode: 'fullDirectoriesOnly',
    outputMode: 'readable',
  })

  assert.equal(result.text, await readFixture('context/tree-only.expected.xml'))
})

test('ContextAssembler reports missing file snapshots', async () => {
  const result = assembleContext({
    files: [CONTEXT_FIXTURE_FILE],
    snapshots: new Map(),
    prefix: '',
    projectTree: '',
    treeMode: 'none',
    outputMode: 'readable',
  })

  assert.equal(result.text, await readFixture('context/missing-file-warning.expected.xml'))
  assert.deepEqual(result.warnings, [
    {
      type: 'missingFile',
      fileId: 'example',
      path: 'src/example.ts',
    },
  ])
})

test('ContextAssembler renders missing file warnings in compact output', () => {
  const result = assembleContext({
    files: [CONTEXT_FIXTURE_FILE],
    snapshots: new Map(),
    prefix: '',
    projectTree: '',
    treeMode: 'none',
    outputMode: 'compact',
  })

  assert.match(result.text, /<context_warnings><warning type="missing_file"/)
  assert.match(result.text, /path="src\/example\.ts"/)
})

test('ContextAssembler includes selected git commit diffs', () => {
  const result = assembleContext({
    files: [],
    snapshots: new Map(),
    prefix: '',
    projectTree: '',
    treeMode: 'none',
    outputMode: 'readable',
    gitDiffs: [
      {
        commit: {
          id: 'workspace:abc123',
          workspaceName: 'demo',
          hash: 'abc123',
          shortHash: 'abc123',
          authorName: 'Ada',
          authorDate: '2026-05-16T10:00:00.000Z',
          subject: 'Fix parser',
        },
        patch: 'diff --git a/src/parser.ts b/src/parser.ts\n+export const ok = true\n',
      },
    ],
  })

  assert.match(result.text, /^<context>\n<git_commits>/)
  assert.match(result.text, /<commit hash="abc123" subject="Fix parser" workspace="demo">/)
  assert.match(result.text, /diff --git a\/src\/parser\.ts b\/src\/parser\.ts/)
  assert.equal(result.fileCount, 0)
  assert.equal(result.commitCount, 1)
})

test('ContextWorkflow prefixes multi-root tree paths', async () => {
  const workspaces: IndexedWorkspace[] = [
    { id: 'front', name: 'frontend', rootPath: '/repo/frontend' },
    { id: 'back', name: 'backend', rootPath: '/repo/backend' },
  ]
  const paths = ['/repo/frontend/src/index.ts', '/repo/backend/src/index.ts']
  const index = new FileIndex(
    {
      async listFiles(workspace) {
        return paths.filter((filePath) => filePath.startsWith(workspace.rootPath))
      },
      async statFile(absolutePath) {
        return { sizeBytes: absolutePath.length, mtimeMs: 1 }
      },
    },
    workspaces,
    getTokenEstimateProfile('claude'),
  )
  await index.ensureFresh()
  const selection = new FileSelection()
  selection.setNodeIncluded(index.getSnapshot(), 'front:', true)
  selection.setNodeIncluded(index.getSnapshot(), 'back:', true)
  const builder = new ContextWorkflow(
    index,
    selection,
    {
      async readBytes() {
        return new Uint8Array()
      },
      async readText(absolutePath) {
        return absolutePath
      },
    },
    getTokenEstimateProfile('claude'),
    () => workspaces,
  )

  const output = await builder.createContextFromSelection({
    prefix: '',
    treeMode: 'selectedFilesOnly',
    outputMode: 'readable',
  })

  assert.match(output.text, /workspace\n/)
  assert.match(output.text, /frontend\/\n.*src\/\n.*index\.ts/s)
  assert.match(output.text, /backend\/\n.*src\/\n.*index\.ts/s)
})

test('ContextWorkflow returns warnings for files that disappear before read', async () => {
  const workspace: IndexedWorkspace = { id: 'w', name: 'demo', rootPath: '/repo' }
  const index = new FileIndex(
    {
      async listFiles() {
        return ['/repo/src/deleted.ts']
      },
      async statFile() {
        return { sizeBytes: 20, mtimeMs: 1 }
      },
    },
    [workspace],
    getTokenEstimateProfile('claude'),
  )
  await index.ensureFresh()
  const selection = new FileSelection()
  selection.setNodeIncluded(index.getSnapshot(), 'w:src/deleted.ts', true)
  const builder = new ContextWorkflow(
    index,
    selection,
    {
      async readBytes() {
        return new Uint8Array()
      },
      async readText() {
        throw new Error('ENOENT')
      },
    },
    getTokenEstimateProfile('claude'),
    () => [workspace],
  )

  const output = await builder.createContextFromSelection({
    prefix: '',
    treeMode: 'none',
    outputMode: 'readable',
  })

  assert.match(output.text, /<context_warnings>/)
  assert.match(output.text, /type="missing_file"/)
  assert.match(output.text, /path="src\/deleted\.ts"/)
  assert.equal(output.fileCount, 0)
  assert.deepEqual(output.warnings, [
    {
      type: 'missingFile',
      fileId: 'w:src/deleted.ts',
      path: 'src/deleted.ts',
    },
  ])
})

test('ContextWorkflow surfaces selected git diff warnings', async () => {
  const service = await createSingleFileContextService(
    'src/app.ts',
    'export const ok = true\n',
    async () => [
      {
        commit: {
          id: 'w:abc123',
          workspaceId: 'w',
          workspaceName: 'demo',
          rootPath: '/repo',
          hash: 'abc123',
          shortHash: 'abc123',
          authorName: 'Ada',
          authorDate: '2026-05-16T10:00:00.000Z',
          subject: 'Large diff',
        },
        patch: '',
        warnings: ['Diff output was truncated after 1000000 bytes.'],
      },
    ],
  )

  const output = await service.createContextFromSelection({
    prefix: '',
    treeMode: 'none',
    outputMode: 'readable',
  })

  assert.deepEqual(output.warnings, [
    {
      type: 'gitDiff',
      commitId: 'w:abc123',
      shortHash: 'abc123',
      subject: 'Large diff',
      message: 'Diff output was truncated after 1000000 bytes.',
    },
  ])
  assert.match(output.text, /<context_warnings>/)
  assert.match(output.text, /<warning type="git_diff" commit="abc123"/)
})

test('ContextWorkflow emits large context warnings with other warning types', async () => {
  const content = 'x'.repeat(1_000_100)
  const service = await createSingleFileContextService('src/large.ts', content, async () => [
    {
      commit: {
        id: 'w:abc123',
        workspaceId: 'w',
        workspaceName: 'demo',
        rootPath: '/repo',
        hash: 'abc123',
        shortHash: 'abc123',
        authorName: 'Ada',
        authorDate: '2026-05-16T10:00:00.000Z',
        subject: 'Binary diff',
      },
      patch: '',
      warnings: ['Binary patch content was omitted from the context.'],
    },
  ])

  const output = await service.createContextFromSelection({
    prefix: '',
    treeMode: 'none',
    outputMode: 'readable',
  })

  assert.ok(output.warnings.some((warning) => warning.type === 'gitDiff'))
  const largeWarning = output.warnings.find((warning) => warning.type === 'largeContext')
  assert.ok(largeWarning)
  assert.equal(largeWarning.type, 'largeContext')
  assert.ok(largeWarning.estimatedTokens >= 250_000)
  assert.ok(largeWarning.characterCount >= 1_000_000)
})

test('large context action warnings reuse generated output warnings', async () => {
  const content = 'x'.repeat(1_000_100)
  const service = await createSingleFileContextService('src/large.ts', content)
  const output = await service.preflightContext({
    prefix: '',
    treeMode: 'none',
    outputMode: 'readable',
  })
  const warning = findLargeContextWarning(output.warnings)

  assert.ok(warning)
  assert.match(warning.message, /^Estimated context is large:/)
})

test('ContextWorkflow preflight warns before reading selected file contents', async () => {
  const workspace: IndexedWorkspace = { id: 'w', name: 'demo', rootPath: '/repo' }
  const absolutePath = '/repo/src/large.ts'
  const index = new FileIndex(
    {
      async listFiles() {
        return [absolutePath]
      },
      async statFile() {
        return { sizeBytes: 1_000_100, mtimeMs: 1 }
      },
    },
    [workspace],
    getTokenEstimateProfile('claude'),
  )
  await index.ensureFresh()
  const selection = new FileSelection()
  selection.setNodeIncluded(index.getSnapshot(), 'w:src/large.ts', true)
  let readBytesCalls = 0
  const builder = new ContextWorkflow(
    index,
    selection,
    {
      async readBytes() {
        readBytesCalls += 1
        return Buffer.from('safe text', 'utf8')
      },
      async readText() {
        throw new Error('preflight must not read text')
      },
    },
    getTokenEstimateProfile('claude'),
    () => [workspace],
  )

  const preflight = await builder.preflightContext({
    prefix: '',
    treeMode: 'none',
    outputMode: 'readable',
  })

  assert.equal(preflight.selectedFileCount, 1)
  assert.equal(preflight.selectedBytes, 1_000_100)
  assert.equal(preflight.omittedFileCount, 0)
  assert.equal(readBytesCalls, 1)
  assert.equal(preflight.requiresConfirmation, true)
  assert.ok(preflight.warnings.some((warning) => warning.type === 'largeContext'))
})

test('ContextWorkflow preflight predicts oversized and binary omissions', async () => {
  const oversized = await createSingleFileContextService('src/huge.ts', 'x'.repeat(2_000_001))
  const oversizedPreflight = await oversized.preflightContext({
    prefix: '',
    treeMode: 'none',
    outputMode: 'readable',
  })

  assert.equal(oversizedPreflight.omittedFileCount, 1)
  assert.deepEqual(
    oversizedPreflight.warnings.filter((warning) => warning.type === 'omittedFile'),
    [
      {
        type: 'omittedFile',
        fileId: 'w:src/huge.ts',
        path: 'src/huge.ts',
        reason: 'tooLarge',
        message: 'File is larger than 2000000 bytes.',
      },
    ],
  )

  const binary = await createSingleFileContextService('src/blob.dat', 'ignored text', undefined, {
    readBytes() {
      return new Uint8Array([0, 1, 2, 3])
    },
  })
  const binaryPreflight = await binary.preflightContext({
    prefix: '',
    treeMode: 'none',
    outputMode: 'compact',
  })
  const binaryOutput = await binary.createContextFromSelection({
    prefix: '',
    treeMode: 'none',
    outputMode: 'compact',
  })

  assert.equal(binaryPreflight.omittedFileCount, 1)
  assert.deepEqual(
    binaryPreflight.warnings.filter((warning) => warning.type === 'omittedFile'),
    binaryOutput.warnings.filter((warning) => warning.type === 'omittedFile'),
  )
})

test('ContextWorkflow preflight and generation use the same predictable omission paths', async () => {
  const oversized = await createSingleFileContextService('src/huge.ts', 'x'.repeat(2_000_001))
  const options = {
    prefix: '',
    treeMode: 'none' as const,
    outputMode: 'readable' as const,
  }

  const preflight = await oversized.preflightContext(options)
  const output = await oversized.createContextFromSelection(options)

  assert.deepEqual(warningPaths(preflight.warnings), warningPaths(output.warnings))
})

test('ContextWorkflow omits oversized files before reading content', async () => {
  let readTextCalls = 0
  const content = 'x'.repeat(2_000_001)
  const service = await createSingleFileContextService('src/huge.ts', content, undefined, {
    readText() {
      readTextCalls += 1
      return content
    },
  })

  const output = await service.createContextFromSelection({
    prefix: '',
    treeMode: 'none',
    outputMode: 'readable',
  })

  assert.equal(readTextCalls, 0)
  assert.equal(output.fileCount, 0)
  assert.deepEqual(output.warnings, [
    {
      type: 'omittedFile',
      fileId: 'w:src/huge.ts',
      path: 'src/huge.ts',
      reason: 'tooLarge',
      message: 'File is larger than 2000000 bytes.',
    },
  ])
  assert.match(output.text, /<context_warnings>/)
  assert.match(output.text, /reason="tooLarge"/)
})

test('ContextWorkflow omits binary files from context output', async () => {
  const service = await createSingleFileContextService('src/blob.dat', 'ignored text', undefined, {
    readBytes() {
      return new Uint8Array([0, 1, 2, 3])
    },
  })

  const output = await service.createContextFromSelection({
    prefix: '',
    treeMode: 'none',
    outputMode: 'compact',
  })

  assert.equal(output.fileCount, 0)
  assert.deepEqual(output.warnings, [
    {
      type: 'omittedFile',
      fileId: 'w:src/blob.dat',
      path: 'src/blob.dat',
      reason: 'binary',
      message: 'File appears to be binary.',
    },
  ])
  assert.match(output.text, /<context_warnings><warning type="omitted_file"/)
})

test('ContextWorkflow preview estimates stay close to final normal text estimates', async () => {
  const content = 'export const value = "hello";\n'.repeat(200)
  const service = await createSingleFileContextService('src/app.ts', content)
  const options = {
    prefix: 'Review this file.',
    treeMode: 'selectedFilesOnly' as const,
    outputMode: 'readable' as const,
  }

  const [preview] = await service.estimatePreviewForProfiles(options, [
    getTokenEstimateProfile('claude'),
  ])
  const output = await service.createContextFromSelection(options)

  assertWithinPercent(preview.tokens, output.estimatedTokens, 10)
})

test('ContextWorkflow summarizes selected file count and text lines', async () => {
  let reads = 0
  const service = await createSingleFileContextService(
    'src/app.ts',
    'one\ntwo\nthree\n',
    undefined,
    {
      readText() {
        reads += 1
        return 'one\ntwo\nthree\n'
      },
    },
  )

  const summary = await service.summarizeSelectedFiles()
  const cachedSummary = await service.summarizeSelectedFiles()

  assert.deepEqual(summary, {
    selectedFileCount: 1,
    selectedLineCount: 3,
  })
  assert.deepEqual(cachedSummary, summary)
  assert.equal(reads, 1)
})

test('ContextWorkflow summary skips binary files for line counts', async () => {
  const service = await createSingleFileContextService('src/blob.dat', 'not counted\n', undefined, {
    readBytes() {
      return new Uint8Array([0, 1, 2, 3])
    },
  })

  const summary = await service.summarizeSelectedFiles()

  assert.deepEqual(summary, {
    selectedFileCount: 1,
    selectedLineCount: 0,
  })
})

test('ContextWorkflow preview estimates stay close to preflight estimates', async () => {
  const content = '1234.5678 -9012.3456\n'.repeat(500)
  const service = await createSingleFileContextService('data/sample.csv', content, undefined, {
    profile: getTokenEstimateProfile('gemini'),
  })
  const options = {
    prefix: '',
    treeMode: 'selectedFilesOnly' as const,
    outputMode: 'readable' as const,
  }

  const [preview] = await service.estimatePreviewForProfiles(options, [
    getTokenEstimateProfile('gemini'),
  ])
  const preflight = await service.preflightContext(options, [getTokenEstimateProfile('gemini')])

  assertWithinPercent(preview.tokens, preflight.estimateSummaries[0].tokens, 1)
})

test('ContextWorkflow preview estimates include selected git diffs through the diff cache', async () => {
  const selection = new GitSelection()
  const first = gitCommit('a1')
  const second = gitCommit('b2')
  let reads = 0
  selection.setCommits([first, second])
  selection.setCommitSelected(first.id, true)
  const reader = createSelectedGitDiffReader(selection, async (commit) => {
    reads += 1
    return {
      commit,
      patch: `diff --git a/${commit.shortHash}.ts b/${commit.shortHash}.ts\n+ok\n`,
    }
  })
  const service = await createSingleFileContextService(
    'src/app.ts',
    'export const ok = true\n',
    () => reader.readSelectedGitDiffs(),
  )

  await service.estimatePreviewForProfiles(
    { prefix: 'First prefix', treeMode: 'none', outputMode: 'readable' },
    [getTokenEstimateProfile('claude')],
  )
  await service.estimatePreviewForProfiles(
    { prefix: 'Second prefix', treeMode: 'none', outputMode: 'compact' },
    [getTokenEstimateProfile('gemini')],
  )
  await service.createContextFromSelection({
    prefix: 'Final prefix',
    treeMode: 'none',
    outputMode: 'readable',
  })

  assert.equal(reads, 1)

  selection.setCommitSelected(second.id, true)
  const [previewWithTwoDiffs] = await service.estimatePreviewForProfiles(
    { prefix: 'Another prefix', treeMode: 'none', outputMode: 'readable' },
    [getTokenEstimateProfile('claude')],
  )

  assert.equal(reads, 2)
  assert.ok(previewWithTwoDiffs.tokens > 0)

  reader.clear()
  await service.createContextFromSelection({
    prefix: '',
    treeMode: 'none',
    outputMode: 'readable',
  })

  assert.equal(reads, 4)
})

async function createSingleFileContextService(
  relativePath: string,
  content: string,
  readSelectedGitDiffs?: ConstructorParameters<typeof ContextWorkflow>[5],
  overrides: Partial<{
    readBytes: () => Uint8Array
    readText: () => string
    profile: ReturnType<typeof getTokenEstimateProfile>
  }> = {},
): Promise<ContextWorkflow> {
  const workspace: IndexedWorkspace = { id: 'w', name: 'demo', rootPath: '/repo' }
  const absolutePath = `/repo/${relativePath}`
  const profile = overrides.profile ?? getTokenEstimateProfile('claude')
  const index = new FileIndex(
    {
      async listFiles() {
        return [absolutePath]
      },
      async statFile() {
        return { sizeBytes: Buffer.byteLength(content, 'utf8'), mtimeMs: 1 }
      },
    },
    [workspace],
    profile,
  )
  await index.ensureFresh()
  const selection = new FileSelection()
  selection.setNodeIncluded(index.getSnapshot(), `w:${relativePath}`, true)
  return new ContextWorkflow(
    index,
    selection,
    {
      async readBytes() {
        return overrides.readBytes?.() ?? Buffer.from(content, 'utf8').subarray(0, 8_000)
      },
      async readText() {
        return overrides.readText?.() ?? content
      },
    },
    profile,
    () => [workspace],
    readSelectedGitDiffs,
  )
}

function assertWithinPercent(actual: number, expected: number, tolerancePercent: number): void {
  const delta = Math.abs(actual - expected)
  const allowed = Math.ceil(expected * (tolerancePercent / 100))
  assert.ok(
    delta <= allowed,
    `${actual} differs from ${expected} by more than ${tolerancePercent}%`,
  )
}

function warningPaths(warnings: readonly ContextWarning[]): string[] {
  return warnings
    .filter(
      (warning): warning is Extract<ContextWarning, { type: 'missingFile' | 'omittedFile' }> =>
        warning.type === 'missingFile' || warning.type === 'omittedFile',
    )
    .map((warning) => `${warning.type}:${warning.path}`)
}

function gitCommit(hash: string): GitCommit {
  return {
    id: `w:${hash}`,
    workspaceId: 'w',
    workspaceName: 'demo',
    rootPath: '/repo',
    hash,
    shortHash: hash,
    authorName: 'Ada',
    authorDate: '2026-05-17T10:00:00.000Z',
    subject: `Commit ${hash}`,
  }
}

function findLargeContextWarning(warnings: readonly ContextWarning[]) {
  return warnings.find((warning) => warning.type === 'largeContext')
}
