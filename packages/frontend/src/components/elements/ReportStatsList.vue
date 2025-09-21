<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PropType } from 'vue'
import type { GameDetailsRequestMetricResult } from '../../../../shared/src/game'
import { simSteam, simSteamdb, simProtondb, simPcgamingwiki } from 'quasar-extras-svg-icons/simple-icons-v14'
import { getPCGamingWikiUrlFromGameName } from 'src/services/external-links'
import SecondaryButton from 'components/elements/SecondaryButton.vue'
import { useQuasar } from 'quasar'

const $q = useQuasar()

const props = defineProps({
  reportsStatsList: {
    type: Array as PropType<GameDetailsRequestMetricResult[]>,
    required: true,
  },
  itemsPerPage: {
    type: Number,
    required: false,
    default: 0,
  },
})

const currentPage = ref(1)

const paginatedResults = computed(() => {
  if (props.itemsPerPage > 0) {
    const start = (currentPage.value - 1) * props.itemsPerPage
    const end = start + props.itemsPerPage
    return props.reportsStatsList.slice(start, end)
  }
  return props.reportsStatsList
})

const maxRequestCount = computed(() => {
  return Math.max(...props.reportsStatsList.map((metricResult) => metricResult.count))
})

//const getCountColor = (count: number) => {
//  const ratio = count / maxRequestCount.value
//  const red = Math.min(255, Math.floor(255 * ratio))
//  const green = Math.min(255, Math.floor(255 * (1 - ratio)))
//  return `rgb(${red}, ${green}, 0)`
//}

const getGameDataUrl = (metricResult: { app_id?: number | null; game_name?: string | null }) => {
  if (metricResult.app_id) return `/app/${metricResult.app_id}`
  if (metricResult.game_name) return `/game/${encodeURIComponent(metricResult.game_name)}`
  return ''
}
</script>

