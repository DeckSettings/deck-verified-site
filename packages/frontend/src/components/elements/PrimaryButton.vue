<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

const props = withDefaults(defineProps<{
  label?: string
  icon?: string
  iconRight?: string
  size?: string
  dense?: boolean
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

const btnStyle = computed(() => {
  const cssVar = `--q-${props.color}`
  return { '--btn-base': `var(${cssVar})` } as Record<string, string>
})
const computedClass = computed(() => {
  const classes = ['dv-primary-btn', 'q-my-sm', 'q-mx-xs'] as string[]
  if (!props.dense) classes.push('q-pa-sm')
  if (props.fullWidth) classes.push('full-width')
  return classes
})
const emit = defineEmits<{ (e: 'click'): void }>()
</script>

<template>
  <q-btn
    no-caps
    :label="label"
    :icon="icon"
    :size="size"
    :dense="dense"
    :href="href"
    :to="to"
    :target="target"
    :disable="disable"
    :loading="loading"
    :color="color"
    :icon-right="iconRight"
    :class="computedClass"
    :style="btnStyle"
    v-bind="$attrs"
    @click="emit('click')"
  >
    <slot />
  </q-btn>
</template>

<style scoped>
.dv-primary-btn {
  border: 1px solid color-mix(in srgb, white 20%, transparent);
  text-decoration: none !important;
}

.dv-primary-btn:visited,
.dv-primary-btn:hover,
.dv-primary-btn:focus,
.dv-primary-btn:active {
  text-decoration: none !important;
}
</style>
