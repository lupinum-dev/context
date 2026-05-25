import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import ignore from 'ignore'
import { getFileTypeFilterDefinition } from '../../core/files/FileTypeFilter'
import { createLayeredIgnoreMatcher, normalizeIgnorePath } from '../../core/files/IgnoreRules'
import { FileIndex, type FileStat, type IndexedWorkspace } from '../../core/files/FileIndex'
import { FileSelection } from '../../core/files/FileSelection'
import { decideFileSafetyBeforeRead } from '../../core/files/FileSafety'
import { getTokenEstimateProfile } from '../../core/tokens/TokenEstimateProfiles'
import { createSelectionFixtureIndex } from '../helpers'
import { ALWAYS_IGNORE } from '../../utils/alwaysIgnore'

test('FileIndex refreshes once more when dirtied during refresh', async () => {
  const workspace: IndexedWorkspace = {
    id: 'w',
    name: 'demo',
    rootPath: '/repo',
  }
  let files = ['/repo/src/a.ts']
  let listCalls = 0
  const index = new FileIndex(
    {
      async listFiles() {
        listCalls++
        if (listCalls === 1) {
          index.markDirty()
          files = ['/repo/src/a.ts', '/repo/src/b.ts']
        }
        return files
      },
      async statFile(absolutePath: string): Promise<FileStat> {
        return { sizeBytes: absolutePath.endsWith('b.ts') ? 80 : 40, mtimeMs: 1 }
      },
    },
    [workspace],
    getTokenEstimateProfile('claude'),
  )

  await index.ensureFresh()

  assert.equal(listCalls, 2)
  assert.equal(index.getSnapshot().files.length, 2)
  assert.equal(index.getRefreshState(), 'idle')
})

test('FileIndex updates metadata and token estimates after file changes', async () => {
  const workspace: IndexedWorkspace = {
    id: 'w',
    name: 'demo',
    rootPath: '/repo',
  }
  let sizeBytes = 40
  const index = new FileIndex(
    {
      async listFiles() {
        return ['/repo/src/a.ts']
      },
      async statFile() {
        return { sizeBytes, mtimeMs: sizeBytes }
      },
    },
    [workspace],
    getTokenEstimateProfile('claude'),
  )

  await index.ensureFresh()
  const before = index.getSnapshot().files[0].estimatedTokenCount
  sizeBytes = 400
  index.markDirty()
  await index.ensureFresh()

  assert.ok(index.getSnapshot().files[0].estimatedTokenCount > before)
})

test('FileIndex replaces roots when workspace folders change', async () => {
  const first: IndexedWorkspace = { id: 'a', name: 'app', rootPath: '/repo/app' }
  const second: IndexedWorkspace = { id: 'b', name: 'lib', rootPath: '/repo/lib' }
  const index = new FileIndex(
    {
      async listFiles(workspace) {
        return workspace.id === 'a' ? ['/repo/app/src/a.ts'] : ['/repo/lib/src/b.ts']
      },
      async statFile(): Promise<FileStat> {
        return { sizeBytes: 40, mtimeMs: 1 }
      },
    },
    [first],
    getTokenEstimateProfile('claude'),
  )

  await index.ensureFresh()
  assert.deepEqual(
    index.getSnapshot().files.map((file) => `${file.workspaceId}:${file.relativePath}`),
    ['a:src/a.ts'],
  )

  index.setWorkspaces([second])
  await index.ensureFresh()

  assert.deepEqual(index.getSnapshot().rootIds, ['b:'])
  assert.deepEqual(
    index.getSnapshot().files.map((file) => `${file.workspaceId}:${file.relativePath}`),
    ['b:src/b.ts'],
  )
  assert.equal(index.findNode('a:src/a.ts'), undefined)
})

test('FileIndex skips paths that normalize outside the workspace', async () => {
  const workspace: IndexedWorkspace = {
    id: 'w',
    name: 'demo',
    rootPath: '/repo',
  }
  const index = new FileIndex(
    {
      async listFiles() {
        return ['/repo/src/a.ts', '/repo/../secret.ts', '/repo-other/app.ts']
      },
      async statFile(): Promise<FileStat> {
        return { sizeBytes: 40, mtimeMs: 1 }
      },
    },
    [workspace],
    getTokenEstimateProfile('claude'),
  )

  await index.ensureFresh()

  assert.deepEqual(
    index.getSnapshot().files.map((file) => file.relativePath),
    ['src/a.ts'],
  )
})

