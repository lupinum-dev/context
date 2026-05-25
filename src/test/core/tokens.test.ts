import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import {
  estimateTokenCountFromBytes,
  estimateTokenCountFromTextLength,
  formatEstimatedTokenCount,
  getTokenEstimateProfile,
} from '../../core/tokens/TokenEstimateProfiles'

test('tree token helpers estimate and format compact labels', () => {
  assert.equal(estimateTokenCountFromBytes(0), 0)
  assert.equal(estimateTokenCountFromBytes(1), 1)
  assertWithinPercent(
    estimateTokenCountFromBytes(1_272_939, getTokenEstimateProfile('claude'), 'shape.ts'),
    326_000,
    5,
  )
  assert.equal(formatEstimatedTokenCount(842), '~842')
  assert.equal(formatEstimatedTokenCount(1800), '~1.8k')
  assert.equal(formatEstimatedTokenCount(1200000), '~1.2m')
})

test('token profiles make rough estimates and numeric-heavy text uses the numeric path', () => {
  const numericText = '1234.5678 -9012.3456\n'.repeat(3_300).slice(0, 67_469)
  const lupinumSourceContextChars = 'x'.repeat(1_272_939)

  const geminiNumeric = estimateTokenCountFromTextLength(
    numericText,
    getTokenEstimateProfile('gemini'),
  )
  const geminiSource = estimateTokenCountFromTextLength(
    lupinumSourceContextChars,
    getTokenEstimateProfile('gemini'),
  )

  assert.ok(geminiNumeric > 50_000)
  assert.ok(geminiSource > 300_000)
  assertWithinPercent(
    estimateTokenCountFromTextLength(lupinumSourceContextChars, getTokenEstimateProfile('claude')),
    326_000,
    5,
  )
})

function assertWithinPercent(actual: number, expected: number, tolerancePercent: number): void {
  const allowed = Math.ceil(expected * (tolerancePercent / 100))
  assert.ok(Math.abs(actual - expected) <= allowed, `${actual} not within ${tolerancePercent}%`)
}
