import * as fs from 'fs'
import * as path from 'path'
import { FileIndex, type IndexedWorkspace } from '../core/files/FileIndex'
import { getTokenEstimateProfile } from '../core/tokens/TokenEstimateProfiles'

const FIXTURE_ROOT = path.join(process.cwd(), 'src', 'test', 'fixtures')

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath)
    return true
  } catch {
    return false
  }
}

export async function readFixture(relativePath: string): Promise<string> {
  const content = await fs.promises.readFile(path.join(FIXTURE_ROOT, relativePath), 'utf8')
  return content.replace(/\n$/, '')
}

export function createMemoryStorage(initial: Record<string, unknown>) {
  const values = new Map(Object.entries(initial))
  return {
    get<T>(key: string, fallback: T): T {
      return (values.has(key) ? values.get(key) : fallback) as T
    },
    async update(key: string, value: unknown): Promise<void> {
      values.set(key, value)
    },
  }
}

export async function createSelectionFixtureIndex(relativePaths: string[]): Promise<FileIndex> {
  const workspace: IndexedWorkspace = {
    id: 'w',
    name: 'demo',
    rootPath: '/repo',
  }
  const index = new FileIndex(
    {
      async listFiles() {
        return relativePaths.map((relativePath) => `/repo/${relativePath}`)
      },
      async statFile(absolutePath: string) {
        return { sizeBytes: absolutePath.length * 10, mtimeMs: 1 }
      },
    },
    [workspace],
    getTokenEstimateProfile('claude'),
  )
  await index.ensureFresh()
  return index
}
