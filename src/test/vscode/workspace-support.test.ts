import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { isSupportedLocalWorkspace } from '../../vscode/shell/workspaceSupport'
import { createWorkspaceId } from '../../vscode/shell/workspaceIdentity'
import {
  FileIndex,
  createNodeId,
  type FileStat,
  type IndexedWorkspace,
} from '../../core/files/FileIndex'
import { FileSelection } from '../../core/files/FileSelection'
import { getTokenEstimateProfile } from '../../core/tokens/TokenEstimateProfiles'

test('workspace support allows local filesystem workspaces', () => {
  assert.equal(isSupportedLocalWorkspace([{ uri: { scheme: 'file' } }], undefined), true)
})

test('workspace support rejects remote or virtual workspaces', () => {
  assert.equal(isSupportedLocalWorkspace(undefined, undefined), false)
  assert.equal(isSupportedLocalWorkspace([], undefined), false)
  assert.equal(isSupportedLocalWorkspace([{ uri: { scheme: 'file' } }], 'ssh-remote'), false)
  assert.equal(isSupportedLocalWorkspace([{ uri: { scheme: 'vscode-vfs' } }], undefined), false)
})

test('workspace ids are stable by root path and prevent selection carryover', async () => {
  const first: IndexedWorkspace = {
    id: createWorkspaceId('/repo/app'),
    name: 'app',
    rootPath: '/repo/app',
  }
  const second: IndexedWorkspace = {
    id: createWorkspaceId('/repo/lib'),
    name: 'lib',
    rootPath: '/repo/lib',
  }
  assert.equal(createWorkspaceId('/repo/app/'), first.id)
  assert.notEqual(first.id, second.id)

  const index = new FileIndex(
    {
      async listFiles(workspace) {
        return [`${workspace.rootPath}/src/index.ts`]
      },
      async statFile(): Promise<FileStat> {
        return { sizeBytes: 40, mtimeMs: 1 }
      },
    },
    [first],
    getTokenEstimateProfile('claude'),
  )
  const selection = new FileSelection()

  await index.ensureFresh()
  selection.setNodeIncluded(index.getSnapshot(), createNodeId(first.id, ''), true)
  assert.deepEqual(
    selection.getSnapshot().selectedFiles.map((file) => file.absolutePath),
    ['/repo/app/src/index.ts'],
  )

  index.setWorkspaces([second])
  await index.ensureFresh()
  selection.reconcile(index.getSnapshot())

  assert.deepEqual(selection.getPersistedIntent().includedNodeIds, [])
  assert.deepEqual(selection.getSnapshot().selectedFiles, [])
})
