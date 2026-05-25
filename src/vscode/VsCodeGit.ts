import { execFile, spawn } from 'child_process'
import type { GitCommit, GitCommitDiff, GitCommitHost, GitWorkspace } from '../core/git/GitTypes'
import type { FileIndexLogger } from '../core/files/FileIndex'

const FIELD_SEPARATOR = '\x1f'
const MAX_BUFFER = 20 * 1024 * 1024
const MAX_CONTEXT_DIFF_CHARS = 1_000_000
const GIT_TIMEOUT_MS = 15_000

export class VsCodeGit implements GitCommitHost {
  constructor(private logger?: FileIndexLogger) {}

  async listRecentCommits(
    workspaces: readonly GitWorkspace[],
    limit: number,
  ): Promise<GitCommit[]> {
    const results = await Promise.all(
      workspaces.map(async (workspace) => this.listWorkspaceCommits(workspace, limit)),
    )
    const workspaceOrder = new Map(workspaces.map((workspace, index) => [workspace.id, index]))
    return results
      .flat()
      .sort((left, right) => compareCommitsByRecency(left, right, workspaceOrder))
      .slice(0, limit)
  }

  async readCommitDiff(commit: GitCommit): Promise<GitCommitDiff> {
    try {
      const rawPatch = await runGitLimited(commit.rootPath, [
        'show',
        '--no-ext-diff',
        '--no-color',
        '--find-renames',
        '--format=',
        '--patch',
        commit.hash,
      ])
      const stripped = stripBinaryPatchNoise(rawPatch.output)

      return {
        commit,
        patch: rawPatch.truncated
          ? `${stripped.patch}\n[diff output truncated after ${MAX_CONTEXT_DIFF_CHARS} bytes]`
          : stripped.patch,
        warnings: [
          ...(rawPatch.truncated
            ? [`Diff output was truncated after ${MAX_CONTEXT_DIFF_CHARS} bytes.`]
            : []),
          ...stripped.warnings,
        ],
      }
    } catch (error) {
      return {
        commit,
        patch: '',
        warnings: [`Could not read commit diff: ${formatErrorMessage(error)}`],
      }
    }
  }

  private async listWorkspaceCommits(workspace: GitWorkspace, limit: number): Promise<GitCommit[]> {
    try {
      const output = await runGit(workspace.rootPath, [
        'log',
        `--max-count=${limit}`,
        `--format=%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s`,
      ])
      return output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => parseCommitLine(line, workspace))
        .filter((commit): commit is GitCommit => commit !== null)
    } catch (error) {
      this.logger?.info(`[git] ${describeCommitListFailure(workspace.name, error)}`)
      return []
    }
  }
}

function runGitLimited(
  cwd: string,
  args: readonly string[],
): Promise<{ output: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let outputBytes = 0
    let truncated = false
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
    }, GIT_TIMEOUT_MS)

    child.stdout.on('data', (chunk: Buffer) => {
      if (truncated) {
        return
      }
      const remaining = MAX_CONTEXT_DIFF_CHARS - outputBytes
      if (chunk.length > remaining) {
        stdoutChunks.push(chunk.subarray(0, Math.max(remaining, 0)))
        outputBytes = MAX_CONTEXT_DIFF_CHARS
        truncated = true
        child.kill()
        return
      }
      stdoutChunks.push(chunk)
      outputBytes += chunk.length
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk)
    })

    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timeout)
      if (timedOut) {
        reject(new Error(`git timed out after ${GIT_TIMEOUT_MS}ms`))
        return
      }
      if (code && !truncated) {
        reject(new Error(Buffer.concat(stderrChunks).toString('utf8') || `git exited ${code}`))
        return
      }
      if (signal && !truncated) {
        reject(new Error(`git exited with signal ${signal}`))
        return
      }
      resolve({
        output: Buffer.concat(stdoutChunks).toString('utf8'),
        truncated,
      })
    })
  })
}

function parseCommitLine(line: string, workspace: GitWorkspace): GitCommit | null {
  const [hash, shortHash, authorName, authorDate, subject] = line.split(FIELD_SEPARATOR)
  if (!hash || !shortHash) {
    return null
  }

  return {
    id: `${workspace.id}:${hash}`,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    rootPath: workspace.rootPath,
    hash,
    shortHash,
    authorName: authorName ?? '',
    authorDate: authorDate ?? '',
    subject: subject ?? '',
  }
}

function runGit(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-C', cwd, ...args],
      { maxBuffer: MAX_BUFFER, timeout: GIT_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message))
          return
        }
        resolve(stdout)
      },
    )
  })
}

function compareCommitsByRecency(
  left: GitCommit,
  right: GitCommit,
  workspaceOrder: ReadonlyMap<string, number>,
): number {
  const dateDifference = Date.parse(right.authorDate || '') - Date.parse(left.authorDate || '')
  if (Number.isFinite(dateDifference) && dateDifference !== 0) {
    return dateDifference
  }

  const leftWorkspaceOrder = workspaceOrder.get(left.workspaceId) ?? Number.MAX_SAFE_INTEGER
  const rightWorkspaceOrder = workspaceOrder.get(right.workspaceId) ?? Number.MAX_SAFE_INTEGER
  if (leftWorkspaceOrder !== rightWorkspaceOrder) {
    return leftWorkspaceOrder - rightWorkspaceOrder
  }

  return left.shortHash.localeCompare(right.shortHash)
}

function stripBinaryPatchNoise(patch: string): { patch: string; warnings: string[] } {
  let strippedBinaryPatch = false
  const lines = patch.split(/\r?\n/).filter((line) => {
    const binaryPatchLine =
      line.startsWith('GIT binary patch') || /^Binary files .+ differ$/.test(line)
    strippedBinaryPatch ||= binaryPatchLine
    return !binaryPatchLine
  })
  return {
    patch: lines.join('\n'),
    warnings: strippedBinaryPatch ? ['Binary patch content was omitted from the context.'] : [],
  }
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function describeCommitListFailure(workspaceName: string, error: unknown): string {
  const message = formatErrorMessage(error)
  if (/not a git repository/i.test(message)) {
    return `workspace ${workspaceName} is not a Git repository; commit selection is unavailable`
  }
  if (/does not have any commits yet|unknown revision|ambiguous argument 'HEAD'/i.test(message)) {
    return `workspace ${workspaceName} has no commits; commit selection is unavailable`
  }
  return `could not list commits for ${workspaceName}: ${message}`
}
