<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ContextPanelState, WebviewToExtensionMessage } from '../../shared/messages'

const props = defineProps<{
  state: ContextPanelState
  send: (message: WebviewToExtensionMessage) => void
}>()

const newPrefixName = ref('')
const activePrefixName = ref('')

const activePrefix = computed(
  () =>
    props.state.promptPrefixes.find((prefix) => prefix.id === props.state.activePrefixId) ?? null,
)

watch(
  activePrefix,
  (prefix) => {
    activePrefixName.value = prefix?.name ?? ''
  },
  { immediate: true },
)

function onPrefixChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  props.send({
    type: 'prefix.selectPrefix',
    prefixId: value === '' ? null : value,
  })
}

function onInlineInput(event: Event) {
  props.send({
    type: 'prefix.inlineChanged',
    text: (event.target as HTMLTextAreaElement).value,
  })
}

function onActiveNameInput(event: Event) {
  const prefixId = props.state.activePrefixId
  if (!prefixId) {
    return
  }
  activePrefixName.value = (event.target as HTMLInputElement).value
  props.send({
    type: 'prefix.renamePrefix',
    prefixId,
    name: activePrefixName.value,
  })
}

function onCreatePrefix() {
  const name = newPrefixName.value.trim()
  if (!name) {
    return
  }
  props.send({
    type: 'prefix.createPrefix',
    name,
    text: props.state.inlinePrefix,
  })
  newPrefixName.value = ''
}

function onDuplicate() {
  const prefixId = props.state.activePrefixId
  if (!prefixId) {
    return
  }
  props.send({ type: 'prefix.duplicatePrefix', prefixId })
}

function onDelete() {
  const prefixId = props.state.activePrefixId
  if (!prefixId) {
    return
  }
  if (!window.confirm('Delete this prefix?')) {
    return
  }
  props.send({ type: 'prefix.deletePrefix', prefixId })
}
</script>

<template>
  <div class="panel">
    <div class="row">
      <label>Prefix</label>
      <select :value="state.activePrefixId ?? ''" @change="onPrefixChange">
        <option value="">Inline prefix</option>
        <option v-for="prefix in state.promptPrefixes" :key="prefix.id" :value="prefix.id">
          {{ prefix.name }}
        </option>
      </select>
      <input
        v-if="activePrefix"
        :value="activePrefixName"
        class="name-input"
        spellcheck="false"
        @input="onActiveNameInput"
      />
      <input
        v-else
        v-model="newPrefixName"
        class="name-input"
        placeholder="New prefix name"
        spellcheck="false"
      />
      <button class="secondary" :disabled="activePrefix !== null" @click="onCreatePrefix">
        New
      </button>
      <button class="secondary" :disabled="!activePrefix" @click="onDuplicate">Duplicate</button>
      <button class="secondary danger" :disabled="!activePrefix" @click="onDelete">Delete</button>
    </div>
    <div class="row">
      <textarea
        :value="state.inlinePrefix"
        placeholder="Write a reusable prefix or select a saved prefix"
        @input="onInlineInput"
      />
    </div>
  </div>
</template>
