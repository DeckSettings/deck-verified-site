<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useEventProgressStore } from 'src/stores/event-progress-store'

const eventProgress = useEventProgressStore()

onMounted(() => {
  void eventProgress.resumePendingFromStorage()
})
</script>
