import type { ContextOutputMode, ProjectTreeMode } from '../core/context/ContextFormat'
import {
  DEFAULT_EXPORT_OPTIONS,
  normalizePromptExportOptions,
  type PromptExportOptions,
} from '../core/export/ExportOptions'
import type { PersistedSelectionIntent } from '../core/files/FileSelection'
import {
  isTokenEstimateProfileId,
  type TokenEstimateProfileId,
} from '../core/tokens/TokenEstimateProfiles'
import { isEstimateSummaryStatId, type EstimateSummaryStatId } from '../shared/estimateSummary'
import type { AppStorage } from './PromptPrefixes'

const SELECTION_INTENT_KEY = 'lupinumContext.selectionIntent'
const TREE_MODE_KEY = 'lupinumContext.treeMode'
const OUTPUT_MODE_KEY = 'lupinumContext.outputMode'
const EXPORT_OPTIONS_KEY = 'lupinumContext.exportOptions'
const ESTIMATE_SUMMARY_PROFILE_IDS_KEY = 'lupinumContext.estimateSummaryProfileIds'
const ESTIMATE_SUMMARY_STAT_IDS_KEY = 'lupinumContext.estimateSummaryStatIds'
const DEFAULT_ESTIMATE_SUMMARY_PROFILE_IDS: readonly TokenEstimateProfileId[] = ['openai', 'gemini']
const DEFAULT_ESTIMATE_SUMMARY_STAT_IDS: readonly EstimateSummaryStatId[] = ['files', 'lines']

export class WorkspaceSettings {
  constructor(private storage: AppStorage) {}

  getSelectionIntent(): PersistedSelectionIntent | undefined {
    return this.storage.get<PersistedSelectionIntent | undefined>(SELECTION_INTENT_KEY, undefined)
  }

  async setSelectionIntent(intent: PersistedSelectionIntent): Promise<void> {
    await this.storage.update(SELECTION_INTENT_KEY, intent)
  }

  getTreeMode(): ProjectTreeMode {
    const value = this.storage.get<ProjectTreeMode>(TREE_MODE_KEY, 'selectedFilesOnly')
    return isProjectTreeMode(value) ? value : 'selectedFilesOnly'
  }

  async setTreeMode(treeMode: ProjectTreeMode): Promise<void> {
    await this.storage.update(TREE_MODE_KEY, treeMode)
  }

  getOutputMode(): ContextOutputMode {
    const value = this.storage.get<ContextOutputMode>(OUTPUT_MODE_KEY, 'readable')
    return value === 'compact' ? 'compact' : 'readable'
  }

  async setOutputMode(outputMode: ContextOutputMode): Promise<void> {
    await this.storage.update(OUTPUT_MODE_KEY, outputMode)
  }

  getExportOptions(): PromptExportOptions {
    return normalizePromptExportOptions(
      this.storage.get<Partial<PromptExportOptions>>(EXPORT_OPTIONS_KEY, DEFAULT_EXPORT_OPTIONS),
    )
  }

  async setExportOptions(options: Partial<PromptExportOptions>): Promise<void> {
    await this.storage.update(EXPORT_OPTIONS_KEY, normalizePromptExportOptions(options))
  }

  getEstimateSummaryProfileIds(): readonly TokenEstimateProfileId[] {
    const ids = this.storage.get<readonly string[]>(
      ESTIMATE_SUMMARY_PROFILE_IDS_KEY,
      DEFAULT_ESTIMATE_SUMMARY_PROFILE_IDS,
    )
    const normalized = ids.filter(isTokenEstimateProfileId)
    return normalized.length > 0 ? normalized : DEFAULT_ESTIMATE_SUMMARY_PROFILE_IDS
  }

  async setEstimateSummaryProfileIds(ids: readonly string[]): Promise<void> {
    const normalized = ids.filter(isTokenEstimateProfileId)
    await this.storage.update(
      ESTIMATE_SUMMARY_PROFILE_IDS_KEY,
      normalized.length > 0 ? normalized : DEFAULT_ESTIMATE_SUMMARY_PROFILE_IDS,
    )
  }

  getEstimateSummaryStatIds(): readonly EstimateSummaryStatId[] {
    const ids = this.storage.get<readonly string[]>(
      ESTIMATE_SUMMARY_STAT_IDS_KEY,
      DEFAULT_ESTIMATE_SUMMARY_STAT_IDS,
    )
    return ids.filter(isEstimateSummaryStatId)
  }

  async setEstimateSummaryStatIds(ids: readonly string[]): Promise<void> {
    await this.storage.update(ESTIMATE_SUMMARY_STAT_IDS_KEY, ids.filter(isEstimateSummaryStatId))
  }
}

function isProjectTreeMode(value: string): value is ProjectTreeMode {
  return (
    value === 'selectedFilesOnly' ||
    value === 'fullFilesAndDirectories' ||
    value === 'fullDirectoriesOnly' ||
    value === 'none'
  )
}
