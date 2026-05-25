export function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

export function getBaseName(filePath: string): string {
  const normalized = toPosixPath(filePath)
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

export function getDirName(filePath: string): string {
  const normalized = toPosixPath(filePath)
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(0, index) : ''
}

export function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/')
}

export function getExtension(fileName: string): string | null {
  const baseName = getBaseName(fileName)
  const dotIndex = baseName.lastIndexOf('.')
  if (dotIndex <= 0) {
    return null
  }
  return baseName.slice(dotIndex)
}
