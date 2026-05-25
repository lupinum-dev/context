import { assembleContext } from '../core/context/ContextAssembler'
import { estimateContextCharacters } from '../core/context/ContextEstimate'
import type {
  ContextFile,
  ContextFileSnapshot,
  ContextGitDiff,
  ContextWarning,
  ContextOutputMode,
  ProjectTreeMode,
} from '../core/context/ContextFormat'
import { generateFileStructureTree } from '../core/context/ProjectTreeBuilder'
import { estimateGitDiffChars } from '../core/git/GitDiffFormatter'
import type { GitCommitDiff } from '../core/git/GitTypes'
import type { FileIndex, IndexedFile, IndexedNode, IndexedWorkspace } from '../core/files/FileIndex'
import type { FileSelection } from '../core/files/FileSelection'
import {
  BINARY_SNIFF_BYTES,
  decideFileSafetyBeforeRead,
  decideFileSafetyFromSample,
} from '../core/files/FileSafety'
import {
  estimateTokenCountFromTextLength,
  type TokenEstimateProfile,
} from '../core/tokens/TokenEstimateProfiles'

export interface TextFileSystem {
  readText(absolutePath: string): Promise<string>
  readBytes(absolutePath: string, maxBytes: number): Promise<Uint8Array>
}

export type ReadSelectedGitDiffs = () => Promise<readonly GitCommitDiff[]>

export interface ContextBuildOptions {
  prefix: string
  treeMode: ProjectTreeMode
  outputMode: ContextOutputMode
}

export interface ContextBuildOutput {
  text: string
  fileCount: number
  commitCount: number
  estimatedTokens: number
  warnings: readonly ContextWarning[]
}

export interface ContextPreflightResult {
  selectedFileCount: number
  selectedBytes: number
  selectedGitDiffCount: number
  selectedGitDiffCharacters: number
  estimatedCharacters: number
  estimateSummaries: Array<{ profile: TokenEstimateProfile; tokens: number }>
  omittedFileCount: number
  warnings: readonly ContextWarning[]
  requiresConfirmation: boolean
}

interface SelectedContextInspection {
  selectedFiles: readonly IndexedFile[]
  safeFiles: readonly IndexedFile[]
  contextFiles: readonly ContextFile[]
  projectTree: string
  gitDiffs: readonly ContextGitDiff[]
  warnings: readonly ContextWarning[]
  selectedBytes: number
  selectedGitDiffCharacters: number
  estimatedCharacters: number
}

interface CachedLineCount {
  sizeBytes: number
  mtimeMs: number
  lineCount: number
}

const LARGE_CONTEXT_TOKEN_THRESHOLD = 250_000
const LARGE_CONTEXT_CHARACTER_THRESHOLD = 1_000_000
const SELECTED_LINE_COUNT_CONCURRENCY = 16
const CONTEXT_FILE_READ_CONCURRENCY = 32

export class ContextWorkflow {
  private selectedLineCountCache = new Map<string, CachedLineCount>()

  constructor(
    private fileIndex: FileIndex,
    private fileSelection: FileSelection,
    private fileSystem: TextFileSystem,
    private tokenProfile: TokenEstimateProfile,
    private getWorkspaces: () => readonly IndexedWorkspace[] = () => [],
    private readSelectedGitDiffs?: ReadSelectedGitDiffs,
  ) {}

