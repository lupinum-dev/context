export type PromptExportFormat = 'md' | 'txt'

export interface PromptExportOptions {
  fileName: string
  format: PromptExportFormat
  includeTimestamp: boolean
}

export const DEFAULT_EXPORT_OPTIONS: PromptExportOptions = {
  fileName: 'prompt',
  format: 'md',
  includeTimestamp: true,
}

export function normalizePromptExportOptions(
  options: Partial<PromptExportOptions> | undefined,
): PromptExportOptions {
  return {
    fileName: sanitizeExportFileName(options?.fileName),
    format: normalizeExportFormat(options?.format),
    includeTimestamp: options?.includeTimestamp ?? DEFAULT_EXPORT_OPTIONS.includeTimestamp,
  }
}

export function sanitizeExportFileName(fileName: string | undefined): string {
  const fallback = DEFAULT_EXPORT_OPTIONS.fileName
  if (!fileName) {
    return fallback
  }

  const trimmed = fileName.trim()
  if (!trimmed) {
    return fallback
  }

  const withoutExtension = trimmed.replace(/\.(md|txt)$/i, '')
  const sanitized = replaceInvalidFileNameCharacters(withoutExtension)
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')

  return sanitized || fallback
}

export function normalizeExportFormat(format: string | undefined): PromptExportFormat {
  return format === 'txt' ? 'txt' : DEFAULT_EXPORT_OPTIONS.format
}

function replaceInvalidFileNameCharacters(value: string): string {
  let result = ''
  for (let index = 0; index < value.length; index++) {
    const character = value[index]
    result += isInvalidFileNameCharacter(character) ? '-' : character
  }
  return result
}

function isInvalidFileNameCharacter(character: string): boolean {
  return (
    character.charCodeAt(0) < 32 ||
    character === '<' ||
    character === '>' ||
    character === ':' ||
    character === '"' ||
    character === '/' ||
    character === '\\' ||
    character === '|' ||
    character === '?' ||
    character === '*'
  )
}
