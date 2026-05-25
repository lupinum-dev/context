export interface WorkspaceFolderLike {
  uri: {
    scheme: string
  }
}

export function isSupportedLocalWorkspace(
  workspaceFolders: readonly WorkspaceFolderLike[] | undefined,
  remoteName: string | undefined,
): boolean {
  if (remoteName) {
    return false
  }
  const folders = workspaceFolders ?? []
  return folders.length > 0 && folders.every((folder) => folder.uri.scheme === 'file')
}
