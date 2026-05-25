<script setup lang="ts">
defineProps<{
  text: string
}>()
</script>

<template>
  <div class="panel">
    <label>Preview</label>
    <textarea class="preview-textarea" :value="text" spellcheck="false" readonly />
  </div>
</template>