  async preflightContext(
    options: ContextBuildOptions,
    profiles: readonly TokenEstimateProfile[] = [this.tokenProfile],
  ): Promise<ContextPreflightResult> {
    const inspection = await this.inspectSelectedContext(options)
    const estimateSummaries = estimateProfiles(inspection.estimatedCharacters, profiles)
    const primaryEstimate =
      estimateSummaries.find(({ profile }) => profile.id === this.tokenProfile.id) ??
      estimateSummaries[0]
    const warnings = [...inspection.warnings]

    if (
      primaryEstimate &&
      (primaryEstimate.tokens >= LARGE_CONTEXT_TOKEN_THRESHOLD ||
        inspection.estimatedCharacters >= LARGE_CONTEXT_CHARACTER_THRESHOLD)
    ) {
      warnings.push({
        type: 'largeContext',
        estimatedTokens: primaryEstimate.tokens,
        characterCount: inspection.estimatedCharacters,
        message: `Estimated context is large: ${primaryEstimate.tokens} rough tokens, ${inspection.estimatedCharacters} characters.`,
      })
    }

    return {
      selectedFileCount: inspection.selectedFiles.length,
      selectedBytes: inspection.selectedBytes,
      selectedGitDiffCount: inspection.gitDiffs.length,
      selectedGitDiffCharacters: inspection.selectedGitDiffCharacters,
      estimatedCharacters: inspection.estimatedCharacters,
      estimateSummaries,
      omittedFileCount: inspection.warnings.filter((warning) => warning.type === 'omittedFile')
        .length,
      warnings,
      requiresConfirmation: warnings.some((warning) => warning.type === 'largeContext'),
    }
  }

  async createContextFromSelection(options: ContextBuildOptions): Promise<ContextBuildOutput> {
    const inspection = await this.inspectSelectedContext(options)
    const snapshots = await this.readSnapshots(inspection.safeFiles)
    const result = assembleContext({
      files: inspection.contextFiles,
      snapshots,
      prefix: options.prefix,
      projectTree: inspection.projectTree,
      treeMode: options.treeMode,
      outputMode: options.outputMode,
      gitDiffs: inspection.gitDiffs,
      warnings: inspection.warnings,
    })
    const estimatedTokens = estimateTokenCountFromTextLength(result.text, this.tokenProfile)
    const warnings = [...result.warnings]
    if (
      estimatedTokens >= LARGE_CONTEXT_TOKEN_THRESHOLD ||
      result.characterCount >= LARGE_CONTEXT_CHARACTER_THRESHOLD
    ) {
      warnings.push({
        type: 'largeContext',
        estimatedTokens,
        characterCount: result.characterCount,
        message: `Generated context is large: ${estimatedTokens} rough tokens, ${result.characterCount} characters.`,
      })
    }
    return {
      text: result.text,
      fileCount: result.fileCount,
      commitCount: result.commitCount,
      estimatedTokens,
      warnings,
    }
  }

  async estimatePreviewForProfiles(
    options: ContextBuildOptions,
    profiles: readonly TokenEstimateProfile[],
  ): Promise<Array<{ profile: TokenEstimateProfile; tokens: number }>> {
    await this.fileIndex.ensureFresh()
    const index = this.fileIndex.getSnapshot()
    this.fileSelection.reconcile(index)
    const selection = this.fileSelection.getSnapshot()
    const selectedFileBlockOverheadChars = selection.selectedFiles.reduce(
      (sum, file) => sum + estimateFileBlockOverheadChars(file, options.outputMode),
      0,
    )
    const selectedBytes = selection.selectedFiles.reduce((sum, file) => sum + file.sizeBytes, 0)
    const projectTreeCharacters = estimateProjectTreeCharacters(
      options.treeMode,
      index,
      selection.selectedFiles,
      this.getWorkspaces(),
    )
    const selectedGitDiffs = await this.loadGitDiffs()
    const selectedGitDiffCharacters = estimateGitDiffChars(
      selectedGitDiffs.gitDiffs,
      options.outputMode === 'compact',
    )
    const estimatedCharacters = estimateContextCharacters({
      prefix: options.prefix,
      suffix: '',
      selectedFileBlockChars: selectedFileBlockOverheadChars + selectedBytes,
      selectedFileCount: selection.selectedFiles.length,
      selectedGitDiffChars: selectedGitDiffCharacters,
      projectTree: '',
      projectTreeCharacters,
      treeType: options.treeMode,
      minify: options.outputMode === 'compact',
    })
    return estimateProfiles(estimatedCharacters, profiles)
  }

