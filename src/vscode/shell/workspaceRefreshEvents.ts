import * as path from 'path'
import ignore from 'ignore'
import { normalizeIgnorePath } from '../../core/files/IgnoreRules'
import { ALWAYS_IGNORE } from '../../utils/alwaysIgnore'

const BUILT_IN_EVENT_IGNORE = ignore().add(ALWAYS_IGNORE)

export interface DebouncedRefreshScheduler {
  requestRefresh(): void
  dispose(): void
}

export function shouldRefreshForFileEvent(workspaceRoot: string, eventPath: string): boolean {
  const relativePath = normalizeIgnorePath(path.relative(workspaceRoot, eventPath))
  if (!relativePath || relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
    return false
  }
  return !BUILT_IN_EVENT_IGNORE.ignores(relativePath)
}

export function createDebouncedRefreshScheduler(
  refresh: () => void,
  delayMs: number,
): DebouncedRefreshScheduler {
  let refreshTimer: NodeJS.Timeout | undefined

  return {
    requestRefresh() {
      if (refreshTimer) {
        clearTimeout(refreshTimer)
      }
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined
        refresh()
      }, delayMs)
    },
    dispose() {
      if (refreshTimer) {
        clearTimeout(refreshTimer)
        refreshTimer = undefined
      }
    },
  }
}
