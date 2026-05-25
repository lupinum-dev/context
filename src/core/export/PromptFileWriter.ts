import * as path from 'path'
import { normalizePromptExportOptions, type PromptExportOptions } from './ExportOptions'

export interface PromptExportTarget {
  directoryPath: string
  absolutePath: string
  fileName: string
}

export function buildPromptExportTarget(
  workspaceRoot: string,
  options: PromptExportOptions,
  date: Date = new Date(),
): PromptExportTarget {
  const normalized = normalizePromptExportOptions(options)
  const fileName = buildPromptExportFileName(normalized, date)
  const directoryPath = path.join(workspaceRoot, '.lupinum-context', 'prompts')

  return {
    directoryPath,
    absolutePath: path.join(directoryPath, fileName),
    fileName,
  }
}

export function buildPromptExportFileName(options: PromptExportOptions, date: Date): string {
  const timestamp = options.includeTimestamp ? `-${formatPromptExportTimestamp(date)}` : ''
  return `${options.fileName}${timestamp}.${options.format}`
}

export function formatPromptExportTimestamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
}
