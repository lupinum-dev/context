export interface FileTypeFilterDefinition {
  id: string
  label: string
  sortLabel: string
}

export function getFileTypeFilterDefinition(fileName: string): FileTypeFilterDefinition {
  const normalizedName = fileName.toLowerCase()

  if (/\.d\.ts$/i.test(normalizedName)) {
    return {
      id: 'pattern:declaration',
      label: 'Declaration files (*.d.ts)',
      sortLabel: 'zz-declaration',
    }
  }

  if (/\.(test|spec)\.[^.]+$/i.test(normalizedName)) {
    return {
      id: 'pattern:test',
      label: 'Test files (*.test.*, *.spec.*)',
      sortLabel: 'zz-test',
    }
  }

  const extension = getExtensionGroup(fileName)
  return {
    id: `extension:${extension}`,
    label: extension === '(no extension)' ? 'No extension' : `${extension} files`,
    sortLabel: extension,
  }
}

function getExtensionGroup(fileName: string): string {
  const lastSlash = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'))
  const basename = fileName.slice(lastSlash + 1)
  const lastDot = basename.lastIndexOf('.')

  if (lastDot <= 0) {
    return '(no extension)'
  }

  return basename.slice(lastDot)
}
