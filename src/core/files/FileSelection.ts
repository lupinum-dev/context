import { getFileTypeFilterDefinition } from './FileTypeFilter'
import type { FileIndexSnapshot, IndexedFile, IndexedNode } from './FileIndex'

export type CheckboxState = 'checked' | 'unchecked' | 'partial'

export interface SelectionIntent {
  includedNodeIds: ReadonlySet<string>
  excludedNodeIds: ReadonlySet<string>
  excludedFileTypeFilterIds: ReadonlySet<string>
}

export interface PersistedSelectionIntent {
  includedNodeIds: readonly string[]
  excludedNodeIds: readonly string[]
  excludedFileTypeFilterIds: readonly string[]
}

export interface EffectiveSelectionSnapshot {
  selectedFileIds: readonly string[]
  selectedFiles: readonly IndexedFile[]
  selectedEstimatedTokens: number
  checkboxStates: ReadonlyMap<string, CheckboxState>
  filterGroups: readonly SelectionFilterGroup[]
}

export interface SelectionFilterGroup {
  id: string
  label: string
  sortLabel: string
  selectedFiles: number
  totalFiles: number
  selectedEstimatedTokenCount: number
  excludedEstimatedTokenCount: number
  excluded: boolean
}

type Listener = (snapshot: EffectiveSelectionSnapshot) => void

export class FileSelection {
  private includedNodeIds = new Set<string>()
  private excludedNodeIds = new Set<string>()
  private excludedFileTypeFilterIds = new Set<string>()
  private listeners = new Set<Listener>()
  private snapshot: EffectiveSelectionSnapshot = createEmptySnapshot()
  private reconciledIndexVersion: number | undefined
  private reconciledIndex: FileIndexSnapshot | undefined

  onDidChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getIntent(): SelectionIntent {
    return {
      includedNodeIds: new Set(this.includedNodeIds),
      excludedNodeIds: new Set(this.excludedNodeIds),
      excludedFileTypeFilterIds: new Set(this.excludedFileTypeFilterIds),
    }
  }

  getPersistedIntent(): PersistedSelectionIntent {
    return serializeSelectionIntent(this.getIntent())
  }

  restoreIntent(index: FileIndexSnapshot, intent: PersistedSelectionIntent | undefined): void {
    this.includedNodeIds = new Set(intent?.includedNodeIds ?? [])
    this.excludedNodeIds = new Set(intent?.excludedNodeIds ?? [])
    this.excludedFileTypeFilterIds = new Set(intent?.excludedFileTypeFilterIds ?? [])
    this.reconcile(index)
  }

  getSnapshot(): EffectiveSelectionSnapshot {
    return this.snapshot
  }

  clear(index: FileIndexSnapshot): void {
    this.includedNodeIds.clear()
    this.excludedNodeIds.clear()
    this.rebuild(index)
  }

  resetFilters(index: FileIndexSnapshot): void {
    this.excludedFileTypeFilterIds.clear()
    this.rebuild(index)
  }

  excludeAllFilters(index: FileIndexSnapshot): void {
    for (const group of this.snapshot.filterGroups) {
      this.excludedFileTypeFilterIds.add(group.id)
    }
    this.rebuild(index)
  }

  setFileTypeFilterExcluded(
    index: FileIndexSnapshot,
    fileTypeFilterId: string,
    excluded: boolean,
  ): void {
    if (excluded) {
      this.excludedFileTypeFilterIds.add(fileTypeFilterId)
    } else {
      this.excludedFileTypeFilterIds.delete(fileTypeFilterId)
    }
    this.rebuild(index)
  }

  toggleNode(index: FileIndexSnapshot, nodeId: string): void {
    const state = this.snapshot.checkboxStates.get(nodeId) ?? 'unchecked'
    this.setNodeIncluded(index, nodeId, state !== 'checked')
  }

  setNodeIncluded(index: FileIndexSnapshot, nodeId: string, included: boolean): void {
    if (included) {
      this.includedNodeIds.add(nodeId)
      this.excludedNodeIds.delete(nodeId)
      for (const descendantId of collectDescendantIds(index, nodeId)) {
        this.excludedNodeIds.delete(descendantId)
      }
    } else {
      this.includedNodeIds.delete(nodeId)
      this.excludedNodeIds.add(nodeId)
      for (const descendantId of collectDescendantIds(index, nodeId)) {
        this.includedNodeIds.delete(descendantId)
      }
    }
    this.rebuild(index)
  }

  reconcile(index: FileIndexSnapshot): void {
    if (this.reconciledIndex === index && this.reconciledIndexVersion === index.version) {
      return
    }
    for (const nodeId of this.includedNodeIds) {
      if (!index.nodes.has(nodeId)) {
        this.includedNodeIds.delete(nodeId)
      }
    }
    for (const nodeId of this.excludedNodeIds) {
      if (!index.nodes.has(nodeId)) {
        this.excludedNodeIds.delete(nodeId)
      }
    }
    this.rebuild(index)
  }

  rebuild(index: FileIndexSnapshot): void {
    this.snapshot = deriveSelectionSnapshot(index, this.getIntent())
    this.reconciledIndexVersion = index.version
    this.reconciledIndex = index
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot)
    }
  }
}

