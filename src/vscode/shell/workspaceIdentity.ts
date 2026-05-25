import * as path from 'path'

export function createWorkspaceId(rootPath: string): string {
  const normalizedRoot = trimTrailingRootSlash(path.resolve(rootPath).replace(/\\/g, '/'))
  return `workspace:${normalizedRoot}`
}

function trimTrailingRootSlash(rootPath: string): string {
  if (rootPath === '/' || /^[A-Za-z]:\/$/.test(rootPath)) {
    return rootPath
  }
  return rootPath.replace(/\/$/, '')
}
