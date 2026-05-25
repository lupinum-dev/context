import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import {
  createDebouncedRefreshScheduler,
  shouldRefreshForFileEvent,
} from '../../vscode/shell/workspaceRefreshEvents'

test('workspace file events ignore built-in excluded paths', () => {
  const root = '/repo'

  assert.equal(shouldRefreshForFileEvent(root, '/repo/src/app.ts'), true)
  assert.equal(shouldRefreshForFileEvent(root, '/repo/node_modules/pkg/index.js'), false)
  assert.equal(shouldRefreshForFileEvent(root, '/repo/packages/app/dist/index.js'), false)
  assert.equal(shouldRefreshForFileEvent(root, '/repo/.git/index'), false)
  assert.equal(shouldRefreshForFileEvent(root, '/repo/pnpm-lock.yaml'), true)
  assert.equal(shouldRefreshForFileEvent(root, '/repo/.env.local'), false)
  assert.equal(shouldRefreshForFileEvent(root, '/repo/../outside.ts'), false)
})

test('workspace refresh scheduler coalesces repeated file events', async () => {
  let refreshes = 0
  const scheduler = createDebouncedRefreshScheduler(() => {
    refreshes += 1
  }, 5)

  scheduler.requestRefresh()
  scheduler.requestRefresh()
  scheduler.requestRefresh()
  await sleep(20)

  assert.equal(refreshes, 1)
  scheduler.dispose()
})

test('workspace refresh scheduler can cancel pending refreshes', async () => {
  let refreshes = 0
  const scheduler = createDebouncedRefreshScheduler(() => {
    refreshes += 1
  }, 10)

  scheduler.requestRefresh()
  scheduler.dispose()
  await sleep(20)

  assert.equal(refreshes, 0)
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
