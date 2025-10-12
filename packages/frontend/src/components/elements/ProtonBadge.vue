<script setup lang="ts">
import { computed, ref } from 'vue'
import { QChip, QTooltip, QDialog, QCard, QCardSection, QCardActions } from 'quasar'
import { simProtondb } from 'quasar-extras-svg-icons/simple-icons-v14'
import SecondaryButton from 'components/elements/SecondaryButton.vue'
import PrimaryButton from 'components/elements/PrimaryButton.vue'

const props = defineProps<{
  tier?: string | null,
  gameName?: string,
  appId?: string | null,
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

const TIER_DESCRIPTION_MAP: Record<string, string> = {
  native: 'Runs natively on Linux/SteamOS without Proton.',
  platinum: 'Works flawlessly with Proton—no special configuration needed.',
  gold: 'Runs well with Proton, may need minor tweaks or workarounds.',
  silver: 'Playable with Proton but may require significant tweaks to be stable or comfortable.',
  bronze: 'Limited functionality; major issues or reduced experience expected.',
  borked: 'Unplayable with Proton (game crashes or is unusable).',
  unknown: 'No community rating available.',
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

const tierDescription = computed(() => {
  const t = normalizedTier.value ?? 'unknown'
  return TIER_DESCRIPTION_MAP[t] ?? TIER_DESCRIPTION_MAP['unknown']
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

const infoDialog = ref(false)

function openInfo() {
  infoDialog.value = true
}

function closeInfo() {
  infoDialog.value = false
}
</script>

<template>
  <q-chip
    v-if="tierLabel"
    dense square
    clickable
    :style="chipStyle"
    :text-color="textColor"
    class="badge-chip"
    tabindex="-1"
    @click="openInfo"
    :aria-label="`ProtonDB rating: ${tierLabel} — click for more info`"
  >
    <q-avatar size="40px" class="badge-chip-icon">
      <q-icon :name="simProtondb"
              :style="`color:${backgroundColor};background-color:${textColor};border-radius:16px;`" />
    </q-avatar>
    <div class="badge-chip-text">
      {{ tierLabel }}
    </div>
    <q-tooltip v-if="tierLabel">ProtonDB: {{ tierLabel }} — click for more info</q-tooltip>
  </q-chip>

  <q-chip
    v-else
    dense square
    clickable
    :style="chipStyle"
    :text-color="DEFAULT_TIER_COLORS.text"
    class="badge-chip"
    tabindex="-1"
    @click="openInfo"
    aria-label="ProtonDB rating: unknown — click for more info"
  >
    <div class="badge-chip-text">
      Unknown
    </div>
    <q-tooltip>ProtonDB: Unknown — click for more info</q-tooltip>
  </q-chip>

  <q-dialog v-model="infoDialog"
            backdrop-filter="blur(2px)"
            transition-show="scale"
            transition-hide="scale">
    <q-card flat bordered class="q-px-md" style="min-width: 320px; max-width: 640px;">
      <q-card-section>
        <div class="text-h6">About Proton & ProtonDB</div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <!-- TOP DESCRIPTION SECTION -->
        <div>
          <p>
            Proton is a compatibility layer (based on Wine and other components) that lets many Windows games run on
            Linux
            and SteamOS.
            ProtonDB is a community-driven site where users report how well games run under Proton and provide tips and
            workarounds.
          </p>

          <p>
            This badge shows the community rating for Proton/ProtonDB. The tier indicates the general experience other
            users have reported:
          </p>

          <ul>
            <li>
              <span class="text-bold" :style="`color:${TIER_COLOR_MAP['native']?.bg};`">Native</span>:
              {{ TIER_DESCRIPTION_MAP['native'] }}
            </li>
            <li>
              <span class="text-bold" :style="`color:${TIER_COLOR_MAP['platinum']?.bg};`">Platinum</span>:
              {{ TIER_DESCRIPTION_MAP['platinum'] }}
            </li>
            <li>
              <span class="text-bold" :style="`color:${TIER_COLOR_MAP['gold']?.bg};`">Gold</span>:
              {{ TIER_DESCRIPTION_MAP['gold'] }}
            </li>
            <li>
              <span class="text-bold" :style="`color:${TIER_COLOR_MAP['silver']?.bg};`">Silver</span>:
              {{ TIER_DESCRIPTION_MAP['silver'] }}
            </li>
            <li>
              <span class="text-bold" :style="`color:${TIER_COLOR_MAP['bronze']?.bg};`">Bronze</span>:
              {{ TIER_DESCRIPTION_MAP['bronze'] }}
            </li>
            <li>
              <span class="text-bold" :style="`color:${TIER_COLOR_MAP['borked']?.bg};`">Borked</span>:
              {{ TIER_DESCRIPTION_MAP['borked'] }}
            </li>
          </ul>
        </div>

        <q-separator dark spaced />

        <!-- TEST RESULTS SECTION -->
        <div class="q-mt-md">
          <p>
            The ProtonDB community reporting has given
            <span :class="{'text-bold':gameName}">{{ gameName ?? 'this game' }}</span>
            a
            <span class="text-bold" :style="`color:${backgroundColor};`">
            {{ tierLabel ?? 'Unknown' }}
            </span>
            rating — <span class="text-italic">{{ tierDescription }}</span>
          </p>
        </div>

        <q-separator dark spaced />

        <!-- EXT LINKS SECTION -->
        <div class="q-mt-md">
          <p class="text-caption">
            For detailed reports and user-submitted tips{{ appId ? ' for this game' : '' }}, visit ProtonDB at the link
            below.
          </p>
          <SecondaryButton
            :icon="simProtondb"
            :label="(appId && gameName) ? `ProtonDB: ${gameName}` : 'ProtonDB'"
            :href="appId ? `https://www.protondb.com/app/${appId}?device=steamDeck` : 'https://www.protondb.com/'"
            target="_blank" rel="noopener">
            <q-tooltip>Open ProtonDB Website</q-tooltip>
          </SecondaryButton>
        </div>
      </q-card-section>

      <q-card-actions align="right">

        <PrimaryButton
          label="Close"
          color="grey"
          icon="close"
          @click="closeInfo"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
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