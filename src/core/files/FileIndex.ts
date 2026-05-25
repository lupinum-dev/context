import { estimateTokenCountFromBytes } from '../tokens/TokenEstimateProfiles'
import type { TokenEstimateProfile } from '../tokens/TokenEstimateProfiles'
import path from 'path'
import { getBaseName, getDirName, getExtension, joinPath, toPosixPath } from './pathUtils'

export type IndexedNodeKind = 'workspace' | 'directory' | 'file'
export type IndexRefreshState = 'idle' | 'dirty' | 'refreshing'

export interface IndexedWorkspace {
  id: string
  name: string
  rootPath: string
}

export interface IndexedFile {
  id: string
  kind: 'file'
  workspaceId: string
  absolutePath: string
  relativePath: string
  name: string
  extension: string | null
  sizeBytes: number
  mtimeMs: number
  parentId: string
  estimatedTokenCount: number
}

export interface IndexedDirectory {
  id: string
  kind: 'directory' | 'workspace'
  workspaceId: string
  absolutePath: string
  relativePath: string
  name: string
  parentId: string | null
  childIds: readonly string[]
  estimatedTokenCount: number
}

export type IndexedNode = IndexedFile | IndexedDirectory

export interface FileIndexSnapshot {
  nodes: ReadonlyMap<string, IndexedNode>
  rootIds: readonly string[]
  files: readonly IndexedFile[]
  version: number
}

export interface FileStat {
  sizeBytes: number
  mtimeMs: number
}

export interface FileIndexHost {
  listFiles(workspace: IndexedWorkspace): Promise<string[]>
  statFile(absolutePath: string): Promise<FileStat | null>
}

export interface FileIndexLogger {
  info(message: string): void
  error(message: string, error: unknown): void
}

type Listener = (snapshot: FileIndexSnapshot) => void

export class FileIndex {
  private nodes = new Map<string, IndexedNode>()
  private rootIds: string[] = []
  private files: IndexedFile[] = []
  private listeners = new Set<Listener>()
  private state: IndexRefreshState = 'dirty'
  private dirtyVersion = 1
  private refreshedVersion = 0
  private snapshotVersion = 0
  private snapshot: FileIndexSnapshot = createSnapshot(new Map(), [], [], 0)
  private refreshInFlight: Promise<void> | undefined

  constructor(
    private host: FileIndexHost,
    private workspaces: readonly IndexedWorkspace[],
    private tokenProfile: TokenEstimateProfile,
    private logger?: FileIndexLogger,
  ) {
    this.initializeWorkspaceRoots()
  }

  onDidChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setWorkspaces(workspaces: readonly IndexedWorkspace[]): void {
    this.workspaces = workspaces
    this.initializeWorkspaceRoots()
    this.markDirty()
  }

  markDirty(): void {
    this.dirtyVersion += 1
    if (this.state !== 'refreshing') {
      this.state = 'dirty'
    }
  }

  getRefreshState(): IndexRefreshState {
    return this.state
  }

  getSnapshot(): FileIndexSnapshot {
    return this.snapshot
  }

  findNode(nodeId: string): IndexedNode | undefined {
    return this.nodes.get(nodeId)
  }

  findFileByPath(absolutePath: string): IndexedFile | undefined {
    return this.files.find((file) => file.absolutePath === absolutePath)
  }

  async ensureFresh(): Promise<void> {
    if (!this.isDirty()) {
      return
    }

    if (this.refreshInFlight) {
      await this.refreshInFlight
      return this.ensureFresh()
    }

    this.refreshInFlight = this.refreshOnce()
    try {
      await this.refreshInFlight
    } finally {
      this.refreshInFlight = undefined
    }

    if (this.isDirty()) {
      await this.ensureFresh()
    }
  }

  private isDirty(): boolean {
    return this.dirtyVersion !== this.refreshedVersion
  }

