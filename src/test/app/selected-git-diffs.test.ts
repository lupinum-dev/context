import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { createSelectedGitDiffReader } from '../../app/SelectedGitDiffs'
import { GitSelection } from '../../core/git/GitSelection'
import type { GitCommit, GitCommitDiff } from '../../core/git/GitTypes'

test('SelectedGitDiffReader caches selected commit diffs', async () => {
  const selection = new GitSelection()
  const selected = commit('a1')
  let reads = 0
  selection.setCommits([selected])
  selection.setCommitSelected(selected.id, true)
  const reader = createSelectedGitDiffReader(selection, async (gitCommit) => {
    reads += 1
    return diff(gitCommit)
  })

  await reader.readSelectedGitDiffs()
  await reader.readSelectedGitDiffs()

  assert.equal(reads, 1)
})

test('SelectedGitDiffReader clears and prunes derived cached diffs', async () => {
  const selection = new GitSelection()
  const first = commit('a1')
  const second = commit('b2')
  let reads = 0
  selection.setCommits([first, second])
  selection.setCommitSelected(first.id, true)
  const reader = createSelectedGitDiffReader(selection, async (gitCommit) => {
    reads += 1
    return diff(gitCommit)
  })

  await reader.readSelectedGitDiffs()
  reader.clear()
  await reader.readSelectedGitDiffs()
  selection.setCommits([second])
  selection.setCommitSelected(second.id, true)
  const diffs = await reader.readSelectedGitDiffs()

  assert.equal(reads, 3)
  assert.deepEqual(
    diffs.map((gitDiff) => gitDiff.commit.id),
    [second.id],
  )
})

function commit(hash: string): GitCommit {
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

function diff(gitCommit: GitCommit): GitCommitDiff {
  return {
    commit: gitCommit,
    patch: `diff --git a/${gitCommit.shortHash}.ts b/${gitCommit.shortHash}.ts\n`,
  }
}
