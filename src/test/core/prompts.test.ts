import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { PromptPrefixes, createPromptPrefix, parsePromptPrefixes } from '../../app/PromptPrefixes'
import { createMemoryStorage } from '../helpers'

test('PromptPrefixes creates, selects, edits, duplicates, and hard deletes prefixes', async () => {
  const service = new PromptPrefixes(createMemoryStorage({}), createMemoryStorage({}))
  const prefix = await service.createPrefix('Audit', 'v1')

  await service.updatePrefix(prefix.id, { name: 'Architecture Audit', text: 'v2' })
  const duplicated = await service.duplicatePrefix(prefix.id)
  await service.deletePrefix(prefix.id)

  assert.equal(service.getActivePrefixId(), duplicated.id)
  assert.deepEqual(
    service.listPrefixes().map((candidate) => candidate.name),
    ['Architecture Audit Copy'],
  )
  assert.equal(service.getEffectivePrefix(), 'v2')
})

test('PromptPrefixes uses inline text when no saved prefix is active', async () => {
  const service = new PromptPrefixes(createMemoryStorage({}), createMemoryStorage({}))

  await service.setInlinePrefix('inline')
  await service.setActivePrefix(null)

  assert.equal(service.getActivePrefix(), null)
  assert.equal(service.getEffectivePrefix(), 'inline')
})

test('PromptPrefixes imports old prefix history once without duplicates', async () => {
  const globalStorage = createMemoryStorage({
    'promptTower.prefixHistory': [
      { text: 'Audit' },
      { text: 'Audit' },
      { text: 'Refactor' },
      { text: '' },
    ],
  })
  const service = new PromptPrefixes(globalStorage, createMemoryStorage({}))

  await service.importOldPrefixesOnce()
  await service.importOldPrefixesOnce()

  assert.deepEqual(
    service
      .listPrefixes()
      .map((prefix) => prefix.text)
      .sort(),
    ['Audit', 'Refactor'],
  )
})

test('PromptPrefixes parser ignores corrupted stored prefixes without hidden deletes', () => {
  const valid = createPromptPrefix('Audit', 'v1', '2026-01-01T00:00:00.000Z', 'valid')

  assert.deepEqual(
    parsePromptPrefixes([
      valid,
      { ...valid, id: 'missing-text', text: undefined },
      { ...valid, id: 'bad-deleted', deletedAt: '2026-01-01T00:00:00.000Z' },
      { ...valid, id: 'bad-updated', updatedAt: 42 },
    ]).map((prefix) => prefix.id),
    ['valid'],
  )
})

test('PromptPrefixes ignores missing active prefix ids', () => {
  const service = new PromptPrefixes(
    createMemoryStorage({}),
    createMemoryStorage({ 'lupinumContext.activePromptPrefixId': 'missing' }),
  )

  assert.equal(service.getActivePrefix(), null)
  assert.equal(service.getEffectivePrefix(), '')
})
