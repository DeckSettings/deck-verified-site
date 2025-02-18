<template>
  <router-view />
</template>

<script setup lang="ts">
import { onBeforeMount } from 'vue'
import { Platform } from 'quasar'

onBeforeMount(() => {
  // Let's fix some Steam Deck browser compatibility issues here...
  if (navigator.userAgent.includes('Steam Deck')) {
    Platform.is.mobile = true
    Platform.is.desktop = false
  }
})
</script>
