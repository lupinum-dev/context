<script setup lang="ts">
import { onMounted } from 'vue'
import TokenBar from './components/TokenBar.vue'
import PromptPanel from './components/PromptPanel.vue'
import ContextOptionsPanel from './components/ContextOptionsPanel.vue'
import PreviewPanel from './components/PreviewPanel.vue'
import { applyExtensionMessage, useContextState } from './composables/useContextState'
import { useVsCodeBridge } from './composables/useVsCodeBridge'

const { state, previewText } = useContextState()

const { send } = useVsCodeBridge((message) => applyExtensionMessage(message))

function onCopyPreview() {
  send({ type: 'context.copyPreview', text: previewText.value })
}

onMounted(() => {
  send({ type: 'ready' })
})
</script>

<template>
  <h1>Lupinum Context</h1>
  <TokenBar :state="state" :send="send" />
  <PromptPanel :state="state" :send="send" />
  <ContextOptionsPanel :state="state" :send="send" @copy-preview="onCopyPreview" />
  <PreviewPanel :text="previewText" />
</template>
