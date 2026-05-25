import * as vscode from 'vscode'
import { bootstrapLupinumContext } from './vscode/shell/bootstrap'

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const app = await bootstrapLupinumContext(context)
  context.subscriptions.push(app)
}

export function deactivate(): void {}
