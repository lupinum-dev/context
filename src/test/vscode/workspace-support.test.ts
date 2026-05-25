import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { isSupportedLocalWorkspace } from '../../vscode/shell/workspaceSupport'

test('workspace support allows local filesystem workspaces', () => {
  assert.equal(isSupportedLocalWorkspace([{ uri: { scheme: 'file' } }], undefined), true)
})

test('workspace support rejects remote or virtual workspaces', () => {
  assert.equal(isSupportedLocalWorkspace([{ uri: { scheme: 'file' } }], 'ssh-remote'), false)
  assert.equal(isSupportedLocalWorkspace([{ uri: { scheme: 'vscode-vfs' } }], undefined), false)
})
