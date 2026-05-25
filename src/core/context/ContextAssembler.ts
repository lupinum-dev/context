import path from 'path'
import type {
  ContextBuildRequest,
  ContextBuildResult,
  ContextFile,
  ContextWarning,
} from './ContextFormat'
import { formatCompactGitDiffs, formatReadableGitDiffs } from '../git/GitDiffFormatter'

export function assembleContext(request: ContextBuildRequest): ContextBuildResult {
  const warnings: ContextWarning[] = [...(request.warnings ?? [])]
  const fileBlocks: string[] = []

  for (const file of request.files) {
    const snapshot = request.snapshots.get(file.id)
    if (!snapshot) {
      if (!hasOmittedFileWarning(warnings, file.id)) {
        warnings.push({
          type: 'missingFile',
          fileId: file.id,
          path: file.relativePath,
        })
      }
      continue
    }

    fileBlocks.push(
      request.outputMode === 'compact'
        ? formatCompactFileBlock(file, snapshot.content)
        : formatReadableFileBlock(file, snapshot.content),
    )
  }

  const contextBody =
    request.outputMode === 'compact'
      ? assembleCompactBody(request, fileBlocks, warnings)
      : assembleReadableBody(request, fileBlocks, warnings)
  const text = addPrefixAndSuffix(contextBody, request.prefix, request.suffix ?? '')

  return {
    text,
    fileCount: fileBlocks.length,
    commitCount: request.gitDiffs?.length ?? 0,
    characterCount: text.length,
    warnings,
  }
}

function assembleReadableBody(
  request: ContextBuildRequest,
  fileBlocks: readonly string[],
  warnings: readonly ContextWarning[],
): string {
  const treeBlock = shouldIncludeTree(request)
    ? `<project_tree>\n${escapeText(request.projectTree)}\n</project_tree>\n`
    : ''
  const filesBlock =
    fileBlocks.length > 0 ? `<project_files>\n${fileBlocks.join('\n')}\n</project_files>\n` : ''
  const gitBlock = formatReadableGitDiffs(request.gitDiffs ?? [])

  const warningsBlock = formatReadableWarnings(warnings)

  if (!treeBlock && !filesBlock && !gitBlock && !warningsBlock) {
    return ''
  }

  return `<context>\n${treeBlock}${filesBlock}${gitBlock}${warningsBlock}</context>`
}

function assembleCompactBody(
  request: ContextBuildRequest,
  fileBlocks: readonly string[],
  warnings: readonly ContextWarning[],
): string {
  const treeBlock = shouldIncludeTree(request)
    ? `<project_tree>${escapeText(trimGeneratedSection(request.projectTree))}</project_tree>`
    : ''
  const filesBlock =
    fileBlocks.length > 0 ? `<project_files>${fileBlocks.join('')}</project_files>` : ''
  const gitBlock = formatCompactGitDiffs(request.gitDiffs ?? [])
  const warningsBlock = formatCompactWarnings(warnings)

  return treeBlock || filesBlock || gitBlock || warningsBlock
    ? `<context>${treeBlock}${filesBlock}${gitBlock}${warningsBlock}</context>`
    : ''
}

function formatReadableFileBlock(file: ContextFile, content: string): string {
  const sourcePath = toSourcePath(file.relativePath)
  const fileName = file.name || path.basename(file.relativePath)
  return `<file name="${escapeAttribute(fileName)}" path="${escapeAttribute(
    sourcePath,
  )}">\n${escapeText(content)}</file>`
}

function formatCompactFileBlock(file: ContextFile, content: string): string {
  return `<file path="${escapeAttribute(toSourcePath(file.relativePath))}">${escapeText(
    content,
  )}</file>`
}

function shouldIncludeTree(request: ContextBuildRequest): boolean {
  return request.treeMode !== 'none' && request.projectTree.length > 0
}

function addPrefixAndSuffix(content: string, prefix: string, suffix: string): string {
  let result = content

  if (prefix) {
    result = result ? `${prefix}\n${result}` : prefix
  }

  if (suffix) {
    result = result ? `${result}\n${suffix}` : suffix
  }

  return result
}

function toSourcePath(relativePath: string): string {
  return '/' + relativePath.replace(/\\/g, '/')
}

function trimGeneratedSection(content: string): string {
  return content.trim().replace(/\n{3,}/g, '\n\n')
}

function formatReadableWarnings(warnings: readonly ContextWarning[]): string {
  const outputWarnings = warnings.filter(shouldRenderWarning)
  if (outputWarnings.length === 0) {
    return ''
  }

  return `<context_warnings>\n${outputWarnings.map(formatReadableWarning).join('\n')}\n</context_warnings>\n`
}

function formatCompactWarnings(warnings: readonly ContextWarning[]): string {
  const outputWarnings = warnings.filter(shouldRenderWarning)
  if (outputWarnings.length === 0) {
    return ''
  }

  return `<context_warnings>${outputWarnings.map(formatCompactWarning).join('')}</context_warnings>`
}

function shouldRenderWarning(warning: ContextWarning): boolean {
  return (
    warning.type === 'missingFile' || warning.type === 'omittedFile' || warning.type === 'gitDiff'
  )
}

function hasOmittedFileWarning(warnings: readonly ContextWarning[], fileId: string): boolean {
  return warnings.some((warning) => warning.type === 'omittedFile' && warning.fileId === fileId)
}

function formatReadableWarning(warning: ContextWarning): string {
  if (warning.type === 'missingFile') {
    return `<warning type="missing_file" path="${escapeAttribute(warning.path)}">Selected file could not be read.</warning>`
  }
  if (warning.type === 'omittedFile') {
    return `<warning type="omitted_file" path="${escapeAttribute(warning.path)}" reason="${escapeAttribute(warning.reason)}">${escapeText(warning.message)}</warning>`
  }
  if (warning.type === 'gitDiff') {
    return `<warning type="git_diff" commit="${escapeAttribute(warning.shortHash)}">${escapeText(warning.message)}</warning>`
  }
  return ''
}

function formatCompactWarning(warning: ContextWarning): string {
  return formatReadableWarning(warning)
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
