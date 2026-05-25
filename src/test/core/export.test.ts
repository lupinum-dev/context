import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import * as path from 'path'
import { normalizePromptExportOptions } from '../../core/export/ExportOptions'
import { buildPromptExportTarget } from '../../core/export/PromptFileWriter'

test('prompt export core normalizes names, formats, and timestamps', () => {
  const date = new Date(2026, 4, 15, 20, 55, 7)
  const options = normalizePromptExportOptions({
    fileName: ' ../Audit: Run?.md ',
    format: 'txt',
    includeTimestamp: true,
  })
  const target = buildPromptExportTarget('/workspace/project', options, date)

  assert.equal(options.fileName, 'Audit-Run')
  assert.equal(options.format, 'txt')
  assert.equal(target.fileName, 'Audit-Run-2026-05-15_20-55-07.txt')
  assert.equal(target.directoryPath, path.join('/workspace/project', '.lupinum-context', 'prompts'))
})

test('prompt export core supports timestamp-free markdown', () => {
  const options = normalizePromptExportOptions({
    fileName: 'prompt.txt',
    format: 'md',
    includeTimestamp: false,
  })
  const target = buildPromptExportTarget(
    '/workspace/project',
    options,
    new Date(2026, 4, 15, 20, 55, 7),
  )

  assert.equal(target.directoryPath, path.join('/workspace/project', '.lupinum-context', 'prompts'))
  assert.equal(target.fileName, 'prompt.md')
  assert.equal(
    target.absolutePath,
    path.join('/workspace/project', '.lupinum-context', 'prompts', 'prompt.md'),
  )
})