  private async refreshOnce(): Promise<void> {
    const version = this.dirtyVersion
    this.state = 'refreshing'
    const startedAt = Date.now()
    this.logger?.info(
      `[index] refresh started: ${this.workspaces.length} workspace(s), dirtyVersion=${version}`,
    )
    const nodes = new Map<string, IndexedNode>()
    const rootIds: string[] = []
    const files: IndexedFile[] = []

    for (const workspace of this.workspaces) {
      const rootId = createNodeId(workspace.id, '')
      rootIds.push(rootId)
      nodes.set(rootId, {
        id: rootId,
        kind: 'workspace',
        workspaceId: workspace.id,
        absolutePath: workspace.rootPath,
        relativePath: '',
        name: workspace.name,
        parentId: null,
        childIds: [],
        estimatedTokenCount: 0,
      })

      const workspaceStartedAt = Date.now()
      this.logger?.info(`[index] listing ${workspace.name}: ${workspace.rootPath}`)
      const paths = await this.host.listFiles(workspace)
      this.logger?.info(
        `[index] listed ${workspace.name}: ${paths.length} path(s) in ${Date.now() - workspaceStartedAt}ms`,
      )
      const stats = await mapWithConcurrency(paths, 64, async (absolutePath) => ({
        absolutePath,
        stat: await this.host.statFile(absolutePath),
      }))
      for (const { absolutePath, stat } of stats) {
        if (!stat) {
          continue
        }

        const relativePath = toRelativePath(workspace.rootPath, absolutePath)
        if (relativePath === null) {
          continue
        }
        const parentId = this.ensureDirectoryNodes(workspace, relativePath, nodes)
        const file = createIndexedFile(
          workspace,
          absolutePath,
          relativePath,
          parentId,
          stat,
          this.tokenProfile,
        )
        nodes.set(file.id, file)
        files.push(file)
        appendChild(nodes, parentId, file.id)
      }
    }

    sortIndexedFiles(files, this.workspaces)
    sortDirectoryChildren(nodes)
    recomputeDirectoryEstimates(nodes, rootIds)

    this.nodes = nodes
    this.rootIds = rootIds
    this.files = files
    this.snapshotVersion += 1
    this.snapshot = createSnapshot(this.nodes, this.rootIds, this.files, this.snapshotVersion)
    this.refreshedVersion = version
    this.state = this.isDirty() ? 'dirty' : 'idle'
    this.logger?.info(
      `[index] refresh finished: ${files.length} file(s), ${nodes.size} node(s), state=${this.state}, ${Date.now() - startedAt}ms`,
    )
    this.emit()
  }

  private initializeWorkspaceRoots(): void {
    const nodes = new Map<string, IndexedNode>()
    const rootIds: string[] = []
    for (const workspace of this.workspaces) {
      const rootId = createNodeId(workspace.id, '')
      rootIds.push(rootId)
      nodes.set(rootId, {
        id: rootId,
        kind: 'workspace',
        workspaceId: workspace.id,
        absolutePath: workspace.rootPath,
        relativePath: '',
        name: workspace.name,
        parentId: null,
        childIds: [],
        estimatedTokenCount: 0,
      })
    }
    this.nodes = nodes
    this.rootIds = rootIds
    this.files = []
    this.snapshotVersion += 1
    this.snapshot = createSnapshot(this.nodes, this.rootIds, this.files, this.snapshotVersion)
    this.emit()
  }