test('file safety rejects indexed files outside their workspace root', () => {
  assert.deepEqual(
    decideFileSafetyBeforeRead(
      {
        id: 'w:secret.ts',
        kind: 'file',
        workspaceId: 'w',
        absolutePath: '/repo-other/secret.ts',
        relativePath: 'secret.ts',
        name: 'secret.ts',
        extension: '.ts',
        sizeBytes: 40,
        mtimeMs: 1,
        parentId: 'w:',
        estimatedTokenCount: 10,
      },
      [{ id: 'w', name: 'demo', rootPath: '/repo' }],
    ),
    {
      action: 'omit',
      reason: 'outsideWorkspace',
      message: 'File is outside the indexed workspace.',
    },
  )
})

test('FileIndex snapshot files are sorted by workspace order and relative path', async () => {
  const workspaces: IndexedWorkspace[] = [
    { id: 'a', name: 'app', rootPath: '/repo/app' },
    { id: 'b', name: 'lib', rootPath: '/repo/lib' },
  ]
  const firstOrder = [
    '/repo/lib/src/z.ts',
    '/repo/app/src/b.ts',
    '/repo/app/src/a.ts',
    '/repo/lib/src/a.ts',
  ]
  const secondOrder = [...firstOrder].reverse()
  let order = firstOrder
  const index = new FileIndex(
    {
      async listFiles(workspace) {
        return order.filter((filePath) => filePath.startsWith(workspace.rootPath))
      },
      async statFile(): Promise<FileStat> {
        return { sizeBytes: 40, mtimeMs: 1 }
      },
    },
    workspaces,
    getTokenEstimateProfile('claude'),
  )

  await index.ensureFresh()
  const first = index.getSnapshot().files.map((file) => `${file.workspaceId}:${file.relativePath}`)
  order = secondOrder
  index.markDirty()
  await index.ensureFresh()
  const second = index.getSnapshot().files.map((file) => `${file.workspaceId}:${file.relativePath}`)

  assert.deepEqual(first, ['a:src/a.ts', 'a:src/b.ts', 'b:src/a.ts', 'b:src/z.ts'])
  assert.deepEqual(second, first)
})

test('FileIndex snapshots do not expose mutable index internals', async () => {
  const workspace: IndexedWorkspace = {
    id: 'w',
    name: 'demo',
    rootPath: '/repo',
  }
  const index = new FileIndex(
    {
      async listFiles() {
        return ['/repo/src/a.ts']
      },
      async statFile() {
        return { sizeBytes: 40, mtimeMs: 1 }
      },
    },
    [workspace],
    getTokenEstimateProfile('claude'),
  )

  await index.ensureFresh()
  const snapshot = index.getSnapshot()
  const root = snapshot.nodes.get('w:')
  assert.ok(root && root.kind !== 'file')

  assert.throws(() => {
    ;(snapshot.files as unknown[]).pop()
  })
  assert.throws(() => {
    ;(root.childIds as string[]).length = 0
  })
  assert.equal(typeof (snapshot.nodes as unknown as { clear?: unknown }).clear, 'undefined')

  const nextSnapshot = index.getSnapshot()
  assert.equal(nextSnapshot.files.length, 1)
  assert.equal(nextSnapshot.nodes.has('w:'), true)
  const nextRoot = nextSnapshot.nodes.get('w:')
  assert.ok(nextRoot && nextRoot.kind !== 'file')
  assert.deepEqual(nextRoot.childIds, ['w:src'])
})

test('FileIndex stats files concurrently during refresh', async () => {
  const workspace: IndexedWorkspace = {
    id: 'w',
    name: 'demo',
    rootPath: '/repo',
  }
  let activeStats = 0
  let maxActiveStats = 0
  const index = new FileIndex(
    {
      async listFiles() {
        return Array.from({ length: 10 }, (_, index) => `/repo/src/${index}.ts`)
      },
      async statFile(): Promise<FileStat> {
        activeStats += 1
        maxActiveStats = Math.max(maxActiveStats, activeStats)
        await new Promise((resolve) => setTimeout(resolve, 1))
        activeStats -= 1
        return { sizeBytes: 40, mtimeMs: 1 }
      },
    },
    [workspace],
    getTokenEstimateProfile('claude'),
  )

  await index.ensureFresh()

  assert.ok(maxActiveStats > 1)
})

