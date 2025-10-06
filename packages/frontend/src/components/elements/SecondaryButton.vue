<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

const props = withDefaults(defineProps<{
  label?: string
  icon?: string
  href?: string
  to?: RouteLocationRaw
  target?: string
  disable?: boolean
  loading?: boolean
  fullWidth?: boolean
  color?: 'primary' | 'secondary' | 'accent' | 'positive' | 'negative' | 'info' | 'warning' | 'dark'
}>(), {
  color: 'primary',
  fullWidth: false,
})

const btnStyle = computed(() => {
  const cssVar = `--q-${props.color}`
  return { '--btn-base': `var(${cssVar})` } as Record<string, string>
})
const computedClass = computed(() => {
  const classes = ['dv-secondary-btn', 'q-my-sm', 'q-mx-xs', 'q-pa-sm', 'q-mx-xs'] as string[]
  if (props.fullWidth) classes.push('full-width')
  return classes
})
const emit = defineEmits<{ (e: 'click'): void }>()
</script>

<template>
  <q-btn
    no-caps flat
    :label="label"
    :icon="icon"
    :href="href"
    :to="to"
    :target="target"
    :disable="disable"
    :loading="loading"
    :class="computedClass"
    :style="btnStyle"
    v-bind="$attrs"
    @click="emit('click')"
  >
    <slot />
  </q-btn>
</template>

<style>
.dv-secondary-btn {
  background-color: color-mix(in srgb, var(--btn-base) 25%, transparent);
  border: 1px solid color-mix(in srgb, var(--btn-base) 60%, transparent);
  transition: background-color 0.15s ease, border-color 0.15s ease;
  text-decoration: none !important;
}

.dv-secondary-btn:hover,
.dv-secondary-btn:focus {
  background-color: color-mix(in srgb, var(--btn-base) 32%, transparent);
  border-color: color-mix(in srgb, var(--btn-base) 70%, transparent);
}

.dv-secondary-btn:active {
  background-color: color-mix(in srgb, var(--btn-base) 40%, transparent);
}

.dv-secondary-btn:visited,
.dv-secondary-btn:hover,
.dv-secondary-btn:focus,
.dv-secondary-btn:active {
  text-decoration: none !important;
}
</style>