  private ensureDirectoryNodes(
    workspace: IndexedWorkspace,
    fileRelativePath: string,
    nodes: Map<string, IndexedNode>,
  ): string {
    const directoryPath = getDirName(fileRelativePath)
    if (!directoryPath) {
      return createNodeId(workspace.id, '')
    }

    let parentId = createNodeId(workspace.id, '')
    let currentPath = ''
    for (const segment of directoryPath.split('/')) {
      currentPath = joinPath(currentPath, segment)
      const id = createNodeId(workspace.id, currentPath)
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          kind: 'directory',
          workspaceId: workspace.id,
          absolutePath: joinPath(workspace.rootPath, currentPath),
          relativePath: currentPath,
          name: segment,
          parentId,
          childIds: [],
          estimatedTokenCount: 0,
        })
        appendChild(nodes, parentId, id)
      }
      parentId = id
    }
    return parentId
  }

  private emit(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

function createIndexedFile(
  workspace: IndexedWorkspace,
  absolutePath: string,
  relativePath: string,
  parentId: string,
  stat: FileStat,
  profile: TokenEstimateProfile,
): IndexedFile {
  const name = getBaseName(relativePath)
  return {
    id: createNodeId(workspace.id, relativePath),
    kind: 'file',
    workspaceId: workspace.id,
    absolutePath,
    relativePath,
    name,
    extension: getExtension(name),
    sizeBytes: stat.sizeBytes,
    mtimeMs: stat.mtimeMs,
    parentId,
    estimatedTokenCount: estimateTokenCountFromBytes(stat.sizeBytes, profile, name),
  }
}

function createSnapshot(
  nodes: ReadonlyMap<string, IndexedNode>,
  rootIds: readonly string[],
  files: readonly IndexedFile[],
  version: number,
): FileIndexSnapshot {
  const clonedNodes = new Map<string, IndexedNode>()

  for (const [id, node] of nodes) {
    const cloned = cloneIndexedNode(node)
    clonedNodes.set(id, cloned)
  }
  const clonedFiles = files
    .map((file) => clonedNodes.get(file.id))
    .filter((node): node is IndexedFile => node?.kind === 'file')

  return {
    nodes: new ReadonlyNodeMap(clonedNodes),
    rootIds: Object.freeze([...rootIds]),
    files: Object.freeze(clonedFiles),
    version,
  }
}

function cloneIndexedNode(node: IndexedNode): IndexedNode {
  return Object.freeze(
    node.kind === 'file' ? { ...node } : { ...node, childIds: Object.freeze([...node.childIds]) },
  ) as IndexedNode
}

function sortIndexedFiles(files: IndexedFile[], workspaces: readonly IndexedWorkspace[]): void {
  const workspaceOrder = new Map(workspaces.map((workspace, index) => [workspace.id, index]))
  files.sort((left, right) => {
    const workspaceDelta =
      (workspaceOrder.get(left.workspaceId) ?? Number.MAX_SAFE_INTEGER) -
      (workspaceOrder.get(right.workspaceId) ?? Number.MAX_SAFE_INTEGER)
    if (workspaceDelta !== 0) {
      return workspaceDelta
    }
    return left.relativePath.localeCompare(right.relativePath)
  })
}

class ReadonlyNodeMap implements ReadonlyMap<string, IndexedNode> {
  readonly [Symbol.toStringTag] = 'ReadonlyNodeMap'

  constructor(private readonly map: ReadonlyMap<string, IndexedNode>) {}

  get size(): number {
    return this.map.size
  }

  get(key: string): IndexedNode | undefined {
    return this.map.get(key)
  }

  has(key: string): boolean {
    return this.map.has(key)
  }

  forEach(
    callbackfn: (value: IndexedNode, key: string, map: ReadonlyMap<string, IndexedNode>) => void,
    thisArg?: unknown,
  ): void {
    this.map.forEach((value, key) => callbackfn.call(thisArg, value, key, this))
  }

  entries(): IterableIterator<[string, IndexedNode]> {
    return this.map.entries()
  }

  keys(): IterableIterator<string> {
    return this.map.keys()
  }

  values(): IterableIterator<IndexedNode> {
    return this.map.values()
  }

  [Symbol.iterator](): IterableIterator<[string, IndexedNode]> {
    return this.entries()
  }
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

export function createNodeId(workspaceId: string, relativePath: string): string {
  return `${workspaceId}:${toPosixPath(relativePath)}`
}

function toRelativePath(workspaceRoot: string, absolutePath: string): string | null {
  const normalizedRoot = path.posix.normalize(toPosixPath(workspaceRoot)).replace(/\/$/, '')
  const normalizedPath = path.posix.normalize(toPosixPath(absolutePath))
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return null
  }
  const relativePath = normalizedPath.slice(normalizedRoot.length + 1)
  return relativePath.startsWith('../') || relativePath === '..' ? null : relativePath
}

function appendChild(nodes: Map<string, IndexedNode>, parentId: string, childId: string): void {
  const parent = nodes.get(parentId)
  if (!parent || parent.kind === 'file' || parent.childIds.includes(childId)) {
    return
  }
  ;(parent.childIds as string[]).push(childId)
}

function sortDirectoryChildren(nodes: Map<string, IndexedNode>): void {
  for (const node of nodes.values()) {
    if (node.kind === 'file') {
      continue
    }
    ;(node.childIds as string[]).sort((leftId, rightId) => {
      const left = nodes.get(leftId)!
      const right = nodes.get(rightId)!
      if (left.kind !== right.kind) {
        return left.kind === 'directory' || left.kind === 'workspace' ? -1 : 1
      }
      return left.name.localeCompare(right.name)
    })
  }
}

function recomputeDirectoryEstimates(
  nodes: Map<string, IndexedNode>,
  rootIds: readonly string[],
): void {
  const visit = (nodeId: string): number => {
    const node = nodes.get(nodeId)
    if (!node) {
      return 0
    }
    if (node.kind === 'file') {
      return node.estimatedTokenCount
    }
    const total = node.childIds.reduce((sum, childId) => sum + visit(childId), 0)
    node.estimatedTokenCount = total
    return total
  }

  for (const rootId of rootIds) {
    visit(rootId)
  }
}
