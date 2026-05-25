import * as vscode from 'vscode'
import type { ContextOutputMode, ProjectTreeMode } from '../../core/context/ContextFormat'
import {
  normalizePromptExportOptions,
  type PromptExportOptions,
} from '../../core/export/ExportOptions'
import {
  TOKEN_ESTIMATE_PROFILES,
  getTokenEstimateProfile,
} from '../../core/tokens/TokenEstimateProfiles'
import type { ExtensionWiring } from './extensionWiring'
import { runContextAction } from './contextActions'
import type {
  ContextPanelState,
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from '../../shared/messages'

export class WebviewMessageHandler {
  private treeMode: ProjectTreeMode
  private outputMode: ContextOutputMode
  private exportOptions: PromptExportOptions

  constructor(
    private services: ExtensionWiring,
    private panel: vscode.WebviewPanel,
  ) {
    this.treeMode = services.workspaceState.getTreeMode()
    this.outputMode = services.workspaceState.getOutputMode()
    this.exportOptions = services.workspaceState.getExportOptions()
  }

  async handle(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.postState()
        return
      case 'estimateSummary.setProfiles':
        await this.services.workspaceState.setEstimateSummaryProfileIds(message.profileIds)
        await this.postState()
        return
      case 'estimateSummary.setStats':
        await this.services.workspaceState.setEstimateSummaryStatIds(message.statIds)
        await this.postState()
        return
      case 'prefix.inlineChanged': {
        const activePrefixId = this.services.promptPrefixes.getActivePrefixId()
        if (activePrefixId) {
          await this.services.promptPrefixes.updatePrefix(activePrefixId, { text: message.text })
        } else {
          await this.services.promptPrefixes.setInlinePrefix(message.text)
          await this.services.promptPrefixes.setActivePrefix(null)
        }
        await this.postState()
        return
      }
      case 'prefix.selectPrefix':
        await this.services.promptPrefixes.setActivePrefix(message.prefixId)
        await this.postState()
        return
      case 'prefix.createPrefix':
        await this.services.promptPrefixes.createPrefix(message.name, message.text)
        await this.postState()
        return
      case 'prefix.renamePrefix':
        await this.services.promptPrefixes.updatePrefix(message.prefixId, { name: message.name })
        await this.postState()
        return
      case 'prefix.duplicatePrefix':
        await this.services.promptPrefixes.duplicatePrefix(message.prefixId)
        await this.postState()
        return
      case 'prefix.deletePrefix':
        await this.services.promptPrefixes.deletePrefix(message.prefixId)
        await this.postState()
        return
      case 'context.optionsChanged':
        await this.setContextOptions(message.treeMode, message.outputMode)
        await this.postState()
        return
      case 'export.optionsChanged':
        this.exportOptions = normalizePromptExportOptions(message.options)
        await this.services.workspaceState.setExportOptions(this.exportOptions)
        await this.postState()
        return
      case 'context.create': {
        await this.setContextOptions(message.treeMode, message.outputMode)
        await runContextAction({
          action: 'create',
          services: this.services,
          treeMode: this.treeMode,
          outputMode: this.outputMode,
          copy: message.copy,
          updatePreview: (text) => this.post({ type: 'context.previewUpdated', text }),
          postState: () => this.postState(),
        })
        return
      }
      case 'context.copyPreview':
        await vscode.env.clipboard.writeText(message.text)
        vscode.window.showInformationMessage('Preview copied.')
        return
      case 'context.save': {
        await this.setContextOptions(message.treeMode, message.outputMode)
        this.exportOptions = normalizePromptExportOptions(message.options)
        await this.services.workspaceState.setExportOptions(this.exportOptions)
        await runContextAction({
          action: 'save',
          services: this.services,
          treeMode: this.treeMode,
          outputMode: this.outputMode,
          exportOptions: this.exportOptions,
          updatePreview: (text) => this.post({ type: 'context.previewUpdated', text }),
          postState: () => this.postState(),
        })
        return
      }
      case 'selection.clear':
        this.services.fileSelection.clear(this.services.fileIndex.getSnapshot())
        await this.postState()
        return
      default:
        throw new Error('Unknown webview message.')
    }
  }

  async postState(): Promise<void> {
    this.post({ type: 'state.changed', state: await this.createState() })
  }

  async createState(): Promise<ContextPanelState> {
    const activePrefixId = this.services.promptPrefixes.getActivePrefixId()
    const prefix = this.services.promptPrefixes.getEffectivePrefix()
    const visibleEstimateProfileIds = this.services.workspaceState.getEstimateSummaryProfileIds()
    const visibleEstimateStatIds = this.services.workspaceState.getEstimateSummaryStatIds()
    const estimateSummaries = await this.services.contextWorkflow.estimatePreviewForProfiles(
      {
        prefix,
        treeMode: this.treeMode,
        outputMode: this.outputMode,
      },
      visibleEstimateProfileIds.map(getTokenEstimateProfile),
    )
    const selectedFileSummary = await this.services.contextWorkflow.summarizeSelectedFiles()
    return {
      tokenEstimateProfiles: TOKEN_ESTIMATE_PROFILES.map(({ id, label, estimateNote }) => ({
        id,
        label,
        estimateNote,
      })),
      visibleEstimateProfileIds,
      visibleEstimateStatIds,
      estimateSummaries: estimateSummaries.map(({ profile, tokens }) => ({
        id: profile.id,
        label: profile.label,
        tokens,
      })),
      selectedFileCount: selectedFileSummary.selectedFileCount,
      selectedLineCount: selectedFileSummary.selectedLineCount,
      promptPrefixes: this.services.promptPrefixes.listPrefixes().map((promptPrefix) => ({
        id: promptPrefix.id,
        name: promptPrefix.name,
        text: promptPrefix.text,
      })),
      activePrefixId,
      inlinePrefix: prefix,
      treeMode: this.treeMode,
      outputMode: this.outputMode,
      exportOptions: this.exportOptions,
    }
  }

  private async setContextOptions(
    treeMode: ProjectTreeMode,
    outputMode: ContextOutputMode,
  ): Promise<void> {
    this.treeMode = treeMode
    this.outputMode = outputMode
    await this.services.workspaceState.setTreeMode(treeMode)
    await this.services.workspaceState.setOutputMode(outputMode)
  }

  private post(message: ExtensionToWebviewMessage): void {
    void this.panel.webview.postMessage(message)
  }
}
