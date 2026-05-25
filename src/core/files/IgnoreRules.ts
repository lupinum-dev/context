export function normalizeIgnorePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/')
}

export interface IgnoreRuleLayer {
  basePath: string
  patterns: readonly string[]
}

export function createLayeredIgnoreMatcher(
  layers: readonly IgnoreRuleLayer[],
  createMatcher: (patterns: readonly string[]) => {
    test(path: string): { ignored: boolean; unignored: boolean }
  },
): (relativePath: string) => boolean {
  const compiledLayers = layers
    .filter((layer) => layer.patterns.length > 0)
    .map((layer) => ({
      basePath: normalizeIgnorePath(layer.basePath),
      matcher: createMatcher(layer.patterns),
    }))

  return (relativePath) => {
    const normalizedPath = normalizeIgnorePath(relativePath)
    let ignored = false

    for (const layer of compiledLayers) {
      const localPath = toLayerPath(normalizedPath, layer.basePath)
      if (localPath === null) {
        continue
      }

      const result = layer.matcher.test(localPath)
      if (result.ignored) {
        ignored = true
      }
      if (result.unignored) {
        ignored = false
      }
    }

    return ignored
  }
}

function toLayerPath(relativePath: string, basePath: string): string | null {
  const normalizedBase = basePath.replace(/^\/+|\/+$/g, '')
  if (!normalizedBase) {
    return relativePath
  }
  if (relativePath === normalizedBase) {
    return ''
  }
  const prefix = `${normalizedBase}/`
  return relativePath.startsWith(prefix) ? relativePath.slice(prefix.length) : null
}