export function serializeSelectionIntent(intent: SelectionIntent): PersistedSelectionIntent {
  return {
    includedNodeIds: [...intent.includedNodeIds],
    excludedNodeIds: [...intent.excludedNodeIds],
    excludedFileTypeFilterIds: [...intent.excludedFileTypeFilterIds],
  }
}

export function deriveSelectionSnapshot(
  index: FileIndexSnapshot,
  intent: SelectionIntent,
): EffectiveSelectionSnapshot {
  const selectedFiles: IndexedFile[] = []
  const ignoredFileIds = new Set<string>()
  const checkboxStates = new Map<string, CheckboxState>()
  const filterGroups = new Map<string, MutableSelectionFilterGroup>()

  for (const file of index.files) {
    const kind = getFileTypeFilterDefinition(file.name)
    const selectedByNode = isSelectedByIntent(file, index, intent)
    const excludedByFilter = intent.excludedFileTypeFilterIds.has(kind.id)
    const group = getOrCreateFilterGroup(filterGroups, kind, excludedByFilter)

    if (selectedByNode) {
      group.totalFiles += 1
      if (excludedByFilter) {
        ignoredFileIds.add(file.id)
        group.excludedEstimatedTokenCount += file.estimatedTokenCount
      } else {
        selectedFiles.push(file)
        group.selectedFiles += 1
        group.selectedEstimatedTokenCount += file.estimatedTokenCount
      }
    }
  }

  for (const rootId of index.rootIds) {
    deriveCheckboxState(
      rootId,
      index,
      new Set(selectedFiles.map((f) => f.id)),
      ignoredFileIds,
      checkboxStates,
    )
  }

  return {
    selectedFileIds: selectedFiles.map((file) => file.id),
    selectedFiles,
    selectedEstimatedTokens: selectedFiles.reduce((sum, file) => sum + file.estimatedTokenCount, 0),
    checkboxStates,
    filterGroups: [...filterGroups.values()].sort((left, right) =>
      left.sortLabel.localeCompare(right.sortLabel),
    ),
  }
}

function collectDescendantIds(index: FileIndexSnapshot, nodeId: string): string[] {
  const node = index.nodes.get(nodeId)
  if (!node || node.kind === 'file') {
    return []
  }
  const out: string[] = []
  const stack = [...node.childIds]
  while (stack.length > 0) {
    const id = stack.pop() as string
    out.push(id)
    const child = index.nodes.get(id)
    if (child && child.kind !== 'file') {
      stack.push(...child.childIds)
    }
  }
  return out
}

function isSelectedByIntent(
  file: IndexedFile,
  index: FileIndexSnapshot,
  intent: SelectionIntent,
): boolean {
  let node: IndexedNode | undefined = file
  while (node) {
    if (intent.includedNodeIds.has(node.id)) {
      return true
    }
    if (intent.excludedNodeIds.has(node.id)) {
      return false
    }
    node = node.parentId ? index.nodes.get(node.parentId) : undefined
  }
  return false
}

function deriveCheckboxState(
  nodeId: string,
  index: FileIndexSnapshot,
  selectedFileIds: ReadonlySet<string>,
  ignoredFileIds: ReadonlySet<string>,
  states: Map<string, CheckboxState>,
): CheckboxState | 'ignored' {
  const node = index.nodes.get(nodeId)
  if (!node) {
    return 'unchecked'
  }
  if (node.kind === 'file') {
    if (ignoredFileIds.has(node.id)) {
      states.set(nodeId, 'unchecked')
      return 'ignored'
    }
    const state = selectedFileIds.has(node.id) ? 'checked' : 'unchecked'
    states.set(nodeId, state)
    return state
  }

  const childStates = node.childIds
    .map((childId) => deriveCheckboxState(childId, index, selectedFileIds, ignoredFileIds, states))
    .filter((state) => state !== 'ignored')
  const checkedCount = childStates.filter((state) => state === 'checked').length
  const partialCount = childStates.filter((state) => state === 'partial').length
  const state =
    childStates.length > 0 && checkedCount === childStates.length
      ? 'checked'
      : checkedCount > 0 || partialCount > 0
        ? 'partial'
        : 'unchecked'
  states.set(nodeId, state)
  return state
}

interface MutableSelectionFilterGroup extends SelectionFilterGroup {
  selectedFiles: number
  totalFiles: number
  selectedEstimatedTokenCount: number
  excludedEstimatedTokenCount: number
}

function getOrCreateFilterGroup(
  groups: Map<string, MutableSelectionFilterGroup>,
  kind: ReturnType<typeof getFileTypeFilterDefinition>,
  excluded: boolean,
): MutableSelectionFilterGroup {
  let group = groups.get(kind.id)
  if (!group) {
    group = {
      id: kind.id,
      label: kind.label,
      sortLabel: kind.sortLabel,
      selectedFiles: 0,
      totalFiles: 0,
      selectedEstimatedTokenCount: 0,
      excludedEstimatedTokenCount: 0,
      excluded,
    }
    groups.set(kind.id, group)
  }
  group.excluded = excluded
  return group
}

function createEmptySnapshot(): EffectiveSelectionSnapshot {
  return {
    selectedFileIds: [],
    selectedFiles: [],
    selectedEstimatedTokens: 0,
    checkboxStates: new Map(),
    filterGroups: [],
  }
}
