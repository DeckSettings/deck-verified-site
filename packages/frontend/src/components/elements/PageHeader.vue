<script setup lang="ts">
import NavBackButton from 'components/elements/NavBackButton.vue'

withDefaults(defineProps<{
  title?: string
  subtitle?: string
  showNavBackButton?: boolean
}>(), {
  title: '',
  subtitle: '',
  showNavBackButton: false,
})
</script>

<template>
  <div class="relative-position">
    <NavBackButton v-if="showNavBackButton" />
    <div class="header-container row items-center justify-between">
      <div v-if="title || subtitle" class="col-12 col-md-7 q-mb-sm">
        <div v-if="title" class="text-h3 q-ml-xl q-mt-sm q-mb-sm">
          {{ title }}
        </div>
        <div v-if="subtitle" class="q-ml-xl q-mb-sm">
          {{ subtitle }}
        </div>
      </div>
      <div class="col-12 col-md-5">
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.header-container {
  z-index: 100;
}

@media (max-width: 600px) {
  .header-container {
    margin-bottom: 0;
  }
}
</style>
