<script setup lang="ts">
import { computed } from 'vue'
import { QChip, QTooltip } from 'quasar'

/* Import SVG assets as URLs so they can be used with <img>.
   Using `?url` returns a string path which avoids requiring SVG-to-Vue compilation
   and sidesteps component typing issues. */
import VerifiedIconUrl from 'src/assets/icons/steamdeck-compat-verified.svg?url'
import PlayableIconUrl from 'src/assets/icons/steamdeck-compat-playable.svg?url'
import UnsupportedIconUrl from 'src/assets/icons/steamdeck-compat-unsupported.svg?url'
import UnknownIconUrl from 'src/assets/icons/steamdeck-compat-unknown.svg?url'

/**
 * SteamCompatBadge
 *
 * Displays a small badge indicating Steam Deck compatibility status.
 * - Accepts a numeric `compatibilityCode` (3=Verified, 2=Playable, 1=Unplayable, 0/other=Unknown)
 * - Shows a small SVG icon on the left and a white label on a transparent black chip.
 *
 * This component uses Quasar `q-chip` and inline styles (no external CSS required).
 */
const props = defineProps<{
  compatibilityCode?: number | null
}>()

// Map numeric codes to label, icon URL and icon color.
// Note: iconUrl values are strings (or undefined) suitable for <img :src="...">.
type CompatEntry = {
  label: string;
  iconUrl?: string | undefined
}

const COMPAT_MAP: Record<number, CompatEntry> = {
  3: { label: 'Verified', iconUrl: VerifiedIconUrl },
  2: { label: 'Playable', iconUrl: PlayableIconUrl },
  1: { label: 'Unsupported', iconUrl: UnsupportedIconUrl },
  0: { label: 'Unknown', iconUrl: UnknownIconUrl },
}

// Default fallback entry
const FALLBACK: CompatEntry = { label: 'Unknown', iconUrl: undefined }

const chosen = computed(() => {
  const code = (typeof props.compatibilityCode === 'number') ? props.compatibilityCode : 0
  return COMPAT_MAP[code] ?? FALLBACK
})

const label = computed(() => chosen.value.label)
const iconUrl = computed(() => chosen.value.iconUrl)

// Chip styling: transparent black background, white text, 3px radius
const chipStyle = computed(() => ({
  backgroundColor: 'rgba(0,0,0,0.75)',
}))

</script>

<template>
  <q-chip
    dense square
    :style="chipStyle"
    class="badge-chip"
    text-color="white"
    tabindex="-1"
    :aria-label="`Steam Deck compatibility: ${label}`"
  >
    <q-avatar size="20px" class="badge-chip-icon">
      <q-img :src="iconUrl" />
    </q-avatar>
    <div class="badge-chip-text">
      {{ label }}
    </div>
    <q-tooltip v-if="label">Steam Deck: {{ label }}</q-tooltip>
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
  height: 28px;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
}

.badge-chip-icon {
  position: absolute;
  left: 14px;
}

.badge-chip-text {
  margin-left: 30px;
}
</style>