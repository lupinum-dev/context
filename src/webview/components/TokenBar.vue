<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { ContextPanelState, WebviewToExtensionMessage } from '../../shared/messages'

const props = defineProps<{
  state: ContextPanelState
  send: (message: WebviewToExtensionMessage) => void
}>()

const popoverOpen = ref(false)
const settingsButton = ref<HTMLButtonElement | null>(null)
const popover = ref<HTMLDivElement | null>(null)

function togglePopover() {
  popoverOpen.value = !popoverOpen.value
}

function handleClickOutside(event: MouseEvent) {
  if (!popoverOpen.value) {
    return
  }
  const target = event.target as Node | null
  if (popover.value && popover.value.contains(target)) {
    return
  }
  if (settingsButton.value && settingsButton.value.contains(target)) {
    return
  }
  popoverOpen.value = false
}

onMounted(() => window.addEventListener('click', handleClickOutside))
onUnmounted(() => window.removeEventListener('click', handleClickOutside))

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) {
    return (Math.round(value / 10_000) / 100).toLocaleString() + 'M'
  }
  if (value >= 1000) {
    return Math.round(value / 1000).toLocaleString() + 'k'
  }
  return value.toLocaleString()
}

const summaryItems = computed(() => [
  ...(props.state.visibleEstimateStatIds.includes('files')
    ? [
        {
          id: 'files',
          label: '',
          display: `${formatCompactNumber(props.state.selectedFileCount)} ${props.state.selectedFileCount === 1 ? 'file' : 'files'}`,
        },
      ]
    : []),
  ...(props.state.visibleEstimateStatIds.includes('lines')
    ? [
        {
          id: 'lines',
          label: '',
          display: `${formatCompactNumber(props.state.selectedLineCount)} ${props.state.selectedLineCount === 1 ? 'line' : 'lines'}`,
        },
      ]
    : []),
  ...props.state.estimateSummaries.map((summary) => ({
    id: summary.id,
    label: summary.label,
    display: '~' + formatCompactNumber(summary.tokens),
  })),
])

function onStatToggle(statId: string, checked: boolean) {
  const current = new Set(props.state.visibleEstimateStatIds)
  if (checked) {
    current.add(statId)
  } else {
    current.delete(statId)
  }
  props.send({
    type: 'estimateSummary.setStats',
    statIds: Array.from(current),
  })
}

function onProfileToggle(profileId: string, checked: boolean) {
  const current = new Set(props.state.visibleEstimateProfileIds)
  if (checked) {
    current.add(profileId)
  } else {
    current.delete(profileId)
  }
  props.send({
    type: 'estimateSummary.setProfiles',
    profileIds: Array.from(current),
  })
}
</script>

<template>
  <div class="bar">
    <div class="token-summary">
      <div class="token-chips" aria-label="Selected context summary">
        <span v-for="item in summaryItems" :key="item.id" class="token-chip">
          <span v-if="item.label" class="token-label">{{ item.label }}</span>
          <span class="token-value" :class="{ 'token-value-plain': !item.label }">
            {{ item.display }}
          </span>
        </span>
      </div>
      <button
        ref="settingsButton"
        class="icon-button"
        title="Estimate settings"
        aria-label="Estimate settings"
        @click="togglePopover"
      >
        ⚙
      </button>
      <div v-if="popoverOpen" ref="popover" class="popover">
        <div class="popover-section">
          <div class="popover-title">Codebase stats</div>
          <div class="check-list">
            <label class="popover-check">
              <input
                type="checkbox"
                value="files"
                :checked="state.visibleEstimateStatIds.includes('files')"
                @change="onStatToggle('files', ($event.target as HTMLInputElement).checked)"
              />
              Files
            </label>
            <label class="popover-check">
              <input
                type="checkbox"
                value="lines"
                :checked="state.visibleEstimateStatIds.includes('lines')"
                @change="onStatToggle('lines', ($event.target as HTMLInputElement).checked)"
              />
              Lines
            </label>
          </div>
        </div>
        <div class="popover-section">
          <div class="popover-title">Rough estimates</div>
          <div class="check-list">
            <label
              v-for="profile in state.tokenEstimateProfiles"
              :key="profile.id"
              class="popover-check"
              :title="profile.estimateNote"
            >
              <input
                type="checkbox"
                :value="profile.id"
                :checked="state.visibleEstimateProfileIds.includes(profile.id)"
                @change="onProfileToggle(profile.id, ($event.target as HTMLInputElement).checked)"
              />
              {{ profile.label }}
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