test('FileSelection restores tests after excluded test filter is re-enabled', async () => {
  const index = await createSelectionFixtureIndex(['src/app.ts', 'src/app.test.ts'])
  const selection = new FileSelection()
  const snapshot = index.getSnapshot()
  selection.setNodeIncluded(snapshot, 'w:src', true)
  selection.setFileTypeFilterExcluded(snapshot, 'pattern:test', true)

  assert.deepEqual(
    selection.getSnapshot().selectedFiles.map((file) => file.relativePath),
    ['src/app.ts'],
  )

  selection.setFileTypeFilterExcluded(snapshot, 'pattern:test', false)

  assert.deepEqual(
    selection
      .getSnapshot()
      .selectedFiles.map((file) => file.relativePath)
      .sort(),
    ['src/app.test.ts', 'src/app.ts'],
  )
})

test('FileSelection toggling a partial parent re-includes a deselected child folder', async () => {
  const index = await createSelectionFixtureIndex(['src/sub/inner.ts', 'src/app.ts'])
  const selection = new FileSelection()
  const snap = index.getSnapshot()
  selection.setNodeIncluded(snap, 'w:src', true)
  selection.setNodeIncluded(snap, 'w:src/sub', false)
  assert.equal(selection.getSnapshot().checkboxStates.get('w:src'), 'partial')

  selection.toggleNode(snap, 'w:src')

  assert.deepEqual(
    selection
      .getSnapshot()
      .selectedFiles.map((file) => file.relativePath)
      .sort(),
    ['src/app.ts', 'src/sub/inner.ts'],
  )
})

test('FileSelection toggling a partial parent re-includes a deeply-nested deselected file', async () => {
  const index = await createSelectionFixtureIndex(['src/sub/inner.ts', 'src/app.ts'])
  const selection = new FileSelection()
  const snap = index.getSnapshot()
  selection.setNodeIncluded(snap, 'w:src', true)
  selection.setNodeIncluded(snap, 'w:src/sub/inner.ts', false)

  selection.toggleNode(snap, 'w:src')

  assert.deepEqual(
    selection
      .getSnapshot()
      .selectedFiles.map((file) => file.relativePath)
      .sort(),
    ['src/app.ts', 'src/sub/inner.ts'],
  )
})

test('FileSelection keeps explicit child excludes across filter changes', async () => {
  const index = await createSelectionFixtureIndex(['src/app.ts', 'src/app.test.ts'])
  const selection = new FileSelection()
  const snapshot = index.getSnapshot()
  selection.setNodeIncluded(snapshot, 'w:src', true)
  selection.setNodeIncluded(snapshot, 'w:src/app.ts', false)
  selection.setFileTypeFilterExcluded(snapshot, 'pattern:test', true)
  selection.setFileTypeFilterExcluded(snapshot, 'pattern:test', false)

  assert.deepEqual(
    selection.getSnapshot().selectedFiles.map((file) => file.relativePath),
    ['src/app.test.ts'],
  )
})

test('FileSelection can include a child file under an excluded folder', async () => {
  const index = await createSelectionFixtureIndex([
    'scripts/prepare-effect.sh',
    'scripts/replay.ts',
  ])
  const selection = new FileSelection()
  const snapshot = index.getSnapshot()
  selection.setNodeIncluded(snapshot, 'w:', true)
  selection.setNodeIncluded(snapshot, 'w:scripts', false)
  selection.setNodeIncluded(snapshot, 'w:scripts/prepare-effect.sh', true)

  assert.deepEqual(
    selection.getSnapshot().selectedFiles.map((file) => file.relativePath),
    ['scripts/prepare-effect.sh'],
  )
  assert.equal(selection.getSnapshot().checkboxStates.get('w:scripts'), 'partial')
  assert.equal(selection.getSnapshot().checkboxStates.get('w:scripts/prepare-effect.sh'), 'checked')
  assert.equal(selection.getSnapshot().checkboxStates.get('w:scripts/replay.ts'), 'unchecked')
})

test('FileSelection derives new files under selected folders and filters tests', async () => {
  let index = await createSelectionFixtureIndex(['src/app.ts'])
  const selection = new FileSelection()
  selection.setNodeIncluded(index.getSnapshot(), 'w:src', true)

  index = await createSelectionFixtureIndex(['src/app.ts', 'src/new.ts', 'src/new.test.ts'])
  selection.setFileTypeFilterExcluded(index.getSnapshot(), 'pattern:test', true)
  selection.reconcile(index.getSnapshot())

  assert.deepEqual(
    selection
      .getSnapshot()
      .selectedFiles.map((file) => file.relativePath)
      .sort(),
    ['src/app.ts', 'src/new.ts'],
  )
})

