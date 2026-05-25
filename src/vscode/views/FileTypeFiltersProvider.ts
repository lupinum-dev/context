import * as vscode from 'vscode'
import type { FileSelection, SelectionFilterGroup } from '../../core/files/FileSelection'
import { formatEstimatedTokenCount } from '../../core/tokens/TokenEstimateProfiles'

export interface SelectionFilterNode {
  group: SelectionFilterGroup
}

export class FileTypeFiltersProvider
  implements vscode.TreeDataProvider<SelectionFilterNode>, vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    SelectionFilterNode | undefined | void
  >()
  private readonly disposables: Array<() => void> = []
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event

  constructor(private fileSelection: FileSelection) {
    this.disposables.push(this.fileSelection.onDidChange(() => this.refresh()))
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

  getTreeItem(element: SelectionFilterNode): vscode.TreeItem {
    const group = element.group
    const item = new vscode.TreeItem(formatFilterLabel(group), vscode.TreeItemCollapsibleState.None)
    item.checkboxState = group.excluded
      ? vscode.TreeItemCheckboxState.Unchecked
      : vscode.TreeItemCheckboxState.Checked
    item.description = group.excluded
      ? `excluded · ${formatEstimatedTokenCount(group.excludedEstimatedTokenCount)}`
      : formatEstimatedTokenCount(group.selectedEstimatedTokenCount)
    item.tooltip = group.excluded
      ? `${group.label} excluded from folder selections`
      : `${group.label} included`
    item.contextValue = 'selectionFilter'
    const resourceUri = getFilterResourceUri(group)
    if (resourceUri) {
      item.resourceUri = resourceUri
    } else {
      item.iconPath =
        group.id === 'pattern:test'
          ? new vscode.ThemeIcon('beaker')
          : new vscode.ThemeIcon('symbol-interface')
    }
    return item
  }

  getChildren(): SelectionFilterNode[] {
    return this.fileSelection.getSnapshot().filterGroups.map((group) => ({ group }))
  }
}

function formatFilterLabel(group: SelectionFilterGroup): string {
  return group.label
    .replace(/ files$/, '')
    .replace('Test files (*.test.*, *.spec.*)', 'Tests')
    .replace('Declaration files (*.d.ts)', 'Types')
}

function getFilterResourceUri(group: SelectionFilterGroup): vscode.Uri | undefined {
  const extension = group.id.startsWith('extension:')
    ? group.id.slice('extension:'.length)
    : undefined
  if (!extension || extension === '(no extension)') {
    return undefined
  }
  return vscode.Uri.file(`/__lupinum_context_filter__/filter${extension}`)
}
