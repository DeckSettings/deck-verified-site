<script setup lang="ts">
import { computed } from 'vue'
import { QChip, QTooltip } from 'quasar'
import { simProtondb } from 'quasar-extras-svg-icons/simple-icons-v14'

/**
 * ProtonBadge
 *
 * Small visual badge representing a ProtonDB tier.
 *
 * Props:
 *  - tier: the ProtonDB tier string (case-insensitive). Expected values include:
 *      'native', 'platinum', 'gold', 'silver', 'bronze', 'borked'
 *
 * Behavior:
 *  - Maps known tier names to colors broadly matching ProtonDB's palette.
 *  - Renders a compact chip with a 3px rounded corner.
 *  - Falls back to an 'Unknown' chip when no tier is provided.
 */
const props = defineProps<{
  tier?: string | null
}>()

const TIER_COLOR_MAP: Record<string, { bg: string; text: string }> = {
  native: { bg: '#008000', text: 'white' },
  platinum: { bg: '#b4c7dc', text: 'black' },
  gold: { bg: '#cfb53b', text: 'black' },
  silver: { bg: '#a6a6a6', text: 'black' },
  bronze: { bg: '#cd7f32', text: 'black' },
  borked: { bg: '#ff0000', text: 'black' },
  unknown: { bg: '#cccccc', text: 'white' },
}

const DEFAULT_TIER_COLORS: { bg: string; text: string } = { bg: '#7f8c8d', text: 'white' }

const normalizedTier = computed(() => {
  if (!props.tier) return null
  return String(props.tier).trim().toLowerCase()
})

const tierLabel = computed(() => {
  const t = normalizedTier.value
  if (!t) return null
  if (t === 'native') return 'Native'
  if (t === 'platinum') return 'Platinum'
  if (t === 'gold') return 'Gold'
  if (t === 'silver') return 'Silver'
  if (t === 'bronze') return 'Bronze'
  if (t === 'borked') return 'Borked'
  // If unknown tier, return original but capitalized
  return props.tier ? String(props.tier).replace(/\b\w/g, (c) => c.toUpperCase()) : null
})

const tierColors = computed<{ bg: string; text: string }>(() => {
  const t = normalizedTier.value ?? 'unknown'
  const v = TIER_COLOR_MAP[t]
  return v ?? DEFAULT_TIER_COLORS
})

const textColor = computed(() => tierColors.value?.text ?? DEFAULT_TIER_COLORS.text)
const backgroundColor = computed(() => tierColors.value?.bg ?? DEFAULT_TIER_COLORS.bg)

const chipStyle = computed(() => {
  return {
    backgroundColor: backgroundColor.value,
  }
})
</script>

<template>
  <!-- Render a colored q-chip using inline styles and explicit text color binding.
       Avoid referencing undefined classes; style and text-color come from computed values. -->
  <q-chip
    dense square
    v-if="tierLabel"
    :style="chipStyle"
    :text-color="textColor"
    class="badge-chip"
    tabindex="-1"
    :aria-label="`ProtonDB rating: ${tierLabel}`"
  >
    <q-avatar size="40px" class="badge-chip-icon">
      <q-icon :name="simProtondb"
              :style="`color:${backgroundColor};background-color:${textColor};border-radius:16px;`" />
    </q-avatar>
    <div class="badge-chip-text">
      {{ tierLabel }}
    </div>
    <q-tooltip v-if="tierLabel">ProtonDB: {{ tierLabel }}</q-tooltip>
  </q-chip>

  <q-chip
    v-else
    dense square
    :style="chipStyle"
    :text-color="DEFAULT_TIER_COLORS.text"
    class="badge-chip"
    tabindex="-1"
    aria-label="ProtonDB rating: unknown"
  >
    <div class="badge-chip-text">
      Unknown
    </div>
    <q-tooltip>ProtonDB: Unknown</q-tooltip>
  </q-chip>
</template>

<style scoped>
.badge-chip {
  box-shadow: none;
  font-weight: 600;
  font-size: 0.85rem;
  line-height: 1;
  border-radius: 0;
  padding: 4px 8px;
  height: 30px;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
}

.badge-chip-icon {
  position: absolute;
  left: 10px;
}

.badge-chip-text {
  margin-left: 30px;
}
</style>