test('FileSelection drops deleted selected files during reconcile', async () => {
  let index = await createSelectionFixtureIndex(['src/app.ts', 'src/old.ts'])
  const selection = new FileSelection()
  selection.setNodeIncluded(index.getSnapshot(), 'w:src/old.ts', true)

  index = await createSelectionFixtureIndex(['src/app.ts'])
  selection.reconcile(index.getSnapshot())

  assert.deepEqual(selection.getSnapshot().selectedFileIds, [])
  assert.deepEqual(selection.getPersistedIntent().includedNodeIds, [])
})

test('FileSelection folder checkbox ignores excluded file type filters', async () => {
  const index = await createSelectionFixtureIndex(['src/app.ts', 'src/app.test.ts'])
  const selection = new FileSelection()
  const snapshot = index.getSnapshot()
  selection.setNodeIncluded(snapshot, 'w:src', true)
  selection.setFileTypeFilterExcluded(snapshot, 'pattern:test', true)

  assert.equal(selection.getSnapshot().checkboxStates.get('w:src'), 'checked')
  assert.equal(selection.getSnapshot().checkboxStates.get('w:src/app.test.ts'), 'unchecked')
})

test('FileSelection persists and restores selection intent', async () => {
  const index = await createSelectionFixtureIndex(['src/app.ts', 'src/app.test.ts'])
  const original = new FileSelection()
  original.setNodeIncluded(index.getSnapshot(), 'w:src', true)
  original.setFileTypeFilterExcluded(index.getSnapshot(), 'pattern:test', true)

  const restored = new FileSelection()
  restored.restoreIntent(index.getSnapshot(), original.getPersistedIntent())

  assert.deepEqual(
    restored.getSnapshot().selectedFiles.map((file) => file.relativePath),
    ['src/app.ts'],
  )
  assert.equal(restored.getSnapshot().filterGroups.at(-1)?.excluded, true)
})

test('FileSelection can include and exclude all filter groups', async () => {
  const index = await createSelectionFixtureIndex([
    'src/app.ts',
    'src/app.test.ts',
    'src/component.vue',
  ])
  const selection = new FileSelection()
  const snapshot = index.getSnapshot()
  selection.setNodeIncluded(snapshot, 'w:src', true)

  selection.excludeAllFilters(snapshot)
  assert.equal(selection.getSnapshot().selectedFiles.length, 0)
  assert.equal(
    selection.getSnapshot().filterGroups.every((group) => group.excluded),
    true,
  )

  selection.resetFilters(snapshot)
  assert.deepEqual(
    selection
      .getSnapshot()
      .selectedFiles.map((file) => file.relativePath)
      .sort(),
    ['src/app.test.ts', 'src/app.ts', 'src/component.vue'],
  )
})

test('folder selection refinement keeps tests and declarations separate', () => {
  assert.deepEqual(getFileTypeFilterDefinition('Component.vue'), {
    id: 'extension:.vue',
    label: '.vue files',
    sortLabel: '.vue',
  })
  assert.deepEqual(getFileTypeFilterDefinition('worker.ts'), {
    id: 'extension:.ts',
    label: '.ts files',
    sortLabel: '.ts',
  })
  assert.deepEqual(getFileTypeFilterDefinition('worker.test.ts'), {
    id: 'pattern:test',
    label: 'Test files (*.test.*, *.spec.*)',
    sortLabel: 'zz-test',
  })
  assert.deepEqual(getFileTypeFilterDefinition('worker.spec.tsx'), {
    id: 'pattern:test',
    label: 'Test files (*.test.*, *.spec.*)',
    sortLabel: 'zz-test',
  })
  assert.deepEqual(getFileTypeFilterDefinition('types.d.ts'), {
    id: 'pattern:declaration',
    label: 'Declaration files (*.d.ts)',
    sortLabel: 'zz-declaration',
  })
  assert.deepEqual(getFileTypeFilterDefinition('Dockerfile'), {
    id: 'extension:(no extension)',
    label: 'No extension',
    sortLabel: '(no extension)',
  })
})

