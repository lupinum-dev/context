export type TokenEstimateProfileId = 'claude' | 'openai' | 'gemini'

export interface TokenEstimateProfile {
  id: TokenEstimateProfileId
  label: string
  estimateNote: string
  charsPerToken: number
  numericCharsPerToken?: number
}

export const DEFAULT_TOKEN_ESTIMATE_PROFILE_ID: TokenEstimateProfileId = 'claude'

export const TOKEN_ESTIMATE_PROFILES: readonly TokenEstimateProfile[] = [
  {
    id: 'claude',
    label: 'Claude',
    estimateNote: 'Rough character-based estimate for Claude-style context windows.',
    charsPerToken: 3.9,
    numericCharsPerToken: 1.67,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    estimateNote: 'Rough character-based estimate for OpenAI-style context windows.',
    charsPerToken: 4.17,
    numericCharsPerToken: 1.79,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    estimateNote: 'Rough character-based estimate for Gemini-style context windows.',
    charsPerToken: 3.44,
    numericCharsPerToken: 1.12,
  },
]

export function getTokenEstimateProfile(profileId: string | undefined): TokenEstimateProfile {
  return (
    TOKEN_ESTIMATE_PROFILES.find((profile) => profile.id === profileId) ??
    TOKEN_ESTIMATE_PROFILES[0]
  )
}

export function isTokenEstimateProfileId(value: string): value is TokenEstimateProfileId {
  return TOKEN_ESTIMATE_PROFILES.some((profile) => profile.id === value)
}

export function estimateTokenCountFromTextLength(
  text: string,
  profile: TokenEstimateProfile,
): number {
  return estimateTokenCountFromLength(text.length, getTextCharsPerToken(text, profile))
}

export function estimateTokenCountFromBytes(
  bytes: number,
  profile: TokenEstimateProfile = getTokenEstimateProfile(undefined),
  fileName?: string,
): number {
  return estimateTokenCountFromLength(bytes, getFileCharsPerToken(fileName, profile))
}

export function formatEstimatedTokenCount(tokenCount: number): string {
  const normalizedCount = Math.max(0, Math.round(tokenCount))
  const prefix = '~'

  if (normalizedCount >= 1_000_000) {
    return `${prefix}${formatCompactNumber(normalizedCount / 1_000_000)}m`
  }

  if (normalizedCount >= 1_000) {
    return `${prefix}${formatCompactNumber(normalizedCount / 1_000)}k`
  }

  return `${prefix}${normalizedCount}`
}

function estimateTokenCountFromLength(length: number, charsPerToken: number): number {
  if (!Number.isFinite(length) || length <= 0) {
    return 0
  }

  return Math.ceil(length / charsPerToken)
}

function formatCompactNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function getTextCharsPerToken(text: string, profile: TokenEstimateProfile): number {
  if (profile.numericCharsPerToken === undefined) {
    return profile.charsPerToken
  }

  return isNumericHeavyText(text) ? profile.numericCharsPerToken : profile.charsPerToken
}

function getFileCharsPerToken(fileName: string | undefined, profile: TokenEstimateProfile): number {
  if (
    profile.numericCharsPerToken !== undefined &&
    fileName !== undefined &&
    /\.(dat|csv|tsv)$/i.test(fileName)
  ) {
    return profile.numericCharsPerToken
  }

  return profile.charsPerToken
}

function isNumericHeavyText(text: string): boolean {
  const sample = text.length > 20_000 ? text.slice(0, 20_000) : text
  if (sample.length === 0) {
    return false
  }

  let numericLikeChars = 0
  let digitChars = 0
  let alphaChars = 0

  for (let index = 0; index < sample.length; index++) {
    const char = sample.charCodeAt(index)
    if (char >= 48 && char <= 57) {
      digitChars += 1
      numericLikeChars += 1
      continue
    }

    if (
      char === 10 ||
      char === 13 ||
      char === 32 ||
      char === 9 ||
      char === 43 ||
      char === 45 ||
      char === 46 ||
      char === 69 ||
      char === 101
    ) {
      numericLikeChars += 1
      continue
    }

    if ((char >= 65 && char <= 90) || (char >= 97 && char <= 122)) {
      alphaChars += 1
    }
  }

  return (
    digitChars / sample.length >= 0.25 &&
    numericLikeChars / sample.length >= 0.85 &&
    alphaChars / sample.length <= 0.1
  )
}
