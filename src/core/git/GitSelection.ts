import type { GitCommit } from './GitTypes'

export interface GitSelectionSnapshot {
  commits: readonly GitCommit[]
  selectedCommitIds: readonly string[]
  selectedCommits: readonly GitCommit[]
}

type Listener = (snapshot: GitSelectionSnapshot) => void

export class GitSelection {
  private commits: GitCommit[] = []
  private selectedCommitIds = new Set<string>()
  private listeners = new Set<Listener>()
  private snapshot: GitSelectionSnapshot = createSnapshot([], new Set())

  onDidChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): GitSelectionSnapshot {
    return this.snapshot
  }

  setCommits(commits: readonly GitCommit[]): void {
    this.commits = [...commits]
    const availableIds = new Set(this.commits.map((commit) => commit.id))
    for (const id of this.selectedCommitIds) {
      if (!availableIds.has(id)) {
        this.selectedCommitIds.delete(id)
      }
    }
    this.rebuild()
  }

  setCommitSelected(commitId: string, selected: boolean): void {
    if (selected) {
      this.selectedCommitIds.add(commitId)
    } else {
      this.selectedCommitIds.delete(commitId)
    }
    this.rebuild()
  }

  toggleCommit(commitId: string): void {
    this.setCommitSelected(commitId, !this.selectedCommitIds.has(commitId))
  }

  clear(): void {
    this.selectedCommitIds.clear()
    this.rebuild()
  }

  selectLatest(count: number): void {
    this.selectedCommitIds.clear()
    for (const commit of this.commits.slice(0, count)) {
      this.selectedCommitIds.add(commit.id)
    }
    this.rebuild()
  }

  private rebuild(): void {
    this.snapshot = createSnapshot(this.commits, this.selectedCommitIds)
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot)
    }
  }
}

function createSnapshot(
  commits: readonly GitCommit[],
  selectedCommitIds: ReadonlySet<string>,
): GitSelectionSnapshot {
  return {
    commits,
    selectedCommitIds: [...selectedCommitIds],
    selectedCommits: commits.filter((commit) => selectedCommitIds.has(commit.id)),
  }
}
