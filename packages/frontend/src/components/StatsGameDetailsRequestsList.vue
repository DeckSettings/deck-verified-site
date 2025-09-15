<script lang="ts">
import { defineComponent, onMounted, ref, computed } from 'vue'
import { simSteam, simSteamdb, simProtondb, simPcgamingwiki } from 'quasar-extras-svg-icons/simple-icons-v14'
import { fetchTopGameDetailsRequestMetrics } from 'src/services/gh-reports'
import type { GameDetailsRequestMetricResult } from '../../../shared/src/game'
import { getPCGamingWikiUrlFromGameName } from 'src/services/external-links'

export default defineComponent({
  methods: { getPCGamingWikiUrlFromGameName },
  components: {},
  props: {
    statSelection: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const listTitle = ref('')
    const gameDetailsRequestsMetricResult = ref([] as GameDetailsRequestMetricResult[])

    const currentPage = ref(1)
    const itemsPerPage = 6

    onMounted(async () => {
      if (!props.statSelection) {
        listTitle.value = ''
      } else if (props.statSelection == 'withReports') {
        gameDetailsRequestsMetricResult.value = await fetchTopGameDetailsRequestMetrics(7, 1, 99999)
        listTitle.value = 'Top Requests This Week (With Reports)'
      } else if (props.statSelection == 'withoutReports') {
        gameDetailsRequestsMetricResult.value = await fetchTopGameDetailsRequestMetrics(7, 0, 0)
        listTitle.value = 'Top Requests This Week (No Reports)'
      }
      // Sort the list by request_count in descending order
      gameDetailsRequestsMetricResult.value.sort((a, b) => b.count - a.count)
    })

    const maxRequestCount = computed(() => {
      return Math.max(...gameDetailsRequestsMetricResult.value.map((metricResult) => metricResult.count))
    })

    const getCountColor = (count: number) => {
      const ratio = count / maxRequestCount.value
      const red = Math.min(255, Math.floor(255 * ratio))
      const green = Math.min(255, Math.floor(255 * (1 - ratio)))
      return `rgb(${red}, ${green}, 0)`
    }

    const paginatedResults = computed(() => {
      const start = (currentPage.value - 1) * itemsPerPage
      const end = start + itemsPerPage
      return gameDetailsRequestsMetricResult.value.slice(start, end)
    })

    return {
      listTitle,
      gameDetailsRequestsMetricResult,
      getCountColor,
      maxRequestCount,
      simSteam,
      simSteamdb,
      simProtondb,
      simPcgamingwiki,
      currentPage,
      itemsPerPage,
      paginatedResults,
    }
  },
})
</script>

<template>
  <q-card class="home-reports-card text-white">
    <q-card-section class="home-reports-header">
      <div class="text-h6 text-center">{{ listTitle }}</div>
    </q-card-section>

    <q-card-section class="q-pt-none" :class="{ 'no-padding': $q.platform.is.mobile }">
      <div>
        <q-list>
          <q-item
            v-for="(metricResult, index) in paginatedResults"
            :key="index"
            class="report-item"
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

            <q-item-section top class="q-ml-sm game-info-section">
              <q-item-label class="text-h6 q-mb-xs">
                {{ metricResult.game_name || '<< Game Name Not Yet Parsed >>' }}
              </q-item-label>
              <q-item-label caption lines="1">
                <div class="row q-gutter-sm">
                  <div class="col-12">
                    <b>App ID: </b>{{ metricResult.app_id ?? 'N/A' }}
                  </div>
                  <div class="col-12">
                    <b>Report Count: </b>{{ metricResult.report_count ?? 0 }}
                  </div>
                  <div class="col-12">
                    <b>Request Count: </b><span class="text-bold text-secondary">{{ metricResult.count }}</span>
                  </div>
                </div>
              </q-item-label>
              <q-item-label caption lines="1">
                <div class="row q-gutter-sm items-center">
                  <q-linear-progress
                    :value="metricResult.count / maxRequestCount"
                    color="secondary"
                    class="rounded-borders"
                    size="sm"
                    track-color="grey-3"
                  />
                </div>
              </q-item-label>
              <q-item-label lines="1" class="q-mt-xs row q-gutter-sm">

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
              </q-item-label>
            </q-item-section>

            <q-item-section side top class="items-end justify-start">
              <q-btn
                round
                icon="open_in_new"
                target="_blank"
                :to="metricResult.app_id ? `/app/${metricResult.app_id}` : metricResult.game_name ? `/game/${encodeURIComponent(metricResult.game_name)}` : ``"
                color="secondary"
              />
            </q-item-section>
          </q-item>
        </q-list>

        <div class="q-pa-lg flex flex-center">
          <q-pagination
            v-model="currentPage"
            :max="Math.ceil(gameDetailsRequestsMetricResult.length / itemsPerPage)"
            direction-links
            boundary-links
            size="md"
            color="secondary"
            class="q-mt-md text-center"
          />
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<style scoped>
.home-reports-card {
  background: color-mix(in srgb, var(--q-dark) 60%, transparent);
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-radius: 16px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.home-reports-header {
  display: flex;
  align-items: center;
  justify-content: center;
}

.report-item {
  margin-bottom: 8px;
  padding: 10px;
  border-radius: 12px;
  transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;
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
</style>
