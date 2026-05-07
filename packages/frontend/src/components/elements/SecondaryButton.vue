<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

const props = withDefaults(defineProps<{
  label?: string
  icon?: string
  size?: string
  dense?: boolean
  href?: string
  to?: RouteLocationRaw
  target?: string
  disable?: boolean
  loading?: boolean
  fullWidth?: boolean
  color?: 'primary' | 'secondary' | 'accent' | 'positive' | 'negative' | 'info' | 'warning' | 'dark' | 'grey'
}>(), {
  color: 'primary',
  dense: false,
  fullWidth: false,
})
const attrs = useAttrs()

const btnStyle = computed(() => {
  if (props.color === 'grey') return { '--btn-base': `grey` } as Record<string, string>
  const cssVar = `--q-${props.color}`
  return { '--btn-base': `var(${cssVar})` } as Record<string, string>
})
const btnAttrs = computed(() => ({
  ...attrs,
  ...(props.dense ? { dense: true } : {}),
}))
const computedClass = computed(() => {
  const classes = ['dv-secondary-btn', 'q-my-sm', 'q-mx-xs'] as string[]
  if (!props.dense) classes.push('q-pa-sm')
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
    :size="size"
    :href="href"
    :to="to"
    :target="target"
    :disable="disable"
    :loading="loading"
    :class="computedClass"
    :style="btnStyle"
    v-bind="btnAttrs"
    @click="emit('click')"
  >
    <slot />
  </q-btn>
</template>

<style>
.dv-secondary-btn {
  background-color: color-mix(in srgb, var(--btn-base) 25%, transparent);
  border: 1px solid color-mix(in srgb, var(--btn-base) 60%, transparent);
  min-height: 40px;
  transition: background-color 0.15s ease, border-color 0.15s ease;
  text-decoration: none !important;
}

.dv-secondary-btn.q-btn--dense .q-btn__content {
  min-height: 38px;
}

.dv-secondary-btn.q-btn--dense {
  padding: 0 12px;
}

.dv-secondary-btn:not(.q-btn--dense) {
  padding-inline: 12px;
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
