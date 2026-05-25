import * as vscode from 'vscode'
import {
  ContextWorkflow,
  type ContextBuildOptions,
  type ContextBuildOutput,
} from '../../app/ContextWorkflow'
import { PromptPrefixes } from '../../app/PromptPrefixes'
import { createSelectedGitDiffReader } from '../../app/SelectedGitDiffs'
import { WorkspaceSettings } from '../../app/WorkspaceSettings'
import { FileIndex, type IndexedWorkspace } from '../../core/files/FileIndex'
import { FileSelection } from '../../core/files/FileSelection'
import { GitSelection } from '../../core/git/GitSelection'
import { getTokenEstimateProfile } from '../../core/tokens/TokenEstimateProfiles'
import { VsCodeFileSystem } from '../VsCodeFileSystem'
import { VsCodeGit } from '../VsCodeGit'
import { OutputLogger } from './OutputLogger'
import { isSupportedLocalWorkspace } from './workspaceSupport'

export interface ExtensionWiring {
  getWorkspaces(): IndexedWorkspace[]
  getPrimaryWorkspaceRoot(): string | undefined
  supportsLocalFilesystemWorkspace(): boolean
  fileSystem: VsCodeFileSystem
  gitHost: VsCodeGit
  fileIndex: FileIndex
  fileSelection: FileSelection
  gitSelection: GitSelection
  contextWorkflow: ContextWorkflow
  promptPrefixes: PromptPrefixes
  workspaceState: WorkspaceSettings
  logger: OutputLogger
  createContextFromSelection(
    options: Omit<ContextBuildOptions, 'prefix'>,
  ): Promise<ContextBuildOutput>
  preflightContext(
    options: Omit<ContextBuildOptions, 'prefix'>,
  ): ReturnType<ContextWorkflow['preflightContext']>
  clearSelectedGitDiffCache(): void
}

export function createExtensionWiring(context: vscode.ExtensionContext): ExtensionWiring {
  const logger = new OutputLogger()
  const fileSystem = new VsCodeFileSystem(logger)
  const gitHost = new VsCodeGit(logger)
  const getWorkspaces = () => readWorkspaceFolders()
  const getPrimaryWorkspaceRoot = () => getWorkspaces()[0]?.rootPath
  const tokenProfile = getTokenEstimateProfile('claude')
  const fileIndex = new FileIndex(fileSystem, getWorkspaces(), tokenProfile, logger)
  const fileSelection = new FileSelection()
  const gitSelection = new GitSelection()
  const selectedGitDiffs = createSelectedGitDiffReader(gitSelection, (commit) =>
    gitHost.readCommitDiff(commit),
  )
  const contextWorkflow = new ContextWorkflow(
    fileIndex,
    fileSelection,
    fileSystem,
    tokenProfile,
    getWorkspaces,
    () => selectedGitDiffs.readSelectedGitDiffs(),
  )
  const promptPrefixes = new PromptPrefixes(context.globalState, context.workspaceState)
  const workspaceState = new WorkspaceSettings(context.workspaceState)

  return {
    getWorkspaces,
    getPrimaryWorkspaceRoot,
    supportsLocalFilesystemWorkspace(): boolean {
      return isSupportedLocalWorkspace(vscode.workspace.workspaceFolders, vscode.env.remoteName)
    },
    fileSystem,
    gitHost,
    fileIndex,
    fileSelection,
    gitSelection,
    contextWorkflow,
    promptPrefixes,
    workspaceState,
    logger,
    createContextFromSelection(options): Promise<ContextBuildOutput> {
      return contextWorkflow.createContextFromSelection({
        ...options,
        prefix: promptPrefixes.getEffectivePrefix(),
      })
    },
    preflightContext(options) {
      return contextWorkflow.preflightContext({
        ...options,
        prefix: promptPrefixes.getEffectivePrefix(),
      })
    },
    clearSelectedGitDiffCache(): void {
      selectedGitDiffs.clear()
    },
  }
}

function readWorkspaceFolders(): IndexedWorkspace[] {
  return (vscode.workspace.workspaceFolders ?? []).map((folder, index) => ({
    id: String(index),
    name: folder.name,
    rootPath: folder.uri.fsPath,
  }))
}
