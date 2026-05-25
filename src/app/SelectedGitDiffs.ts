import type { GitSelection } from '../core/git/GitSelection'
import type { GitCommit, GitCommitDiff } from '../core/git/GitTypes'

export type ReadCommitDiff = (commit: GitCommit) => Promise<GitCommitDiff>

export interface SelectedGitDiffReader {
  readSelectedGitDiffs(): Promise<readonly GitCommitDiff[]>
  clear(): void
}

export function createSelectedGitDiffReader(
  gitSelection: GitSelection,
  readCommitDiff: ReadCommitDiff,
): SelectedGitDiffReader {
  const cache = new Map<string, Promise<GitCommitDiff>>()

  return {
    async readSelectedGitDiffs() {
      const selectedCommits = gitSelection.getSnapshot().selectedCommits
      const selectedKeys = new Set(selectedCommits.map(createCacheKey))
      for (const key of cache.keys()) {
        if (!selectedKeys.has(key)) {
          cache.delete(key)
        }
      }

      return Promise.all(
        selectedCommits.map((commit) => {
          const key = createCacheKey(commit)
          const cached = cache.get(key)
          if (cached) {
            return cached
          }
          const diff = readCommitDiff(commit)
          cache.set(key, diff)
          return diff
        }),
      )
    },
    clear() {
      cache.clear()
    },
  }
}

function createCacheKey(commit: GitCommit): string {
  return `${commit.id}:${commit.hash}`
}
