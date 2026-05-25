import type { ProjectTreeMode, ContextOutputMode } from '../core/context/ContextFormat'
import type { PromptExportFormat, PromptExportOptions } from '../core/export/ExportOptions'
import { isTokenEstimateProfileId } from '../core/tokens/TokenEstimateProfiles'
import { isEstimateSummaryStatId } from './estimateSummary'

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'estimateSummary.setProfiles'; profileIds: readonly string[] }
  | { type: 'estimateSummary.setStats'; statIds: readonly string[] }
  | { type: 'prefix.inlineChanged'; text: string }
  | { type: 'prefix.selectPrefix'; prefixId: string | null }
  | { type: 'prefix.createPrefix'; name: string; text: string }
  | { type: 'prefix.renamePrefix'; prefixId: string; name: string }
  | { type: 'prefix.duplicatePrefix'; prefixId: string }
  | { type: 'prefix.deletePrefix'; prefixId: string }
  | { type: 'context.optionsChanged'; treeMode: ProjectTreeMode; outputMode: ContextOutputMode }
  | { type: 'export.optionsChanged'; options: Partial<PromptExportOptions> }
  | {
      type: 'context.create'
      copy: boolean
      treeMode: ProjectTreeMode
      outputMode: ContextOutputMode
    }
  | { type: 'context.copyPreview'; text: string }
  | {
      type: 'context.save'
      options: Partial<PromptExportOptions>
      treeMode: ProjectTreeMode
      outputMode: ContextOutputMode
    }
  | { type: 'selection.clear' }

export type ExtensionToWebviewMessage =
  | { type: 'state.changed'; state: ContextPanelState }
  | { type: 'context.previewUpdated'; text: string }

export interface ContextPanelState {
  tokenEstimateProfiles: readonly {
    id: string
    label: string
    estimateNote: string
  }[]
  visibleEstimateProfileIds: readonly string[]
  visibleEstimateStatIds: readonly string[]
  estimateSummaries: readonly {
    id: string
    label: string
    tokens: number
  }[]
  selectedFileCount: number
  selectedLineCount: number
  promptPrefixes: readonly {
    id: string
    name: string
    text: string
  }[]
  activePrefixId: string | null
  inlinePrefix: string
  treeMode: ProjectTreeMode
  outputMode: ContextOutputMode
  exportOptions: PromptExportOptions
}

export function isWebviewToExtensionMessage(value: unknown): value is WebviewToExtensionMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const message = value as Record<string, unknown>
  switch (message.type) {
    case 'ready':
    case 'selection.clear':
      return hasOnlyKeys(message, ['type'])
    case 'context.copyPreview':
      return hasOnlyKeys(message, ['type', 'text']) && typeof message.text === 'string'
    case 'estimateSummary.setProfiles':
      return (
        hasOnlyKeys(message, ['type', 'profileIds']) &&
        Array.isArray(message.profileIds) &&
        message.profileIds.every((id) => typeof id === 'string' && isTokenEstimateProfileId(id))
      )
    case 'estimateSummary.setStats':
      return (
        hasOnlyKeys(message, ['type', 'statIds']) &&
        Array.isArray(message.statIds) &&
        message.statIds.every(isEstimateSummaryStatId)
      )
    case 'prefix.inlineChanged':
      return hasOnlyKeys(message, ['type', 'text']) && typeof message.text === 'string'
    case 'prefix.selectPrefix':
      return (
        hasOnlyKeys(message, ['type', 'prefixId']) &&
        (typeof message.prefixId === 'string' || message.prefixId === null)
      )
    case 'prefix.createPrefix':
      return (
        hasOnlyKeys(message, ['type', 'name', 'text']) &&
        typeof message.name === 'string' &&
        typeof message.text === 'string'
      )
    case 'prefix.renamePrefix':
      return (
        hasOnlyKeys(message, ['type', 'prefixId', 'name']) &&
        typeof message.prefixId === 'string' &&
        typeof message.name === 'string'
      )
    case 'prefix.duplicatePrefix':
    case 'prefix.deletePrefix':
      return hasOnlyKeys(message, ['type', 'prefixId']) && typeof message.prefixId === 'string'
    case 'context.optionsChanged':
      return (
        hasOnlyKeys(message, ['type', 'treeMode', 'outputMode']) &&
        isTreeMode(message.treeMode) &&
        isOutputMode(message.outputMode)
      )
    case 'context.create':
      return (
        hasOnlyKeys(message, ['type', 'copy', 'treeMode', 'outputMode']) &&
        typeof message.copy === 'boolean' &&
        isTreeMode(message.treeMode) &&
        isOutputMode(message.outputMode)
      )
    case 'context.save':
      return (
        hasOnlyKeys(message, ['type', 'options', 'treeMode', 'outputMode']) &&
        isPartialPromptExportOptions(message.options) &&
        isTreeMode(message.treeMode) &&
        isOutputMode(message.outputMode)
      )
    case 'export.optionsChanged':
      return (
        hasOnlyKeys(message, ['type', 'options']) && isPartialPromptExportOptions(message.options)
      )
    default:
      return false
  }
}

