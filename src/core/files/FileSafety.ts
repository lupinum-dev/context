import path from 'path'
import { toPosixPath } from './pathUtils'
import type { IndexedFile, IndexedWorkspace } from './FileIndex'

export const MAX_CONTEXT_FILE_BYTES = 2_000_000
export const BINARY_SNIFF_BYTES = 8_000

export type FileSafetyDecision =
  | { action: 'include' }
  | {
      action: 'omit'
      reason: FileOmissionReason
      message: string
    }

export type FileOmissionReason = 'binary' | 'tooLarge' | 'outsideWorkspace'

export function decideFileSafetyBeforeRead(
  file: IndexedFile,
  workspaces: readonly IndexedWorkspace[],
): FileSafetyDecision {
  if (!isInsideIndexedWorkspace(file, workspaces)) {
    return {
      action: 'omit',
      reason: 'outsideWorkspace',
      message: 'File is outside the indexed workspace.',
    }
  }

  if (file.sizeBytes > MAX_CONTEXT_FILE_BYTES) {
    return {
      action: 'omit',
      reason: 'tooLarge',
      message: `File is larger than ${MAX_CONTEXT_FILE_BYTES} bytes.`,
    }
  }

  return { action: 'include' }
}

export function decideFileSafetyFromSample(sample: Uint8Array): FileSafetyDecision {
  if (looksBinary(sample)) {
    return {
      action: 'omit',
      reason: 'binary',
      message: 'File appears to be binary.',
    }
  }

  return { action: 'include' }
}

function isInsideIndexedWorkspace(
  file: IndexedFile,
  workspaces: readonly IndexedWorkspace[],
): boolean {
  const workspace = workspaces.find((candidate) => candidate.id === file.workspaceId)
  if (!workspace) {
    return false
  }

  const root = path.posix.normalize(toPosixPath(workspace.rootPath)).replace(/\/$/, '')
  const absolutePath = path.posix.normalize(toPosixPath(file.absolutePath))
  return absolutePath.startsWith(`${root}/`)
}

function looksBinary(sample: Uint8Array): boolean {
  if (sample.length === 0) {
    return false
  }

  let replacementLikeBytes = 0
  for (const byte of sample) {
    if (byte === 0) {
      return true
    }
    if (byte < 7 || (byte > 14 && byte < 32)) {
      replacementLikeBytes += 1
    }
  }

  return replacementLikeBytes / sample.length > 0.02
}
