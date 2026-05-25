import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { normalizePromptExportOptions } from '../../core/export/ExportOptions'
import { getWebviewHtml } from '../../vscode/webview/webviewHost'
import { isExtensionToWebviewMessage, isWebviewToExtensionMessage } from '../../shared/messages'
import type { ContextPanelState } from '../../shared/messages'

test('webview inbound message guard rejects unknown and malformed messages', () => {
  assert.equal(isWebviewToExtensionMessage({ type: 'ready' }), true)
  assert.equal(isWebviewToExtensionMessage({ type: 'unknown.command' }), false)
  assert.equal(isWebviewToExtensionMessage({ type: 'context.copyPreview', text: 'preview' }), true)
  assert.equal(isWebviewToExtensionMessage({ type: 'context.copyPreview' }), false)
  assert.equal(
    isWebviewToExtensionMessage({ type: 'context.copyPreview', text: 'preview', extra: true }),
    false,
  )
  assert.equal(
    isWebviewToExtensionMessage({
      type: 'estimateSummary.setProfiles',
      profileIds: ['openai', 'gemini'],
    }),
    true,
  )
  assert.equal(
    isWebviewToExtensionMessage({
      type: 'estimateSummary.setStats',
      statIds: ['files', 'lines'],
    }),
    true,
  )
  assert.equal(
    isWebviewToExtensionMessage({
      type: 'prefix.renamePrefix',
      prefixId: 'p1',
      name: 'Audit',
    }),
    true,
  )
  assert.equal(isWebviewToExtensionMessage({ type: 'prefix.restoreVersion' }), false)
  assert.equal(
    isWebviewToExtensionMessage({
      type: 'context.save',
      treeMode: 'selectedFilesOnly',
      outputMode: 'readable',
      options: { fileName: 'Audit', format: 'pdf' },
    }),
    false,
  )
  assert.equal(
    isWebviewToExtensionMessage({
      type: 'export.optionsChanged',
      options: { fileName: 'Audit', extra: true },
    }),
    false,
  )
  assert.equal(
    isWebviewToExtensionMessage({
      type: 'estimateSummary.setProfiles',
      profileIds: ['openai', 'unknown'],
    }),
    false,
  )
  assert.equal(
    isWebviewToExtensionMessage({
      type: 'estimateSummary.setStats',
      statIds: ['files', 'unknown'],
    }),
    false,
  )
})

test('webview outbound message guard validates full panel state shape', () => {
  const state: ContextPanelState = {
    tokenEstimateProfiles: [
      {
        id: 'claude',
        label: 'Claude',
        estimateNote: 'Rough character-based estimate for Claude-style context windows.',
      },
    ],
    visibleEstimateProfileIds: ['claude'],
    visibleEstimateStatIds: ['files', 'lines'],
    estimateSummaries: [{ id: 'claude', label: 'Claude', tokens: 1200 }],
    selectedFileCount: 2,
    selectedLineCount: 42,
    promptPrefixes: [{ id: 'p1', name: 'Audit', text: 'Review this.' }],
    activePrefixId: 'p1',
    inlinePrefix: 'Review this.',
    treeMode: 'selectedFilesOnly',
    outputMode: 'readable',
    exportOptions: normalizePromptExportOptions({}),
  }

  assert.equal(isExtensionToWebviewMessage({ type: 'context.previewUpdated', text: 'x' }), true)
  assert.equal(isExtensionToWebviewMessage({ type: 'state.changed', state }), true)
  assert.equal(
    isExtensionToWebviewMessage({
      type: 'state.changed',
      state: { ...state, treeMode: 'everything' },
    }),
    false,
  )
  assert.equal(
    isExtensionToWebviewMessage({
      type: 'state.changed',
      state: { ...state, exportOptions: { fileName: 'x', format: 'pdf', includeTimestamp: true } },
    }),
    false,
  )
  assert.equal(
    isExtensionToWebviewMessage({
      type: 'state.changed',
      state: { ...state, promptPrefixes: [{ id: 'p1', name: 'Audit' }] },
    }),
    false,
  )
  assert.equal(
    isExtensionToWebviewMessage({
      type: 'state.changed',
      state: {
        ...state,
        estimateSummaries: [{ id: 'claude', label: 'Claude', tokens: 1200, extra: true }],
      },
    }),
    false,
  )
})

test('webview host html includes CSP, nonce, initial state, and Vue bundle script tag', () => {
  const state: ContextPanelState = {
    tokenEstimateProfiles: [
      {
        id: 'claude',
        label: 'Claude',
        estimateNote: 'Rough character-based estimate for Claude-style context windows.',
      },
      {
        id: 'openai',
        label: 'OpenAI',
        estimateNote: 'Rough character-based estimate for OpenAI-style context windows.',
      },
      {
        id: 'gemini',
        label: 'Gemini',
        estimateNote: 'Rough character-based estimate for Gemini-style context windows.',
      },
    ],
    visibleEstimateProfileIds: ['claude', 'openai', 'gemini'],
    visibleEstimateStatIds: ['files', 'lines'],
    estimateSummaries: [],
    selectedFileCount: 0,
    selectedLineCount: 0,
    promptPrefixes: [],
    activePrefixId: null,
    inlinePrefix: '<script>evil</script>',
    treeMode: 'selectedFilesOnly',
    outputMode: 'readable',
    exportOptions: normalizePromptExportOptions({}),
  }

  const html = getWebviewHtml({
    scriptUri: 'vscode-resource://ext/dist/webview/main.js',
    styleUri: 'vscode-resource://ext/dist/webview/main.css',
    cspSource: 'vscode-resource:',
    nonce: 'TEST_NONCE_123',
    state,
  })

  assert.ok(html.includes('<!DOCTYPE html>'), 'has doctype')
  assert.ok(html.includes('Content-Security-Policy'), 'has CSP header')
  assert.ok(html.includes('nonce-TEST_NONCE_123'), 'CSP references nonce')
  assert.ok(html.includes('nonce="TEST_NONCE_123"'), 'inline scripts carry nonce')
  assert.ok(html.includes('<div id="app"></div>'), 'has Vue mount node')
  assert.ok(html.includes('type="module"'), 'webview script is ES module')
  assert.ok(html.includes('main.js'), 'references compiled main.js')
  assert.ok(html.includes('main.css'), 'references compiled main.css')
  assert.ok(html.includes('window.__INITIAL_STATE__'), 'injects initial state')
  assert.ok(!html.includes('<script>evil</script>'), 'escapes raw <script> from injected state')
  assert.ok(html.includes('\\u003cscript>evil\\u003c/script>'), 'state JSON escapes < to \\u003c')
})
