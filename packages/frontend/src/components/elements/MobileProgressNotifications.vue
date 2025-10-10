<script setup lang="ts">
import { computed } from 'vue'
import { QIcon, QLinearProgress, QBadge } from 'quasar'
import { mobileProgressState } from 'src/composables/useProgressNotifications'

/**
 * Styled as a q-list similar to NotificationCenter:
 * - Displays a small header with a count and "Dismiss All" button
 * - Renders each mobile progress entry as a q-item with icon, title,
 *   caption (message/percent) and a small linear progress bar.
 *
 * The component mutates `mobileProgressState` directly for dismiss semantics.
 */

// reactive array from composable
const entries = computed(() => mobileProgressState.value)

/**
 * Helpers for rendering progress:
 */
const clamp = (v: number | string | null) => {
  if (typeof v !== 'number') return (v as string) ?? ''
  return Math.max(0, Math.min(100, Math.round(v)))
}

const progressValue = (v: number | 'indeterminate' | null) => {
  if (v === 'indeterminate') return 0
  if (v === null) return 0
  return Math.max(0, Math.min(100, v)) / 100
}

const showPercent = (v: number | 'indeterminate' | null) => {
  return typeof v === 'number'
}
</script>

<template>
  <section v-if="entries.length" class="mobile-progress-menu q-gutter-sm q-mt-md q-mt-md-none">
    <div class="row items-center justify-between no-wrap">
      <div class="row items-center no-wrap text-subtitle2">
        <span>Progress</span>
        <q-badge
          v-if="entries.length"
          class="q-ml-sm"
          color="primary"
          text-color="white"
          rounded
        >
          {{ entries.length }}
        </q-badge>
      </div>
    </div>

    <q-list class="mobile-progress-list" aria-label="Progress notifications" dense>
      <template v-for="(entry, idx) in entries" :key="entry.id">
        <q-item class="mobile-progress-item" clickable v-ripple>
          <q-item-section avatar>
            <q-icon
              :name="entry.icon || 'info'"
              size="sm"
              class="mobile-progress-icon"
            />
          </q-item-section>

          <q-item-section>
            <q-item-label class="text-weight-medium">
              {{ entry.title }}
            </q-item-label>

            <q-item-label caption class="mobile-progress-caption">
              <span v-if="entry.progress === null">{{ entry.message }}</span>
              <span v-else-if="entry.progress === 'indeterminate'">{{ entry.message }}</span>
              <span v-else>{{ entry.message }} — {{ clamp(entry.progress) }}%</span>
            </q-item-label>

            <div v-if="entry.progress !== null" class="q-mt-xs">
              <q-linear-progress
                :value="progressValue(entry.progress)"
                color="primary"
                track-color="grey-8"
                rounded
                height="6px"
                :indeterminate="entry.progress === 'indeterminate'"
              />
            </div>
          </q-item-section>

          <q-item-section side class="row items-center no-wrap q-gutter-xs">
            <div v-if="showPercent(entry.progress)" class="text-caption text-grey-5">
              {{ clamp(entry.progress) }}%
            </div>
          </q-item-section>
        </q-item>

        <q-separator dark spaced inset v-if="idx < entries.length - 1" />
      </template>
    </q-list>
  </section>
</template>

<style scoped>
.mobile-progress-list {
  border-radius: 3px;
  background: color-mix(in srgb, var(--q-dark) 75%, transparent);
}

.mobile-progress-item:last-child {
  border-bottom: none;
}

.mobile-progress-icon {
  color: var(--q-primary);
}

</style>