export function isExtensionToWebviewMessage(value: unknown): value is ExtensionToWebviewMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const message = value as Record<string, unknown>
  switch (message.type) {
    case 'context.previewUpdated':
      return hasOnlyKeys(message, ['type', 'text']) && typeof message.text === 'string'
    case 'state.changed':
      return hasOnlyKeys(message, ['type', 'state']) && isContextPanelState(message.state)
    default:
      return false
  }
}

function isContextPanelState(value: unknown): value is ContextPanelState {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const state = value as Record<string, unknown>
  return (
    hasOnlyKeys(state, [
      'tokenEstimateProfiles',
      'visibleEstimateProfileIds',
      'visibleEstimateStatIds',
      'estimateSummaries',
      'selectedFileCount',
      'selectedLineCount',
      'promptPrefixes',
      'activePrefixId',
      'inlinePrefix',
      'treeMode',
      'outputMode',
      'exportOptions',
    ]) &&
    Array.isArray(state.tokenEstimateProfiles) &&
    state.tokenEstimateProfiles.every(isTokenEstimateProfileSummary) &&
    Array.isArray(state.visibleEstimateProfileIds) &&
    state.visibleEstimateProfileIds.every(
      (id) => typeof id === 'string' && isTokenEstimateProfileId(id),
    ) &&
    Array.isArray(state.visibleEstimateStatIds) &&
    state.visibleEstimateStatIds.every(isEstimateSummaryStatId) &&
    Array.isArray(state.estimateSummaries) &&
    state.estimateSummaries.every(isEstimateSummary) &&
    isNonNegativeInteger(state.selectedFileCount) &&
    isNonNegativeInteger(state.selectedLineCount) &&
    Array.isArray(state.promptPrefixes) &&
    state.promptPrefixes.every(isPromptPrefixSummary) &&
    (typeof state.activePrefixId === 'string' || state.activePrefixId === null) &&
    typeof state.inlinePrefix === 'string' &&
    isTreeMode(state.treeMode) &&
    isOutputMode(state.outputMode) &&
    isPromptExportOptions(state.exportOptions)
  )
}

function isTokenEstimateProfileSummary(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const profile = value as Record<string, unknown>
  return (
    hasOnlyKeys(profile, ['id', 'label', 'estimateNote']) &&
    typeof profile.id === 'string' &&
    isTokenEstimateProfileId(profile.id) &&
    typeof profile.label === 'string' &&
    typeof profile.estimateNote === 'string'
  )
}

function isEstimateSummary(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const summary = value as Record<string, unknown>
  return (
    hasOnlyKeys(summary, ['id', 'label', 'tokens']) &&
    typeof summary.id === 'string' &&
    isTokenEstimateProfileId(summary.id) &&
    typeof summary.label === 'string' &&
    typeof summary.tokens === 'number' &&
    Number.isFinite(summary.tokens)
  )
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPromptPrefixSummary(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const prefix = value as Record<string, unknown>
  return (
    hasOnlyKeys(prefix, ['id', 'name', 'text']) &&
    typeof prefix.id === 'string' &&
    typeof prefix.name === 'string' &&
    typeof prefix.text === 'string'
  )
}

function isTreeMode(value: unknown): value is ProjectTreeMode {
  return (
    value === 'selectedFilesOnly' ||
    value === 'fullFilesAndDirectories' ||
    value === 'fullDirectoriesOnly' ||
    value === 'none'
  )
}

function isOutputMode(value: unknown): value is ContextOutputMode {
  return value === 'readable' || value === 'compact'
}

function isPartialPromptExportOptions(value: unknown): value is Partial<PromptExportOptions> {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const options = value as Record<string, unknown>
  return (
    hasOnlyKeys(options, ['fileName', 'format', 'includeTimestamp']) &&
    (options.fileName === undefined || typeof options.fileName === 'string') &&
    (options.format === undefined || isExportFormat(options.format)) &&
    (options.includeTimestamp === undefined || typeof options.includeTimestamp === 'boolean')
  )
}

function isPromptExportOptions(value: unknown): value is PromptExportOptions {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const options = value as Record<string, unknown>
  return (
    hasOnlyKeys(options, ['fileName', 'format', 'includeTimestamp']) &&
    typeof options.fileName === 'string' &&
    isExportFormat(options.format) &&
    typeof options.includeTimestamp === 'boolean'
  )
}

function isExportFormat(value: unknown): value is PromptExportFormat {
  return value === 'md' || value === 'txt'
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}
