import * as vscode from 'vscode'
import type { FileIndex, IndexedNode } from '../../core/files/FileIndex'
import type { FileSelection } from '../../core/files/FileSelection'
import { formatEstimatedTokenCount } from '../../core/tokens/TokenEstimateProfiles'

export class FileTreeProvider implements vscode.TreeDataProvider<IndexedNode>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    IndexedNode | undefined | void
  >()
  private readonly disposables: Array<() => void> = []
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event

  constructor(
    private fileIndex: FileIndex,
    private fileSelection: FileSelection,
  ) {
    this.disposables.push(
      this.fileIndex.onDidChange(() => this.refresh()),
      this.fileSelection.onDidChange(() => this.refresh()),
    )
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

  getTreeItem(element: IndexedNode): vscode.TreeItem {
    const isFirstRoot = this.fileIndex.getSnapshot().rootIds[0] === element.id
    const collapsibleState =
      element.kind === 'file'
        ? vscode.TreeItemCollapsibleState.None
        : isFirstRoot
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
    const item = new vscode.TreeItem(element.name, collapsibleState)
    item.id = element.id
    item.resourceUri = element.kind === 'file' ? vscode.Uri.file(element.absolutePath) : undefined
    const selectionState =
      this.fileSelection.getSnapshot().checkboxStates.get(element.id) ?? 'unchecked'
    item.description =
      selectionState === 'partial'
        ? `[partial] ${formatEstimatedTokenCount(element.estimatedTokenCount)}`
        : formatEstimatedTokenCount(element.estimatedTokenCount)
    item.tooltip =
      selectionState === 'partial'
        ? `${element.absolutePath}\nPartially selected`
        : element.absolutePath
    item.contextValue = element.kind
    item.checkboxState = toVsCodeCheckboxState(selectionState)
    return item
  }

  getChildren(element?: IndexedNode): IndexedNode[] {
    const snapshot = this.fileIndex.getSnapshot()
    const ids = element ? (element.kind === 'file' ? [] : element.childIds) : snapshot.rootIds
    return ids
      .map((id) => snapshot.nodes.get(id))
      .filter((node): node is IndexedNode => node !== undefined)
  }
}

function toVsCodeCheckboxState(
  state: 'checked' | 'unchecked' | 'partial',
): vscode.TreeItemCheckboxState {
  return state === 'checked'
    ? vscode.TreeItemCheckboxState.Checked
    : vscode.TreeItemCheckboxState.Unchecked
}
