export type EstimateSummaryStatId = 'files' | 'lines'

export function isEstimateSummaryStatId(value: unknown): value is EstimateSummaryStatId {
  return value === 'files' || value === 'lines'
}
