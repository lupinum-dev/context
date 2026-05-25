interface FormattableGitDiff {
  commit: {
    hash: string
    workspaceName: string
    authorName: string
    authorDate: string
    subject: string
  }
  patch: string
}

export function formatReadableGitDiffs(diffs: readonly FormattableGitDiff[]): string {
  if (diffs.length === 0) {
    return ''
  }

  return `<git_commits>\n${diffs.map(formatReadableCommit).join('\n')}\n</git_commits>\n<git_diffs>\n${diffs
    .map(formatReadableDiff)
    .join('\n')}\n</git_diffs>\n`
}

export function formatCompactGitDiffs(diffs: readonly FormattableGitDiff[]): string {
  if (diffs.length === 0) {
    return ''
  }

  return `<git_commits>${diffs.map(formatCompactCommit).join('')}</git_commits><git_diffs>${diffs
    .map(formatCompactDiff)
    .join('')}</git_diffs>`
}

export function estimateGitDiffChars(
  diffs: readonly FormattableGitDiff[],
  compact: boolean,
): number {
  return compact ? formatCompactGitDiffs(diffs).length : formatReadableGitDiffs(diffs).length
}

function formatReadableCommit(diff: FormattableGitDiff): string {
  const { commit } = diff
  return `<commit hash="${escapeAttribute(commit.hash)}" subject="${escapeAttribute(
    commit.subject,
  )}" workspace="${escapeAttribute(commit.workspaceName)}">\nAuthor: ${escapeText(
    commit.authorName,
  )}\nDate: ${escapeText(commit.authorDate)}\n</commit>`
}

function formatReadableDiff(diff: FormattableGitDiff): string {
  const { commit } = diff
  return `<diff hash="${escapeAttribute(commit.hash)}" subject="${escapeAttribute(
    commit.subject,
  )}" workspace="${escapeAttribute(commit.workspaceName)}">\n${escapeText(diff.patch)}</diff>`
}

function formatCompactCommit(diff: FormattableGitDiff): string {
  const { commit } = diff
  return `<commit hash="${escapeAttribute(commit.hash)}" subject="${escapeAttribute(
    commit.subject,
  )}" workspace="${escapeAttribute(commit.workspaceName)}"/>`
}

function formatCompactDiff(diff: FormattableGitDiff): string {
  const { commit } = diff
  return `<diff hash="${escapeAttribute(commit.hash)}" workspace="${escapeAttribute(
    commit.workspaceName,
  )}">${escapeText(diff.patch)}</diff>`
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
