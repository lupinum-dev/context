import * as vscode from 'vscode'
import type { ContextWarning } from '../../core/context/ContextFormat'

type ContextAction = 'copy' | 'create' | 'save'

export async function confirmLargeContextAction(
  action: ContextAction,
  warnings: readonly ContextWarning[],
): Promise<boolean> {
  const warning = findLargeContextWarning(warnings)
  if (!warning) {
    return true
  }

  const label =
    action === 'copy' ? 'Copy anyway' : action === 'save' ? 'Save anyway' : 'Create anyway'
  const selected = await vscode.window.showWarningMessage(
    formatLargeContextActionWarning(action, warning),
    { modal: true },
    label,
  )
  return selected === label
}

function findLargeContextWarning(
  warnings: readonly ContextWarning[],
): Extract<ContextWarning, { type: 'largeContext' }> | undefined {
  return warnings.find(
    (warning): warning is Extract<ContextWarning, { type: 'largeContext' }> =>
      warning.type === 'largeContext',
  )
}

function formatLargeContextActionWarning(
  action: ContextAction,
  warning: Extract<ContextWarning, { type: 'largeContext' }>,
): string {
  return `${warning.message} Continue and ${action} it?`
}
