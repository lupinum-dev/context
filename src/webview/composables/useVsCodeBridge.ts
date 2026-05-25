import { onMounted, onUnmounted } from 'vue'
import {
  isExtensionToWebviewMessage,
  type WebviewToExtensionMessage,
  type ExtensionToWebviewMessage,
} from '../../shared/messages'

const vscode = acquireVsCodeApi()

export function useVsCodeBridge(onMessage: (message: ExtensionToWebviewMessage) => void): {
  send: (message: WebviewToExtensionMessage) => void
} {
  const listener = (event: MessageEvent) => {
    if (isExtensionToWebviewMessage(event.data)) {
      onMessage(event.data)
    }
  }
  onMounted(() => window.addEventListener('message', listener))
  onUnmounted(() => window.removeEventListener('message', listener))
  return {
    send: (message) => {
      vscode.postMessage(message)
    },
  }
}
