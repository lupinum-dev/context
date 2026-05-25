export type ProjectTreeMode =
  | 'fullFilesAndDirectories'
  | 'fullDirectoriesOnly'
  | 'selectedFilesOnly'
  | 'none'

export type ContextOutputMode = 'readable' | 'compact'

export interface ContextFile {
  id: string
  absolutePath: string
  relativePath: string
  name: string
}

export interface ContextFileSnapshot {
  content: string
}

export interface ContextGitCommit {
  id: string
  workspaceName: string
  hash: string
  shortHash: string
  authorName: string
  authorDate: string
  subject: string
}

export interface ContextGitDiff {
  commit: ContextGitCommit
  patch: string
}

export type ContextWarning =
  | {
      type: 'missingFile'
      fileId: string
      path: string
    }
  | {
      type: 'gitDiff'
      commitId: string
      shortHash: string
      subject: string
      message: string
    }
  | {
      type: 'largeContext'
      estimatedTokens: number
      characterCount: number
      message: string
    }
  | {
      type: 'omittedFile'
      fileId: string
      path: string
      reason: 'binary' | 'tooLarge' | 'outsideWorkspace'
      message: string
    }

export interface ContextBuildRequest {
  files: readonly ContextFile[]
  snapshots: ReadonlyMap<string, ContextFileSnapshot>
  prefix: string
  suffix?: string
  projectTree: string
  treeMode: ProjectTreeMode
  outputMode: ContextOutputMode
  gitDiffs?: readonly ContextGitDiff[]
  warnings?: readonly ContextWarning[]
}

export interface ContextBuildResult {
  text: string
  fileCount: number
  commitCount: number
  characterCount: number
  warnings: readonly ContextWarning[]
}
