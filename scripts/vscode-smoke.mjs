import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runTests } from '@vscode/test-electron'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'lupinum-context-vscode-smoke-'))

try {
  const workspaceDir = path.join(tempRoot, 'workspace')
  const sourceDir = path.join(workspaceDir, 'src')
  const testsDir = path.join(tempRoot, 'tests')
  await mkdir(sourceDir, { recursive: true })
  await mkdir(testsDir, { recursive: true })
  await writeFile(path.join(sourceDir, 'app.ts'), 'export const smoke = true\n', 'utf8')

  const runnerPath = path.join(testsDir, 'runner.cjs')
  await writeFile(runnerPath, createRunnerSource(workspaceDir), 'utf8')

  await runTests({
    version: '1.96.0',
    extensionDevelopmentPath: rootDir,
    extensionTestsPath: runnerPath,
    launchArgs: [
      workspaceDir,
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-telemetry',
    ],
  })
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}

function createRunnerSource(workspaceDir) {
  return `
const assert = require('node:assert/strict')
const path = require('node:path')
const vscode = require('vscode')

async function run() {
  const fileUri = vscode.Uri.file(path.join(${JSON.stringify(workspaceDir)}, 'src', 'app.ts'))
  const document = await vscode.workspace.openTextDocument(fileUri)
  await vscode.window.showTextDocument(document)
  await vscode.commands.executeCommand('lupinumContext.addCurrentFile')
  await vscode.commands.executeCommand('lupinumContext.copyContext')
  const contextText = await vscode.env.clipboard.readText()

  assert.match(contextText, /<context>/)
  assert.match(contextText, /<project_files>/)
  assert.match(contextText, /path="\\/src\\/app\\.ts"/)
  assert.match(contextText, /export const smoke = true/)
}

module.exports = { run }
`.trimStart()
}
