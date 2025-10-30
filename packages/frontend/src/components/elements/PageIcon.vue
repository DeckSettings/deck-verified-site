<template>
  <div class="page-icon" :style="{ height: sizeCss }">
    <q-avatar :size="iconSizeCss" square color="transparent" class="page-icon__icon">
      <img :src="dvIcon" alt="Deck Verified Icon">
    </q-avatar>
    <span class="page-icon__text-container" :style="{ fontSize: sizeCss, lineHeight: sizeCss }">
      <template v-if="shortMode">
        <span class="page-icon__text-bold">VG</span>
      </template>
      <template v-else>
        eck<span class="page-icon__text-bold">V</span>erified<span
        class="page-icon__text-bold">G</span><span>ames</span>
      </template>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import dvIcon from 'src/assets/icons/dv-icon.svg'

const props = withDefaults(
  defineProps<{
    size?: number | string
    shortMode?: boolean
  }>(),
  {
    size: 40,
    shortMode: false,
  },
)

const numericSize = computed<number>(() => {
  const s = props.size
  if (s == null) return 40
  if (typeof s === 'number') return s
  const parsed = parseFloat(s)
  return isNaN(parsed) ? 40 : parsed
})

const sizeCss = computed<string>(() => `${numericSize.value}px`)

const iconSizeCss = computed<string>(() => `${numericSize.value * 0.7}px`)
</script>

<style scoped>
.page-icon {
  display: inline-flex;
  align-items: baseline;
  white-space: nowrap;
  vertical-align: middle;
}

.page-icon__icon {
  display: block;
  flex-shrink: 0;
}

.page-icon__text-container {
  display: inline-block;
  height: 100%;
  color: white;
  font-family: 'Exo 2', sans-serif;
  font-weight: 500;
}

.page-icon__text-bold {
  font-weight: 800;
}
</style>
