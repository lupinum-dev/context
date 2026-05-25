import { readdir, readFile, stat } from 'fs/promises'
import path from 'path'

const rootDir = process.cwd()
const srcDir = path.join(rootDir, 'src')
const failures = []

const rules = [
  {
    name: 'core',
    dir: path.join(srcDir, 'core'),
    forbid: [
      { pattern: /^vscode$/, reason: 'core must not import vscode' },
      { pattern: /^(\.\.\/)+app(\/|$)/, reason: 'core must not import app' },
      { pattern: /^(\.\.\/)+vscode(\/|$)/, reason: 'core must not import vscode shell code' },
      { pattern: /^(\.\.\/)+webview(\/|$)/, reason: 'core must not import webview code' },
    ],
  },
  {
    name: 'app',
    dir: path.join(srcDir, 'app'),
    forbid: [
      { pattern: /^vscode$/, reason: 'app must not import vscode' },
      {
        pattern: /^(\.\.\/)+vscode(\/|$)/,
        reason: 'app must not import concrete VS Code adapters',
      },
      { pattern: /^(\.\.\/)+webview(\/|$)/, reason: 'app must not import webview code' },
    ],
  },
  {
    name: 'webview',
    dir: path.join(srcDir, 'webview'),
    forbid: [
      { pattern: /^vscode$/, reason: 'webview must not import vscode' },
      { pattern: /^(\.\.\/)+core(\/|$)/, reason: 'webview must not import core directly' },
      { pattern: /^(\.\.\/)+app(\/|$)/, reason: 'webview must not import app directly' },
      { pattern: /^(\.\.\/)+vscode(\/|$)/, reason: 'webview must not import VS Code shell code' },
    ],
  },
  {
    name: 'shared',
    dir: path.join(srcDir, 'shared'),
    forbid: [
      { pattern: /^vscode$/, reason: 'shared must not import vscode' },
      { pattern: /^(\.\.\/)+app(\/|$)/, reason: 'shared must not import app' },
      { pattern: /^(\.\.\/)+vscode(\/|$)/, reason: 'shared must not import vscode shell code' },
      { pattern: /^(\.\.\/)+webview(\/|$)/, reason: 'shared must not import webview code' },
    ],
  },
]

for (const rule of rules) {
  if (!(await exists(rule.dir))) {
    continue
  }

  for (const file of await listFiles(rule.dir)) {
    if (!/\.[cm]?(t|j)sx?$/.test(file)) {
      continue
    }
    const source = await readFile(file, 'utf8')
    for (const moduleName of readImportSpecifiers(source)) {
      for (const forbidden of rule.forbid) {
        if (forbidden.pattern.test(moduleName)) {
          failures.push(
            `${path.relative(rootDir, file)} imports ${moduleName}: ${forbidden.reason}`,
          )
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Architecture boundary check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exitCode = 1
} else {
  console.log('Architecture boundary check passed.')
}

async function exists(targetPath) {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)))
    } else if (entry.isFile()) {
      files.push(entryPath)
    }
  }

  return files
}

function readImportSpecifiers(source) {
  const specifiers = []
  const importExportPattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g
  const dynamicImportPattern = /import\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const match of source.matchAll(importExportPattern)) {
    specifiers.push(match[1])
  }
  for (const match of source.matchAll(dynamicImportPattern)) {
    specifiers.push(match[1])
  }

  return specifiers
}
