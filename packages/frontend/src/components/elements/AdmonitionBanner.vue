<script setup lang="ts">
import { computed } from 'vue'

type AdmonitionType = 'note' | 'tip' | 'warning' | 'caution'

const props = withDefaults(defineProps<{
  type: AdmonitionType
  message?: string
}>(), {
  type: 'note',
  message: '',
})

const meta = computed(() => {
  switch (props.type) {
    case 'tip':
      return { label: 'Tip', color: 'positive', icon: 'lightbulb', className: 'admonition--tip' }
    case 'warning':
      return { label: 'Warning', color: 'warning', icon: 'warning', className: 'admonition--warning' }
    case 'caution':
      return { label: 'Caution', color: 'negative', icon: 'dangerous', className: 'admonition--caution' }
    case 'note':
    default:
      return { label: 'Note', color: 'info', icon: 'info', className: 'admonition--note' }
  }
})

const ariaRole = computed(() => (props.type === 'warning' || props.type === 'caution') ? 'alert' : 'note')
</script>

<template>
  <div
    :class="['admonition', meta.className]"
    :role="ariaRole"
    aria-live="polite"
  >
    <div class="admonition__header">
      <q-icon
        :name="meta.icon"
        size="18px"
        :color="meta.color"
        class="admonition__icon"
        aria-hidden="true"
      />
      <span class="admonition__title" :class="`text-${meta.color}`">
        {{ meta.label }}
      </span>
    </div>
    <div class="admonition__content">
      <slot v-if="$slots.default" />
      <div v-else v-html="message" />
    </div>
  </div>
</template>

<style scoped>
.admonition {
  --admonition-color: var(--q-info);

  border-left: 4px solid var(--admonition-color);
  border-radius: 3px;
  padding: 10px 12px;
  /* Subtle tinted background behind content */
  background: color-mix(in srgb, var(--admonition-color) 12%, transparent);
}

/* Type color mappings via CSS variables */
.admonition--note {
  --admonition-color: var(--q-info);
}

.admonition--tip {
  --admonition-color: var(--q-positive);
}

.admonition--warning {
  --admonition-color: var(--q-warning);
}

.admonition--caution {
  --admonition-color: var(--q-negative);
}

.admonition__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.admonition__title {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.admonition__content :deep(p) {
  margin: 0;
}
</style>
