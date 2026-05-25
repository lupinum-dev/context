export interface GitWorkspace {
  id: string
  name: string
  rootPath: string
}

export interface GitCommit {
  id: string
  workspaceId: string
  workspaceName: string
  rootPath: string
  hash: string
  shortHash: string
  authorName: string
  authorDate: string
  subject: string
}

export interface GitCommitDiff {
  commit: GitCommit
  patch: string
  warnings?: readonly string[]
}

export interface GitCommitHost {
  listRecentCommits(workspaces: readonly GitWorkspace[], limit: number): Promise<GitCommit[]>
  readCommitDiff(commit: GitCommit): Promise<GitCommitDiff>
}