  async summarizeSelectedFiles(): Promise<{
    selectedFileCount: number
    selectedLineCount: number
  }> {
    await this.fileIndex.ensureFresh()
    this.fileSelection.reconcile(this.fileIndex.getSnapshot())
    const selection = this.fileSelection.getSnapshot()
    const selectedLineCounts = await mapWithConcurrency(
      selection.selectedFiles,
      SELECTED_LINE_COUNT_CONCURRENCY,
      (file) => this.countSelectedFileLines(file),
    )
    return {
      selectedFileCount: selection.selectedFiles.length,
      selectedLineCount: selectedLineCounts.reduce((sum, lineCount) => sum + lineCount, 0),
    }
  }

  private async inspectSelectedContext(
    options: ContextBuildOptions,
  ): Promise<SelectedContextInspection> {
    await this.fileIndex.ensureFresh()
    this.fileSelection.reconcile(this.fileIndex.getSnapshot())
    const selection = this.fileSelection.getSnapshot()
    const projectTree = this.buildProjectTree(options.treeMode)
    const selectedFileBlockOverheadChars = selection.selectedFiles.reduce(
      (sum, file) => sum + estimateFileBlockOverheadChars(file, options.outputMode),
      0,
    )
    const selectedGitDiffs = await this.loadGitDiffs()
    const selectedGitDiffCharacters = estimateGitDiffChars(
      selectedGitDiffs.gitDiffs,
      options.outputMode === 'compact',
    )
    const selectedBytes = selection.selectedFiles.reduce((sum, file) => sum + file.sizeBytes, 0)
    const estimatedCharacters = estimateContextCharacters({
      prefix: options.prefix,
      suffix: '',
      selectedFileBlockChars: selectedFileBlockOverheadChars + selectedBytes,
      selectedFileCount: selection.selectedFiles.length,
      selectedGitDiffChars: selectedGitDiffCharacters,
      projectTree,
      treeType: options.treeMode,
      minify: options.outputMode === 'compact',
    })
    const fileWarnings = await this.inspectFilesForSafety(selection.selectedFiles)
    const unsafeFileIds = new Set(
      fileWarnings
        .filter((warning) => warning.type === 'omittedFile' || warning.type === 'missingFile')
        .map((warning) => warning.fileId),
    )

    return {
      selectedFiles: selection.selectedFiles,
      safeFiles: selection.selectedFiles.filter((file) => !unsafeFileIds.has(file.id)),
      contextFiles: selection.selectedFiles.map(toContextFile),
      projectTree,
      gitDiffs: selectedGitDiffs.gitDiffs,
      warnings: sortWarnings([...fileWarnings, ...selectedGitDiffs.warnings]),
      selectedBytes,
      selectedGitDiffCharacters,
      estimatedCharacters,
    }
  }

  private async countSelectedFileLines(file: IndexedFile): Promise<number> {
    const cached = this.selectedLineCountCache.get(file.id)
    if (cached && cached.sizeBytes === file.sizeBytes && cached.mtimeMs === file.mtimeMs) {
      return cached.lineCount
    }

    const beforeRead = decideFileSafetyBeforeRead(file, this.getWorkspaces())
    if (beforeRead.action === 'omit') {
      this.selectedLineCountCache.set(file.id, {
        sizeBytes: file.sizeBytes,
        mtimeMs: file.mtimeMs,
        lineCount: 0,
      })
      return 0
    }

    try {
      const sample = await this.fileSystem.readBytes(file.absolutePath, BINARY_SNIFF_BYTES)
      if (decideFileSafetyFromSample(sample).action === 'omit') {
        this.selectedLineCountCache.set(file.id, {
          sizeBytes: file.sizeBytes,
          mtimeMs: file.mtimeMs,
          lineCount: 0,
        })
        return 0
      }
      const lineCount = countTextLines(await this.fileSystem.readText(file.absolutePath))
      this.selectedLineCountCache.set(file.id, {
        sizeBytes: file.sizeBytes,
        mtimeMs: file.mtimeMs,
        lineCount,
      })
      return lineCount
    } catch {
      this.selectedLineCountCache.delete(file.id)
      return 0
    }
  }

