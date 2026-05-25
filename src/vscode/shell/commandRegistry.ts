import * as vscode from 'vscode'
import type { ExtensionWiring } from './extensionWiring'
import { runContextAction } from './contextActions'

export function registerCommands(options: {
  context: vscode.ExtensionContext
  services: ExtensionWiring
  showPanel: () => void | Promise<void>
}): void {
  const { context, services, showPanel } = options

  context.subscriptions.push(
    vscode.commands.registerCommand('lupinumContext.open', showPanel),
    vscode.commands.registerCommand('lupinumContext.refresh', async () => {
      services.logger.info('[command] manual refresh requested')
      services.fileIndex.markDirty()
      await services.fileIndex.ensureFresh()
      services.fileSelection.reconcile(services.fileIndex.getSnapshot())
    }),
    vscode.commands.registerCommand('lupinumContext.showLogs', () => {
      services.logger.show()
    }),
    vscode.commands.registerCommand('lupinumContext.clearSelection', () => {
      services.fileSelection.clear(services.fileIndex.getSnapshot())
    }),
    vscode.commands.registerCommand('lupinumContext.includeAllFileTypeFilters', () => {
      services.fileSelection.resetFilters(services.fileIndex.getSnapshot())
    }),
    vscode.commands.registerCommand('lupinumContext.excludeAllFileTypeFilters', () => {
      services.fileSelection.excludeAllFilters(services.fileIndex.getSnapshot())
    }),
    vscode.commands.registerCommand('lupinumContext.refreshGitCommits', async () => {
      const commits = await services.gitHost.listRecentCommits(services.getWorkspaces(), 50)
      services.clearSelectedGitDiffCache()
      services.gitSelection.setCommits(commits)
    }),
    vscode.commands.registerCommand('lupinumContext.clearGitCommits', () => {
      services.gitSelection.clear()
    }),
    vscode.commands.registerCommand('lupinumContext.selectLatestGitCommit', () => {
      services.gitSelection.selectLatest(1)
    }),
    vscode.commands.registerCommand('lupinumContext.selectLatestThreeGitCommits', () => {
      services.gitSelection.selectLatest(3)
    }),
    vscode.commands.registerCommand('lupinumContext.addCurrentFile', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showWarningMessage('No active file.')
        return
      }
      await services.fileIndex.ensureFresh()
      const file = services.fileIndex.findFileByPath(editor.document.uri.fsPath)
      if (!file) {
        vscode.window.showWarningMessage('File is ignored or outside the workspace.')
        return
      }
      services.fileSelection.setNodeIncluded(services.fileIndex.getSnapshot(), file.id, true)
    }),
    vscode.commands.registerCommand('lupinumContext.copyContext', async () => {
      await runContextAction({
        action: 'copy',
        services,
        treeMode: services.workspaceState.getTreeMode(),
        outputMode: services.workspaceState.getOutputMode(),
      })
    }),
  )
}