<template>
  <div class="q-pa-md-md">
    <q-list padding>
      <q-item
        v-for="(metricResult, index) in paginatedResults"
        :key="index"
        class="report-item"
        :class="{ 'q-pl-md': $q.platform.is.mobile }"
        v-ripple
        :clickable="$q.platform.is.mobile"
        :to="!$q.platform.is.mobile ? '' : getGameDataUrl(metricResult)"
      >
        <q-item-section top avatar class="q-pa-none q-pr-sm q-pr-sm-md">
          <div :style="$q.platform.is.mobile ? 'width: 80px;' : 'width: 100px;'">
            <q-img
              v-if="metricResult?.metadata?.poster"
              class="game-poster"
              :src="metricResult?.metadata?.poster"
              alt="Game Image"
              :ratio="2/3"
              :style="$q.platform.is.mobile ? 'width: 80px;' : 'width: 100px;'"
            >
              <template v-slot:error>
                <img
                  src="~/assets/poster-placeholder.png"
                  alt="Placeholder"
                  :style="$q.platform.is.mobile ? 'width: 80px; height: 120px;' : 'width: 100px; height: 150px;'"
                />
              </template>
            </q-img>
            <q-img
              v-else-if="metricResult.app_id"
              class="game-poster"
              :src="`https://steamcdn-a.akamaihd.net/steam/apps/${metricResult.app_id}/library_600x900.jpg`"
              alt="Game Image"
              :ratio="2/3"
              :style="$q.platform.is.mobile ? 'width: 80px;' : 'width: 100px;'"
            >
              <template v-slot:error>
                <img
                  src="~/assets/poster-placeholder.png"
                  alt="Placeholder"
                  :style="$q.platform.is.mobile ? 'width: 80px; height: 120px;' : 'width: 100px; height: 150px;'"
                />
              </template>
            </q-img>
            <img
              v-else
              class="game-poster"
              src="~/assets/poster-placeholder.png"
              alt="Placeholder"
              :style="$q.platform.is.mobile ? 'width: 80px; height: 120px;' : 'width: 100px; height: 150px;'"
            />
          </div>
        </q-item-section>

        <q-item-section top class="col q-ml-sm game-info-section overflow-hidden">
          <div class="column full-width">
            <!-- Top content -->
            <div class="row items-start justify-between q-col-gutter-sm no-wrap">
              <div class="col" style="white-space: nowrap; overflow: hidden;">
                <div class="text-h6 q-mb-xs">
                  {{ metricResult.game_name || '<< Game Name Not Yet Parsed >>' }}
                </div>
                <div class="text-caption">
                  <div><b>App ID: </b>{{ metricResult.app_id ?? 'N/A' }}</div>
                  <div><b>Report Count: </b>{{ metricResult.report_count ?? 0 }}</div>
                </div>
              </div>
              <div class="col-auto self-start">
                <SecondaryButton
                  class="gt-sm"
                  icon="open_in_new"
                  label="View Reports"
                  target="_blank"
                  :to="getGameDataUrl(metricResult)"
                />
              </div>
            </div>

            <!-- Bottom content -->
            <div class="row">
              <div class="col">
                <div class="text-caption q-mb-xs">
                  <b>Views: </b><span class="text-bold text-secondary">{{ metricResult.count }}</span>
                </div>
                <q-linear-progress
                  :value="metricResult.count / maxRequestCount"
                  color="secondary"
                  class="rounded-borders"
                  size="sm"
                  track-color="grey-3"
                />
                <div class="row gt-sm q-gutter-sm q-mt-xs">
                  <q-btn v-if="metricResult.app_id"
                         class="q-ma-none"
                         round flat
                         :icon="simSteam"
                         :href="`https://store.steampowered.com/app/${metricResult.app_id}`"
                         target="_blank" rel="noopener"
                         color="white">
                    <q-tooltip>View on Steam</q-tooltip>
                  </q-btn>
                  <q-btn v-if="metricResult.app_id"
                         class="q-ma-none"
                         round flat
                         :icon="simProtondb"
                         :href="`https://www.protondb.com/app/${metricResult.app_id}?device=steamDeck`"
                         target="_blank" rel="noopener"
                         color="white">
                    <q-tooltip>View on ProtonDB</q-tooltip>
                  </q-btn>
                  <q-btn v-if="metricResult.app_id"
                         class="q-ma-none"
                         round flat
                         :icon="simSteamdb"
                         :href="`https://steamdb.info/app/${metricResult.app_id}/charts/`"
                         target="_blank" rel="noopener"
                         color="white">
                    <q-tooltip>View on SteamDB</q-tooltip>
                  </q-btn>
                  <q-btn v-if="metricResult.game_name"
                         class="q-ma-none"
                         round flat
                         :icon="simPcgamingwiki"
                         :href="getPCGamingWikiUrlFromGameName(metricResult.game_name)"
                         target="_blank" rel="noopener"
                         color="white">
                    <q-tooltip>View on PCGamingWiki</q-tooltip>
                  </q-btn>
                </div>
              </div>
            </div>
          </div>
        </q-item-section>
      </q-item>
    </q-list>
    <div v-if="itemsPerPage > 0" class="q-pa-lg flex flex-center">
      <q-pagination
        v-model="currentPage"
        :max="Math.ceil(reportsStatsList.length / itemsPerPage)"
        direction-links
        boundary-links
        size="md"
        color="secondary"
        class="q-mt-md text-center"
      />
    </div>
  </div>
</template>

<style scoped>

.report-item {
  margin-bottom: 8px;
  padding: 10px;
  border-radius: 12px;
  /*transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;*/
  border: 1px solid transparent;
}

.report-item:hover {
  background-color: color-mix(in srgb, var(--q-primary) 12%, transparent);
  border-color: color-mix(in srgb, var(--q-primary) 35%, transparent);
  transform: translateY(-1px);
}

.game-info-section {
  display: flex;
  flex-direction: column;
}

.game-poster {
  background-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.4);
  border-radius: 8px;
}

/* -md- */
@media (min-width: 1024px) {
  .game-info-section {
    height: 150px;
  }
}
</style>
