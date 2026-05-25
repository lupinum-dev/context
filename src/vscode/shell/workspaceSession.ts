import * as vscode from 'vscode'
import type { ExtensionWiring } from './extensionWiring'
import {
  createDebouncedRefreshScheduler,
  shouldRefreshForFileEvent,
} from './workspaceRefreshEvents'

export class WorkspaceSession {
  private refreshScheduler = createDebouncedRefreshScheduler(() => {
    void this.refresh()
  }, 250)
  private watcherDisposables: vscode.Disposable[] = []
  private workspaceFolderSubscription: vscode.Disposable | undefined

  constructor(private services: ExtensionWiring) {}

  start(): void {
    this.rebuildWatchers()
    this.workspaceFolderSubscription = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.services.logger.info('[workspace] workspace folders changed')
      this.services.fileIndex.setWorkspaces(this.services.getWorkspaces())
      this.services.fileSelection.reconcile(this.services.fileIndex.getSnapshot())
      this.services.clearSelectedGitDiffCache()
      this.services.gitSelection.setCommits([])
      this.rebuildWatchers()
      this.refreshScheduler.requestRefresh()
      void this.refreshGitCommits()
    })
  }

  dispose(): void {
    this.refreshScheduler.dispose()
    this.workspaceFolderSubscription?.dispose()
    this.workspaceFolderSubscription = undefined
    this.disposeWatchers()
  }

  private rebuildWatchers(): void {
    this.disposeWatchers()
    for (const workspace of this.services.getWorkspaces()) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspace.rootPath, '**/*'),
      )
      watcher.onDidCreate((uri) => this.scheduleRefresh(workspace.rootPath, uri.fsPath))
      watcher.onDidChange((uri) => this.scheduleRefresh(workspace.rootPath, uri.fsPath))
      watcher.onDidDelete((uri) => this.scheduleRefresh(workspace.rootPath, uri.fsPath))
      this.watcherDisposables.push(watcher)
    }
  }

  private disposeWatchers(): void {
    for (const watcher of this.watcherDisposables) {
      watcher.dispose()
    }
    this.watcherDisposables = []
  }

  private scheduleRefresh(workspaceRoot: string, eventPath: string): void {
    if (!shouldRefreshForFileEvent(workspaceRoot, eventPath)) {
      this.services.logger.info(`[watcher] ignored file event: ${eventPath}`)
      return
    }
    this.services.fileIndex.markDirty()
    this.refreshScheduler.requestRefresh()
  }

  private async refresh(): Promise<void> {
    try {
      this.services.logger.info('[watcher] debounced refresh requested')
      await this.services.fileIndex.ensureFresh()
      this.services.fileSelection.reconcile(this.services.fileIndex.getSnapshot())
    } catch (error) {
      this.services.logger.error('[watcher] file event refresh failed', error)
    }
  }

  private async refreshGitCommits(): Promise<void> {
    try {
      const commits = await this.services.gitHost.listRecentCommits(
        this.services.getWorkspaces(),
        50,
      )
      this.services.clearSelectedGitDiffCache()
      this.services.gitSelection.setCommits(commits)
    } catch (error) {
      this.services.logger.error('[workspace] git refresh after workspace change failed', error)
    }
  }
}
