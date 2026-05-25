import { ref } from 'vue'
import type { ContextPanelState, ExtensionToWebviewMessage } from '../../shared/messages'

const state = ref<ContextPanelState>(window.__INITIAL_STATE__)
const previewText = ref<string>('')

export function useContextState(): {
  state: typeof state
  previewText: typeof previewText
} {
  return { state, previewText }
}

export function applyExtensionMessage(message: ExtensionToWebviewMessage): void {
  switch (message.type) {
    case 'state.changed':
      state.value = message.state
      return
    case 'context.previewUpdated':
      previewText.value = message.text
      return
  }
}