  private async loadGitDiffs(): Promise<{
    gitDiffs: ContextGitDiff[]
    warnings: ContextWarning[]
  }> {
    const diffs = await this.readSelectedGitDiffs?.()
    return {
      gitDiffs: (diffs ?? []).filter((diff) => diff.patch.length > 0).map(toContextGitDiff),
      warnings: (diffs ?? []).flatMap(toGitDiffWarnings),
    }
  }

  private async readSnapshots(
    files: readonly IndexedFile[],
  ): Promise<Map<string, ContextFileSnapshot>> {
    const snapshots = new Map<string, ContextFileSnapshot>()
    await mapWithConcurrency(files, CONTEXT_FILE_READ_CONCURRENCY, async (file) => {
      try {
        snapshots.set(file.id, {
          content: await this.fileSystem.readText(file.absolutePath),
        })
      } catch {
        // Missing snapshots are converted to user-visible context warnings by the assembler.
      }
    })
    return snapshots
  }

  private async inspectFilesForSafety(files: readonly IndexedFile[]): Promise<ContextWarning[]> {
    const warnings: ContextWarning[] = []
    await mapWithConcurrency(files, CONTEXT_FILE_READ_CONCURRENCY, async (file) => {
      const beforeRead = decideFileSafetyBeforeRead(file, this.getWorkspaces())
      if (beforeRead.action === 'omit') {
        warnings.push(toOmittedFileWarning(file, beforeRead.reason, beforeRead.message))
        return
      }

      try {
        const sample = await this.fileSystem.readBytes(file.absolutePath, BINARY_SNIFF_BYTES)
        const sampled = decideFileSafetyFromSample(sample)
        if (sampled.action === 'omit') {
          warnings.push(toOmittedFileWarning(file, sampled.reason, sampled.message))
        }
      } catch {
        warnings.push({
          type: 'missingFile',
          fileId: file.id,
          path: file.relativePath,
        })
      }
    })
    return sortWarnings(warnings)
  }

  private buildProjectTree(treeMode: ProjectTreeMode): string {
    if (treeMode === 'none') {
      return ''
    }

    const snapshot = this.fileIndex.getSnapshot()
    const selection = this.fileSelection.getSnapshot()
    const entries =
      treeMode === 'selectedFilesOnly'
        ? selection.selectedFiles
        : treeMode === 'fullDirectoriesOnly'
          ? [...snapshot.nodes.values()].filter((node) => node.kind !== 'file')
          : snapshot.files
    const rootNodes = snapshot.rootIds
      .map((id) => snapshot.nodes.get(id))
      .filter((node): node is IndexedNode => node !== undefined)
    const multiRoot = rootNodes.length > 1
    const workspaceNames = new Map(rootNodes.map((node) => [node.workspaceId, node.name]))
    const primaryRoot = multiRoot ? 'workspace' : (rootNodes[0]?.absolutePath ?? '')
    return generateFileStructureTree(
      primaryRoot,
      entries.map((entry) => ({
        tree: toTreePath(
          entry,
          workspaceNames.get(entry.workspaceId) ?? entry.workspaceId,
          multiRoot,
        ),
      })),
    )
  }
}

function toContextFile(file: IndexedFile): ContextFile {
  return {
    id: file.id,
    absolutePath: file.absolutePath,
    relativePath: file.relativePath,
    name: file.name,
  }
}

