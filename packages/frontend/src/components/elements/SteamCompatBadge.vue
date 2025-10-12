<script setup lang="ts">
import { computed, ref } from 'vue'
import { QChip, QTooltip, QDialog, QCard, QCardSection, QCardActions } from 'quasar'
import VerifiedIconUrl from 'src/assets/icons/steamdeck-compat-verified.svg?url'
import PlayableIconUrl from 'src/assets/icons/steamdeck-compat-playable.svg?url'
import UnsupportedIconUrl from 'src/assets/icons/steamdeck-compat-unsupported.svg?url'
import UnknownIconUrl from 'src/assets/icons/steamdeck-compat-unknown.svg?url'
import type { SteamDeckCompatibilitySummary } from '../../../../shared/src/game'
import { simSteamdeck } from 'quasar-extras-svg-icons/simple-icons-v14'
import SecondaryButton from 'components/elements/SecondaryButton.vue'
import PrimaryButton from 'components/elements/PrimaryButton.vue'

const props = defineProps<{
  steamDeckCompatibility?: SteamDeckCompatibilitySummary | null,
  gameName?: string,
}>()

type CompatEntry = {
  label: string;
  iconUrl?: string | undefined;
  colour?: string | undefined
}
const COMPAT_MAP: Record<number, CompatEntry> = {
  3: { label: 'Verified', iconUrl: VerifiedIconUrl, colour: '#59bf40' },
  2: { label: 'Playable', iconUrl: PlayableIconUrl, colour: '#ffc82c' },
  1: { label: 'Unsupported', iconUrl: UnsupportedIconUrl, colour: '#dcdedf' },
  0: { label: 'Unknown', iconUrl: UnknownIconUrl, colour: '#dcdedf' },
}

const compatibilityCode = computed(() => {
  return props.steamDeckCompatibility?.compatibilityCode ?? 0
})

const chosen = computed(() => {
  const code = compatibilityCode.value ?? 0
  return COMPAT_MAP[code] ?? { label: 'Unknown', iconUrl: undefined }
})

const descriptionCompat = (code: number) => {
  return COMPAT_MAP[code - 1]?.iconUrl ?? undefined
}

const label = computed(() => chosen.value.label)
const iconUrl = computed(() => chosen.value.iconUrl)
const colour = computed(() => chosen.value.colour)


const compatibilityItems = computed(() => {
  // Ensure we always return an array (empty array when no items present)
  return props.steamDeckCompatibility?.compatibilityItems ?? []
})

const chipStyle = computed(() => ({
  backgroundColor: 'rgba(0,0,0,0.75)',
}))

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
    dense square
    clickable
    :style="chipStyle"
    class="badge-chip"
    text-color="white"
    tabindex="-1"
    @click="openInfo"
    :aria-label="`Steam Deck compatibility: ${label} — click for details`"
  >
    <q-avatar size="20px" class="badge-chip-icon">
      <q-img :src="iconUrl" />
    </q-avatar>
    <div class="badge-chip-text">
      {{ label }}
    </div>
    <q-tooltip v-if="label">Steam Deck: {{ label }} — click for details</q-tooltip>
  </q-chip>

  <q-dialog v-model="infoDialog"
            backdrop-filter="blur(2px)"
            transition-show="scale"
            transition-hide="scale">
    <q-card flat bordered class="q-px-md" style="min-width:320px; max-width:720px;">
      <q-card-section class="text-h6">About Steam Deck compatibility</q-card-section>

      <q-card-section class="q-pt-none">
        <!-- TOP DESCRIPTION SECTION -->
        <div>
          <p>
            Steam Deck's compatibility program ( Verified / Playable / Unsupported ) indicates how well a title works on
            the
            Steam Deck hardware and SteamOS.
          </p>

          <p>
            This badge shows the summary rating for the game:
          </p>

          <ul>
            <li><strong>Verified</strong>: Works great on the Steam Deck without modification.</li>
            <li><strong>Playable</strong>: Playable but may require tweaks or have minor issues.</li>
            <li><strong>Unsupported</strong>: Not supported / significant problems.</li>
            <li><strong>Unknown</strong>: No compatibility data available.</li>
          </ul>
        </div>

        <q-separator dark spaced />

        <!-- TEST RESULTS SECTION -->
        <div v-if="compatibilityItems && compatibilityItems.length" class="q-mt-md">
          <p>
            Valve’s testing indicates that
            <span :class="{'text-bold':gameName}">{{ gameName ?? 'this game' }}</span>
            is
            <span :style="`color:${colour}`">{{ label }}</span>
            on Steam Deck.
          </p>
          <ul class="q-pl-xs">
            <li
              v-for="item in compatibilityItems"
              :key="`${item.code}-${item.description}`"
              class="row items-start"
              style="align-items:flex-start;"
            >
              <q-img
                v-if="typeof item.code === 'number'"
                :src="descriptionCompat(item.code)"
                style="width:20px; height:20px; margin-right:8px; flex: 0 0 20px;"
              />
              <div style="flex: 1;">{{ item.description }}</div>
            </li>
          </ul>
        </div>
        <div v-else class="q-mt-md">
          <p class="text-caption">
            No additional compatibility details are available for this game.
          </p>
        </div>

        <q-separator dark spaced />

        <!-- EXT LINKS SECTION -->
        <div class="q-mt-md">
          <p class="text-caption q-mt-md">
            For details on Valve's Deck Verified program, see the official page:
          </p>
          <SecondaryButton
            :icon="simSteamdeck"
            label="Steam Deck: Deck Verified"
            href="https://www.steamdeck.com/en/verified"
            target="_blank" rel="noopener">
            <q-tooltip>Open Steam Deck Website</q-tooltip>
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
  left: 14px;
}

.badge-chip-text {
  margin-left: 30px;
}
</style>