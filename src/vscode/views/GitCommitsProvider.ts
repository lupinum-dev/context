import * as vscode from 'vscode'
import type { GitSelection } from '../../core/git/GitSelection'
import type { GitCommit } from '../../core/git/GitTypes'

export class GitCommitsProvider implements vscode.TreeDataProvider<GitCommit>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    GitCommit | undefined | void
  >()
  private readonly disposables: Array<() => void> = []
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event

  constructor(private gitSelection: GitSelection) {
    this.disposables.push(this.gitSelection.onDidChange(() => this.refresh()))
  }

  dispose(): void {
    for (const dispose of this.disposables) {
      dispose()
    }
    this.disposables.length = 0
    this.onDidChangeTreeDataEmitter.dispose()
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire()
  }

  getTreeItem(commit: GitCommit): vscode.TreeItem {
    const item = new vscode.TreeItem(commit.subject || commit.shortHash)
    const selected = this.gitSelection.getSnapshot().selectedCommitIds.includes(commit.id)
    item.id = commit.id
    item.description = `${commit.shortHash} · ${commit.workspaceName}`
    item.tooltip = `${commit.hash}\n${commit.authorName}\n${commit.authorDate}\n${commit.subject}`
    item.contextValue = 'gitCommit'
    item.iconPath = new vscode.ThemeIcon('git-commit')
    item.checkboxState = selected
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked
    return item
  }

  getChildren(): GitCommit[] {
    return [...this.gitSelection.getSnapshot().commits]
  }
}