test('ignore rules combine built-ins, gitignore, contextignore, and towerignore syntax', () => {
  const matcher = ignore().add(ALWAYS_IGNORE)
  matcher.add(['generated/'])
  matcher.add(['fixtures/'])
  matcher.add(['legacy-output/'])

  assert.equal(matcher.ignores(normalizeIgnorePath('node_modules/pkg/index.js')), true)
  assert.equal(matcher.ignores(normalizeIgnorePath('generated/report.json')), true)
  assert.equal(matcher.ignores(normalizeIgnorePath('fixtures/context.xml')), true)
  assert.equal(matcher.ignores(normalizeIgnorePath('legacy-output/a.txt')), true)
  assert.equal(matcher.ignores(normalizeIgnorePath('src/app.ts')), false)
  assert.equal(matcher.ignores(normalizeIgnorePath('pnpm-lock.yaml')), false)
  assert.equal(matcher.ignores(normalizeIgnorePath('Cargo.lock')), false)
})

test('layered ignore rules support nested gitignore and later negation', () => {
  const isIgnored = createLayeredIgnoreMatcher(
    [
      { basePath: '', patterns: ['node_modules/', 'secrets/*'] },
      { basePath: '', patterns: ['generated/'] },
      { basePath: 'src', patterns: ['*.secret'] },
      { basePath: 'secrets', patterns: ['!keep.env'] },
    ],
    (patterns) => ignore().add(patterns),
  )

  assert.equal(isIgnored('node_modules/pkg/index.js'), true)
  assert.equal(isIgnored('generated/report.json'), true)
  assert.equal(isIgnored('src/token.secret'), true)
  assert.equal(isIgnored('test/token.secret'), false)
  assert.equal(isIgnored('secrets/client.env'), true)
  assert.equal(isIgnored('secrets/keep.env'), false)
})

test('layered ignore rules preserve whitespace-sensitive ignore patterns', () => {
  const isIgnored = createLayeredIgnoreMatcher(
    [{ basePath: '', patterns: ['space\\ file.txt'] }],
    (patterns) => ignore().add(patterns),
  )

  assert.equal(isIgnored('space file.txt'), true)
  assert.equal(isIgnored('space-file.txt'), false)
})

test('context and tower ignore rules are root-scoped project filters', () => {
  const isIgnored = createLayeredIgnoreMatcher(
    [
      { basePath: '', patterns: ['fixtures/', 'generated/'] },
      { basePath: 'src', patterns: ['*.secret'] },
    ],
    (patterns) => ignore().add(patterns),
  )

  assert.equal(isIgnored('fixtures/output.xml'), true)
  assert.equal(isIgnored('packages/app/fixtures/output.xml'), true)
  assert.equal(isIgnored('generated/report.json'), true)
  assert.equal(isIgnored('src/token.secret'), true)
  assert.equal(isIgnored('packages/app/token.secret'), false)
})

test('ignore path normalization treats Windows separators like POSIX separators', () => {
  const isIgnored = createLayeredIgnoreMatcher(
    [
      { basePath: '', patterns: ['secrets/', '*.pem'] },
      { basePath: 'src/private', patterns: ['*.env'] },
    ],
    (patterns) => ignore().add(patterns),
  )

  assert.equal(isIgnored('secrets\\client.env'), true)
  assert.equal(isIgnored('certs\\client.pem'), true)
  assert.equal(isIgnored('src\\private\\local.env'), true)
  assert.equal(isIgnored('src\\public\\local.env'), false)
})

test('ignored secret-like files cannot be indexed or selected into context', async () => {
  const workspace: IndexedWorkspace = {
    id: 'w',
    name: 'demo',
    rootPath: '/repo',
  }
  const isIgnored = createLayeredIgnoreMatcher(
    [{ basePath: '', patterns: ['.env', '*.pem', 'secrets/'] }],
    (patterns) => ignore().add(patterns),
  )
  const index = new FileIndex(
    {
      async listFiles() {
        return ['/repo/src/app.ts', '/repo/.env', '/repo/cert.pem', '/repo/secrets/client.txt']
          .map((filePath) => ({
            filePath,
            relativePath: normalizeIgnorePath(filePath.replace('/repo/', '')),
          }))
          .filter(({ relativePath }) => !isIgnored(relativePath))
          .map(({ filePath }) => filePath)
      },
      async statFile(): Promise<FileStat> {
        return { sizeBytes: 40, mtimeMs: 1 }
      },
    },
    [workspace],
    getTokenEstimateProfile('claude'),
  )

  await index.ensureFresh()
  const selection = new FileSelection()
  selection.setNodeIncluded(index.getSnapshot(), 'w:', true)

  assert.deepEqual(
    index.getSnapshot().files.map((file) => file.relativePath),
    ['src/app.ts'],
  )
  assert.deepEqual(
    selection.getSnapshot().selectedFiles.map((file) => file.relativePath),
    ['src/app.ts'],
  )
})
