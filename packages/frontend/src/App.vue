<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useTaskProgressStore } from 'src/stores/task-progress-store'

const taskProgress = useTaskProgressStore()

onMounted(() => {
  void taskProgress.resumePendingFromStorage()
})
</script>
