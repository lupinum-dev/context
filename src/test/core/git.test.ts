import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { test } from 'vite-plus/test'
import { GitSelection } from '../../core/git/GitSelection'
import type { GitCommit } from '../../core/git/GitTypes'
import { VsCodeGit } from '../../vscode/VsCodeGit'

test('GitSelection keeps selected commits as derived state', () => {
  const selection = new GitSelection()
  const commits = [commit('a1', 'First'), commit('b2', 'Second'), commit('c3', 'Third')]

  selection.setCommits(commits)
  selection.selectLatest(2)

  assert.deepEqual(
    selection.getSnapshot().selectedCommits.map((selected) => selected.shortHash),
    ['a1', 'b2'],
  )
})

test('GitSelection drops selected commits that disappear after refresh', () => {
  const selection = new GitSelection()
  selection.setCommits([commit('a1', 'First'), commit('b2', 'Second')])
  selection.setCommitSelected('b2', true)

  selection.setCommits([commit('a1', 'First')])

  assert.deepEqual(selection.getSnapshot().selectedCommitIds, [])
})

test('VsCodeGit returns a warning instead of throwing when a selected diff cannot be read', async () => {
  const git = new VsCodeGit()
  const diff = await git.readCommitDiff(commit('missing', 'Missing commit'))

  assert.equal(diff.patch, '')
  assert.match(diff.warnings?.[0] ?? '', /Could not read commit diff/)
})

test('VsCodeGit logs an explicit message for non-git workspaces', async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lupinum-context-not-git-test-'))
  const messages: string[] = []
  try {
    const commits = await new VsCodeGit({
      info(message) {
        messages.push(message)
      },
      error() {},
    }).listRecentCommits([{ id: 'w', name: 'plain', rootPath }], 1)

    assert.deepEqual(commits, [])
    assert.match(messages.join('\n'), /not a Git repository/)
  } finally {
    await fs.rm(rootPath, { recursive: true, force: true })
  }
})

test('VsCodeGit logs an explicit message for empty repositories', async () => {
  const repo = await createTempGitRepo()
  const messages: string[] = []
  try {
    const commits = await new VsCodeGit({
      info(message) {
        messages.push(message)
      },
      error() {},
    }).listRecentCommits([{ id: 'w', name: 'empty', rootPath: repo }], 1)

    assert.deepEqual(commits, [])
    assert.match(messages.join('\n'), /has no commits/)
  } finally {
    await fs.rm(repo, { recursive: true, force: true })
  }
})

test('VsCodeGit warns when binary patch lines are omitted', async () => {
  const repo = await createTempGitRepo()
  try {
    await fs.writeFile(path.join(repo, 'image.bin'), Buffer.from([0, 1, 2, 3, 4, 5]))
    await git(repo, ['add', 'image.bin'])
    await git(repo, ['commit', '-m', 'Add binary'])
    const [commitInfo] = await new VsCodeGit().listRecentCommits(
      [{ id: 'w', name: 'demo', rootPath: repo }],
      1,
    )

    const diff = await new VsCodeGit().readCommitDiff(commitInfo)

    assert.match(diff.warnings?.join('\n') ?? '', /Binary patch content was omitted/)
  } finally {
    await fs.rm(repo, { recursive: true, force: true })
  }
})

test('VsCodeGit sorts recent commits globally across workspaces', async () => {
  const olderRepo = await createTempGitRepo()
  const newerRepo = await createTempGitRepo()
  try {
    await commitFile(olderRepo, 'older.txt', 'older', 'Older', '2026-05-16T10:00:00Z')
    await commitFile(newerRepo, 'newer.txt', 'newer', 'Newer', '2026-05-17T10:00:00Z')

    const commits = await new VsCodeGit().listRecentCommits(
      [
        { id: 'older', name: 'older', rootPath: olderRepo },
        { id: 'newer', name: 'newer', rootPath: newerRepo },
      ],
      2,
    )

    assert.deepEqual(
      commits.map((item) => item.subject),
      ['Newer', 'Older'],
    )
  } finally {
    await fs.rm(olderRepo, { recursive: true, force: true })
    await fs.rm(newerRepo, { recursive: true, force: true })
  }
})

test('VsCodeGit truncates oversized diffs with a warning', async () => {
  const repo = await createTempGitRepo()
  try {
    await fs.writeFile(path.join(repo, 'large.txt'), `${'x'.repeat(1_100_000)}\n`)
    await git(repo, ['add', 'large.txt'])
    await git(repo, ['commit', '-m', 'Add large file'])
    const [commitInfo] = await new VsCodeGit().listRecentCommits(
      [{ id: 'w', name: 'demo', rootPath: repo }],
      1,
    )

    const diff = await new VsCodeGit().readCommitDiff(commitInfo)
    const warnings = diff.warnings ?? []

    assert.ok(diff.patch.length < 1_010_000)
    assert.equal(warnings.length, 1)
    assert.match(warnings.join('\n'), /truncated after 1000000 bytes/)
  } finally {
    await fs.rm(repo, { recursive: true, force: true })
  }
})

function commit(hash: string, subject: string): GitCommit {
  return {
    id: `demo:${hash}`,
    workspaceId: 'demo',
    workspaceName: 'demo',
    rootPath: '/repo/demo',
    hash,
    shortHash: hash,
    authorName: 'Ada',
    authorDate: '2026-05-16T10:00:00.000Z',
    subject,
  }
}

async function createTempGitRepo(): Promise<string> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'lupinum-context-git-test-'))
  await git(repo, ['init'])
  await git(repo, ['config', 'user.name', 'Test User'])
  await git(repo, ['config', 'user.email', 'test@example.com'])
  return repo
}

async function commitFile(
  repo: string,
  fileName: string,
  content: string,
  message: string,
  date: string,
): Promise<void> {
  await fs.writeFile(path.join(repo, fileName), content)
  await git(repo, ['add', fileName])
  await git(repo, ['commit', '-m', message], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  })
}

function git(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
        return
      }
      resolve(stdout)
    })
  })
}
