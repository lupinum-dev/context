<script setup lang="ts">
import { ref, watch } from 'vue'
import type {
  ContextOutputMode,
  ContextPanelState,
  ProjectTreeMode,
  PromptExportOptions,
  WebviewToExtensionMessage,
} from '../../shared/messages'

const props = defineProps<{
  state: ContextPanelState
  send: (message: WebviewToExtensionMessage) => void
}>()

const copyAfterCreate = ref(true)

const treeMode = ref<ProjectTreeMode>(props.state.treeMode)
const outputMode = ref<ContextOutputMode>(props.state.outputMode)
const fileName = ref(props.state.exportOptions.fileName)
const format = ref(props.state.exportOptions.format)
const includeTimestamp = ref(props.state.exportOptions.includeTimestamp)

watch(
  () => props.state.treeMode,
  (value) => {
    treeMode.value = value
  },
)
watch(
  () => props.state.outputMode,
  (value) => {
    outputMode.value = value
  },
)
watch(
  () => props.state.exportOptions,
  (options) => {
    fileName.value = options.fileName
    format.value = options.format
    includeTimestamp.value = options.includeTimestamp
  },
)

function postOptionsChanged() {
  props.send({
    type: 'context.optionsChanged',
    treeMode: treeMode.value,
    outputMode: outputMode.value,
  })
}

function exportOptions(): PromptExportOptions {
  return {
    fileName: fileName.value || 'prompt',
    format: format.value || 'md',
    includeTimestamp: includeTimestamp.value,
  }
}

function postExportOptionsChanged() {
  props.send({ type: 'export.optionsChanged', options: exportOptions() })
}

function onTreeModeChange(event: Event) {
  treeMode.value = (event.target as HTMLSelectElement).value as ProjectTreeMode
  postOptionsChanged()
}

function onOutputModeChange(event: Event) {
  outputMode.value = (event.target as HTMLInputElement).checked ? 'compact' : 'readable'
  postOptionsChanged()
}

function onFormatChange(event: Event) {
  format.value = (event.target as HTMLSelectElement).value as PromptExportOptions['format']
  postExportOptionsChanged()
}

function onFileNameInput(event: Event) {
  fileName.value = (event.target as HTMLInputElement).value
  postExportOptionsChanged()
}

function onTimestampChange(event: Event) {
  includeTimestamp.value = (event.target as HTMLInputElement).checked
  postExportOptionsChanged()
}

function onCreate() {
  props.send({
    type: 'context.create',
    copy: copyAfterCreate.value,
    treeMode: treeMode.value,
    outputMode: outputMode.value,
  })
}

const emit = defineEmits<{
  (event: 'copyPreview'): void
}>()

function onCopyPreview() {
  emit('copyPreview')
}

function onSave() {
  props.send({
    type: 'context.save',
    options: exportOptions(),
    treeMode: treeMode.value,
    outputMode: outputMode.value,
  })
}

function onClear() {
  props.send({ type: 'selection.clear' })
}
</script>

<template>
  <div class="panel control-panel">
    <div class="control-grid">
      <label class="field">
        Tree
        <select :value="treeMode" @change="onTreeModeChange">
          <option value="selectedFilesOnly">Selected files only</option>
          <option value="fullFilesAndDirectories">Full repo</option>
          <option value="fullDirectoriesOnly">Directories only</option>
          <option value="none">None</option>
        </select>
      </label>
      <label class="field">
        Format
        <select :value="format" @change="onFormatChange">
          <option value="md">.md</option>
          <option value="txt">.txt</option>
        </select>
      </label>
      <label class="field">
        Filename
        <input :value="fileName" spellcheck="false" @input="onFileNameInput" />
      </label>
    </div>
    <div class="action-row">
      <div class="toggle-group">
        <label class="check">
          <input type="checkbox" :checked="includeTimestamp" @change="onTimestampChange" />
          Timestamp
        </label>
        <label class="check">
          <input type="checkbox" :checked="outputMode === 'compact'" @change="onOutputModeChange" />
          Compact tags
        </label>
        <label class="check">
          <input v-model="copyAfterCreate" type="checkbox" />
          Copy after create
        </label>
      </div>
      <div class="button-group">
        <button class="create-button" @click="onCreate">Create Context</button>
        <button class="secondary" @click="onCopyPreview">Copy Preview</button>
        <button class="secondary" @click="onSave">Save</button>
        <button class="ghost" @click="onClear">Clear Selection</button>
      </div>
    </div>
  </div>
</template>
