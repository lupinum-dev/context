import * as vscode from 'vscode'
import type { ContextBuildOutput } from '../../app/ContextWorkflow'
import type { ContextOutputMode, ProjectTreeMode } from '../../core/context/ContextFormat'
import type { PromptExportOptions } from '../../core/export/ExportOptions'
import { buildPromptExportTarget } from '../../core/export/PromptFileWriter'
import { confirmLargeContextAction } from './contextActionConfirmation'
import type { ExtensionWiring } from './extensionWiring'

type ContextActionRequest =
  | {
      action: 'copy'
      services: ExtensionWiring
      treeMode: ProjectTreeMode
      outputMode: ContextOutputMode
    }
  | {
      action: 'create'
      services: ExtensionWiring
      treeMode: ProjectTreeMode
      outputMode: ContextOutputMode
      copy: boolean
      updatePreview: (text: string) => void | Promise<void>
      postState?: () => void | Promise<void>
    }
  | {
      action: 'save'
      services: ExtensionWiring
      treeMode: ProjectTreeMode
      outputMode: ContextOutputMode
      exportOptions: PromptExportOptions
      updatePreview: (text: string) => void | Promise<void>
      postState?: () => void | Promise<void>
    }

export type ContextActionResult =
  | { completed: false }
  | { completed: true; output: ContextBuildOutput; fileName?: string }

export async function runContextAction(
  request: ContextActionRequest,
): Promise<ContextActionResult> {
  if (!request.services.supportsLocalFilesystemWorkspace()) {
    vscode.window.showErrorMessage(
      'Lupinum Context only supports local filesystem workspaces for context generation.',
    )
    return { completed: false }
  }

  const preflight = await request.services.preflightContext({
    treeMode: request.treeMode,
    outputMode: request.outputMode,
  })
  const confirmAction = request.action === 'create' && request.copy ? 'copy' : request.action
  if (!(await confirmLargeContextAction(confirmAction, preflight.warnings))) {
    return { completed: false }
  }

  const output = await request.services.createContextFromSelection({
    treeMode: request.treeMode,
    outputMode: request.outputMode,
  })

  if (request.action === 'copy' || (request.action === 'create' && request.copy)) {
    await vscode.env.clipboard.writeText(output.text)
  }

  if (request.action === 'create') {
    await request.updatePreview(output.text)
    await request.postState?.()
    showContextResultMessage(
      request.copy ? 'Context copied to clipboard.' : 'Context created.',
      output.warnings.length,
    )
    return { completed: true, output }
  }

  if (request.action === 'save') {
    const workspaceRoot = request.services.getPrimaryWorkspaceRoot()
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Open a local workspace before saving context.')
      return { completed: false }
    }

    const target = buildPromptExportTarget(workspaceRoot, request.exportOptions, new Date())
    await request.services.fileSystem.writeText(target.absolutePath, output.text)
    await request.updatePreview(output.text)
    await request.postState?.()
    showContextResultMessage(`Saved ${target.fileName}.`, output.warnings.length)
    return { completed: true, output, fileName: target.fileName }
  }

  showContextResultMessage(
    formatCopyMessage(output.fileCount, output.commitCount),
    output.warnings.length,
  )
  return { completed: true, output }
}

function showContextResultMessage(successMessage: string, warningCount: number): void {
  if (warningCount === 0) {
    vscode.window.showInformationMessage(successMessage)
    return
  }

  vscode.window.showWarningMessage(`${successMessage} ${formatWarnings(warningCount)}.`)
}

function formatCopyMessage(fileCount: number, commitCount: number): string {
  const files = `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`
  if (commitCount === 0) {
    return `Copied ${files} to clipboard.`
  }

  const commits = `${commitCount} ${commitCount === 1 ? 'commit diff' : 'commit diffs'}`
  return `Copied ${files} and ${commits} to clipboard.`
}

function formatWarnings(count: number): string {
  return count === 1 ? '1 warning was reported' : `${count} warnings were reported`
}
