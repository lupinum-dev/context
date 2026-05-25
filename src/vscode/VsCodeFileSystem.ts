import * as path from 'path'
import * as fs from 'fs/promises'
import * as vscode from 'vscode'
import ignore from 'ignore'
import type { FileIndexHost, FileStat, IndexedWorkspace } from '../core/files/FileIndex'
import { ALWAYS_IGNORE } from '../utils/alwaysIgnore'
import {
  createLayeredIgnoreMatcher,
  normalizeIgnorePath,
  type IgnoreRuleLayer,
} from '../core/files/IgnoreRules'
import type { FileIndexLogger } from '../core/files/FileIndex'

export class VsCodeFileSystem implements FileIndexHost {
  constructor(private logger?: FileIndexLogger) {}

  async listFiles(workspace: IndexedWorkspace): Promise<string[]> {
    const layers = await this.createIgnoreLayers(workspace)
    const isIgnored = createLayeredIgnoreMatcher(layers, createIgnoreMatcher)
    const exclude = buildFindFilesExcludePattern()
    const startedAt = Date.now()
    const uris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspace.rootPath, '**/*'),
      exclude,
      undefined,
    )
    this.logger?.info(
      `[fs] findFiles returned ${uris.length} uri(s) for ${workspace.name} in ${Date.now() - startedAt}ms`,
    )
    return uris
      .map((uri) => uri.fsPath)
      .filter((absolutePath) => {
        const relativePath = normalizeIgnorePath(path.relative(workspace.rootPath, absolutePath))
        return !isIgnored(relativePath)
      })
  }

  async statFile(absolutePath: string): Promise<FileStat | null> {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath))
      if (stat.type !== vscode.FileType.File) {
        return null
      }
      return {
        sizeBytes: stat.size,
        mtimeMs: stat.mtime,
      }
    } catch {
      return null
    }
  }

  async readText(absolutePath: string): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(absolutePath))
    return Buffer.from(bytes).toString('utf8')
  }

  async readBytes(absolutePath: string, maxBytes: number): Promise<Uint8Array> {
    const handle = await fs.open(absolutePath, 'r')
    try {
      const buffer = Buffer.alloc(maxBytes)
      const result = await handle.read(buffer, 0, maxBytes, 0)
      return buffer.subarray(0, result.bytesRead)
    } finally {
      await handle.close()
    }
  }

  async writeText(absolutePath: string, content: string): Promise<void> {
    const uri = vscode.Uri.file(absolutePath)
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(absolutePath)))
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'))
  }

  private async createIgnoreLayers(workspace: IndexedWorkspace): Promise<IgnoreRuleLayer[]> {
    const layers: IgnoreRuleLayer[] = [
      {
        basePath: '',
        patterns: ALWAYS_IGNORE,
      },
      {
        basePath: '',
        patterns: await this.readIgnoreFile(path.join(workspace.rootPath, '.contextignore')),
      },
      {
        basePath: '',
        patterns: await this.readIgnoreFile(path.join(workspace.rootPath, '.towerignore')),
      },
    ]

    if (!vscode.workspace.getConfiguration('lupinumContext').get<boolean>('useGitignore', true)) {
      return layers
    }

    const gitignorePaths = await this.findGitignorePaths(workspace)
    for (const filePath of gitignorePaths) {
      layers.push({
        basePath: normalizeIgnorePath(path.relative(workspace.rootPath, path.dirname(filePath))),
        patterns: await this.readIgnoreFile(filePath),
      })
    }
    return layers
  }

  private async findGitignorePaths(workspace: IndexedWorkspace): Promise<string[]> {
    const exclude = buildFindFilesExcludePattern()
    const uris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspace.rootPath, '**/.gitignore'),
      exclude,
      undefined,
    )
    return [path.join(workspace.rootPath, '.gitignore'), ...uris.map((uri) => uri.fsPath)]
      .filter((filePath, index, paths) => paths.indexOf(filePath) === index)
      .sort(
        (left, right) =>
          path.relative(workspace.rootPath, left).split(path.sep).length -
          path.relative(workspace.rootPath, right).split(path.sep).length,
      )
  }

  private async readIgnoreFile(filePath: string): Promise<string[]> {
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))
      const content = Buffer.from(bytes).toString('utf8')
      return content
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.trimStart().startsWith('#'))
    } catch {
      return []
    }
  }
}

function createIgnoreMatcher(patterns: readonly string[]): ignore.Ignore {
  return ignore().add(patterns)
}

function buildFindFilesExcludePattern(): string {
  const patterns = ALWAYS_IGNORE.flatMap((pattern) => toFindFilesExclude(pattern))
  return `{${[...new Set(patterns)].join(',')}}`
}

function toFindFilesExclude(pattern: string): string[] {
  const normalized = pattern.replace(/\\/g, '/')
  if (!normalized || normalized.includes('*.')) {
    return []
  }
  if (normalized.startsWith('**/') && normalized.endsWith('/**')) {
    return [normalized]
  }
  if (normalized.endsWith('/')) {
    const directory = normalized.replace(/\/+$/, '')
    return [directory, `**/${directory}/**`]
  }
  if (normalized.startsWith('.')) {
    return [normalized, `**/${normalized}`]
  }
  return []
}
