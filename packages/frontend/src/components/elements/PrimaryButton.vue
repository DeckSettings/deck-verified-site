<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

const props = withDefaults(defineProps<{
  label?: string
  icon?: string
  size?: string
  href?: string
  to?: RouteLocationRaw
  target?: string
  disable?: boolean
  loading?: boolean
  fullWidth?: boolean
  color?: 'primary' | 'secondary' | 'accent' | 'positive' | 'negative' | 'info' | 'warning' | 'dark'
  textColor?: string
}>(), {
  color: 'secondary',
  fullWidth: false,
})

const computedClass = computed(() => {
  const classes = ['q-my-sm', 'q-mx-xs', 'dv-primary-btn'] as string[]
  if (props.fullWidth) classes.push('full-width')
  return classes
})

// Expose the base palette color to CSS for subtle border tint
const btnStyle = computed(() => {
  const cssVar = `--q-${props.color}`
  return { '--btn-base': `var(${cssVar})` } as Record<string, string>
})
</script>

<template>
  <q-btn
    no-caps
    :label="label"
    :icon="icon"
    :size="size"
    :href="href"
    :to="to"
    :target="target"
    :disable="disable"
    :loading="loading"
    :color="color"
    :class="computedClass"
    :style="btnStyle"
    v-bind="$attrs"
    @click="$emit('click', $event)"
  >
    <slot />
  </q-btn>
</template>

<style scoped>
.dv-primary-btn {
  border: 1px solid color-mix(in srgb, white 20%, transparent);
}
</style>
