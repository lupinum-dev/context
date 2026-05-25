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
  return (workspaceFolders ?? []).every((folder) => folder.uri.scheme === 'file')
}