function toContextGitDiff(diff: GitCommitDiff): ContextGitDiff {
  return {
    commit: {
      id: diff.commit.id,
      workspaceName: diff.commit.workspaceName,
      hash: diff.commit.hash,
      shortHash: diff.commit.shortHash,
      authorName: diff.commit.authorName,
      authorDate: diff.commit.authorDate,
      subject: diff.commit.subject,
    },
    patch: diff.patch,
  }
}

function toGitDiffWarnings(diff: GitCommitDiff): ContextWarning[] {
  return (diff.warnings ?? []).map((message) => ({
    type: 'gitDiff',
    commitId: diff.commit.id,
    shortHash: diff.commit.shortHash,
    subject: diff.commit.subject,
    message,
  }))
}

function toTreePath(entry: IndexedNode, workspaceName: string, multiRoot: boolean): string {
  const relativePath = entry.kind === 'file' ? entry.relativePath : `${entry.relativePath}/`
  return multiRoot ? `${workspaceName}/${relativePath}` : relativePath
}

function estimateFileBlockOverheadChars(file: ContextFile, outputMode: ContextOutputMode): number {
  const sourcePath = `/${file.relativePath.replace(/\\/g, '/')}`
  if (outputMode === 'compact') {
    return `<file path="${sourcePath}"></file>`.length
  }

  return `<file name="${file.name}" path="${sourcePath}">\n\n</file>`.length
}

function countTextLines(text: string): number {
  if (text.length === 0) {
    return 0
  }

  const lineBreaks = text.match(/\r\n|\r|\n/g)?.length ?? 0
  return lineBreaks + (text.endsWith('\n') || text.endsWith('\r') ? 0 : 1)
}

function estimateProjectTreeCharacters(
  treeMode: ProjectTreeMode,
  index: ReturnType<FileIndex['getSnapshot']>,
  selectedFiles: readonly IndexedFile[],
  workspaces: readonly IndexedWorkspace[],
): number {
  if (treeMode === 'none') {
    return 0
  }

  const workspaceNameChars = workspaces.reduce((sum, workspace) => sum + workspace.name.length, 0)
  const entries =
    treeMode === 'selectedFilesOnly'
      ? selectedFiles.map((file) => file.relativePath)
      : treeMode === 'fullDirectoriesOnly'
        ? [...index.nodes.values()]
            .filter((node) => node.kind !== 'file' && node.relativePath.length > 0)
            .map((node) => node.relativePath)
        : index.files.map((file) => file.relativePath)

  if (entries.length === 0) {
    return workspaceNameChars
  }

  return (
    workspaceNameChars +
    entries.reduce((sum, entry) => sum + entry.length + estimateTreeLineOverhead(entry), 0)
  )
}

function estimateTreeLineOverhead(relativePath: string): number {
  const depth = relativePath.split('/').length
  return 4 + Math.max(0, depth - 1) * 3
}

function toOmittedFileWarning(
  file: IndexedFile,
  reason: Extract<ContextWarning, { type: 'omittedFile' }>['reason'],
  message: string,
): ContextWarning {
  return {
    type: 'omittedFile',
    fileId: file.id,
    path: file.relativePath,
    reason,
    message,
  }
}

function estimateProfiles(
  estimatedCharacters: number,
  profiles: readonly TokenEstimateProfile[],
): Array<{ profile: TokenEstimateProfile; tokens: number }> {
  return profiles.map((profile) => ({
    profile,
    tokens: Math.ceil(estimatedCharacters / profile.charsPerToken),
  }))
}

function sortWarnings(warnings: readonly ContextWarning[]): ContextWarning[] {
  return [...warnings].sort((left, right) => {
    const leftPath = 'path' in left ? left.path : ''
    const rightPath = 'path' in right ? right.path : ''
    return leftPath.localeCompare(rightPath)
  })
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  results.length = items.length
  let nextIndex = 0
  const workerCount = Math.min(concurrency, items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        results[currentIndex] = await worker(items[currentIndex])
      }
    }),
  )

  return results
}
