<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useHomepageStore } from 'src/stores/homepage-store'
import { QAjaxBar } from 'quasar'

const homepageStore = useHomepageStore()
const { recentGames } = storeToRefs(homepageStore)
const router = useRouter()
const ajaxBar = ref<QAjaxBar | null>(null)

const gameCards = computed(() => recentGames.value)

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function gameRoute(appId: number | null, gameName: string) {
  if (appId) {
    return `/app/${appId}`
  }
  return `/game/${encodeURIComponent(gameName)}`
}

function openGame(appId: number | null, gameName: string) {
  void router.push(gameRoute(appId, gameName))
}

async function loadRecentGamesSection() {
  const ajax = ajaxBar.value
  if (ajax) ajax.start()
  try {
    await homepageStore.loadRecentGames()
  } finally {
    if (ajax) ajax.stop()
  }
}

onMounted(() => {
  void loadRecentGamesSection()
})
</script>

<template>
  <q-ajax-bar
    v-if="$q.platform.isMobileUi"
    ref="ajaxBar"
    :position="$q.platform.isMobileUi ? 'top' : 'bottom'"
    color="secondary"
    size="5px"
    skip-hijack
  />
  <div>
    <div
      class="q-mb-md q-px-none"
      :class="$q.screen.gt.xs ? 'q-pl-xl' : 'text-center'"
      style="max-width: 760px;"
    >
      <div class="text-h4 text-weight-bold">Recently added games with fresh reports.</div>
      <div class="text-body1 text-grey-4 q-mt-sm">
        These are the latest games to gain community coverage, giving players an early place to compare settings,
        performance targets, and device-specific results.
      </div>
    </div>

    <div class="row q-col-gutter-lg q-row-gutter-lg q-px-md-none q-px-lg">
      <div
        v-for="game in gameCards"
        :key="`${game.appId ?? game.gameName}`"
        class="col-12 col-md-6 col-xl-4"
      >
        <q-card
          flat
          bordered
          class="recent-game-card cursor-pointer"
          @click="openGame(game.appId, game.gameName)"
        >
          <div
            class="recent-game-card__hero"
            :style="{ backgroundImage: `linear-gradient(180deg, rgba(4, 8, 14, 0.1), rgba(4, 8, 14, 0.92)), url('${game.metadata.hero || game.metadata.banner || game.metadata.poster || ''}')` }"
          >
            <div class="recent-game-card__topline">
              <q-chip dense size="sm" color="primary" text-color="white" icon="new_releases">
                Added {{ formatDate(game.firstReportAt) }}
              </q-chip>
            </div>

            <div class="recent-game-card__content">
              <div class="text-h6 text-weight-bold">{{ game.gameName }}</div>
              <div class="row q-gutter-xs q-mt-sm">
                <q-chip dense size="sm" color="grey-9" text-color="white" icon="description">
                  {{ game.reportCount }} reports
                </q-chip>
                <q-chip dense size="sm" color="grey-9" text-color="white" icon="thumb_up">
                  {{ game.likes }} likes
                </q-chip>
              </div>
              <div class="text-body2 text-grey-4 q-mt-md">
                Devices: {{ game.devices.join(', ') }}
              </div>
            </div>
          </div>
        </q-card>
      </div>
    </div>

    <q-card v-if="gameCards.length === 0" flat bordered class="recent-game-card recent-game-card--empty">
      <q-card-section class="text-body2 text-grey-4">
        No recently added games are available right now.
      </q-card-section>
    </q-card>
  </div>
</template>

<style scoped>
.recent-game-card {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(8, 12, 18, 0.88);
  overflow: hidden;
  min-height: 280px;
}

.recent-game-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.2);
}

.recent-game-card__hero {
  min-height: 280px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 18px;
  background-size: cover;
  background-position: center;
}

.recent-game-card__topline {
  display: flex;
  justify-content: flex-start;
}

.recent-game-card__content {
  max-width: 88%;
}

.recent-game-card--empty {
  min-height: 0;
}

@media (max-width: 1023.98px) {
  .recent-game-card__content {
    max-width: 100%;
  }
}
</style>
