<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchGamesWithReports } from 'src/services/gh-reports'
import type { GameSearchResult } from '../../../shared/src/game'
import { useRouter } from 'vue-router'
import ScrollToTop from 'components/elements/ScrollToTop.vue'
import NavBackButton from 'components/elements/NavBackButton.vue'

const router = useRouter()

const gamesWithReports = ref<GameSearchResult[] | null>(null)
const gameBackground = ref('~/assets/hero-image.png')

const goToGamePage = async (e: Event, path: string) => {
  e.preventDefault()
  await router.push(path)
}

const fetchGames = async () => {
  gamesWithReports.value = await fetchGamesWithReports(0, 100)

  if (gamesWithReports.value && gamesWithReports.value.length > 0) {
    const randomGame = gamesWithReports.value[Math.floor(Math.random() * gamesWithReports.value.length)]
    gameBackground.value = randomGame?.metadata?.hero || ''
  }
}

onMounted(fetchGames)
</script>

<template>
  <q-page class="bg-dark text-white q-pb-xl" :padding="!$q.platform.is.mobile">
    <div class="background-container"
         :style="{ backgroundImage: `linear-gradient(to top, var(--q-dark), transparent), url('${gameBackground}')` }"></div>
    <NavBackButton />
    <div class="page-content-container">
      <div class="text-h3 q-ml-xl q-mt-xl q-mb-sm">Games with Reports</div>
      <div class="q-ml-xl q-mb-xl">All games with community-submitted reports</div>

      <div
        style="max-width: 2000px; margin: 0 auto"
        class="row q-col-gutter-md q-row-gutter-md q-px-lg-xl">
        <div
          v-for="(game, index) in gamesWithReports" :key="index"
          class="col-6 col-sm-4 col-md-3 col-lg-2 col-xl-2">
          <q-card
            class="q-hoverable full-height game-result"
            clickable
            v-ripple>
            <div
              v-ripple
              class="cursor-pointer relative-position column full-height"
              @click="(e) => goToGamePage(e, game.appId ? `/app/${game.appId}` : `/game/${encodeURIComponent(game.gameName)}`)">

              <q-img
                v-if="game.metadata.poster"
                class="game-image"
                :src="game.metadata.poster"
                alt="Game Banner"
                :ratio="2/3">
                <template v-slot:error>
                  <img
                    src="~/assets/banner-placeholder.png"
                    alt="Placeholder" />
                </template>
              </q-img>
              <q-img
                v-else
                class="game-image"
                src="~/assets/banner-placeholder.png"
                alt="Game Image Placeholder"
                :ratio="2/3" />

              <q-card-section class="text-center">
                <q-item-label lines="2" class="text-h6">
                  {{ game.gameName }}
                </q-item-label>
                <q-item-label caption class="text-primary q-pt-sm self-baseline">
                  App ID: {{ game.appId }}
                </q-item-label>
                <q-item-label caption class="text-secondary">
                  {{ game.reportCount }} reports
                </q-item-label>
              </q-card-section>

            </div>
          </q-card>
        </div>
      </div>
    </div>

    <ScrollToTop />
  </q-page>
</template>

<style scoped>
.background-container {
  background-size: cover;
  background-position: center;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 800px;
  z-index: 0;
}

.background-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: /* Top fade */ linear-gradient(to bottom, transparent 20%, rgba(0, 0, 0, 0.6) 50%, var(--q-dark) 100%),
    /* Left fade */ linear-gradient(to right, var(--q-dark) 40%, transparent 70%, transparent 90%, var(--q-dark) 100%),
    /* Left fade */ linear-gradient(to right, var(--q-dark) 40%, transparent 70%, transparent 90%, var(--q-dark) 100%),
    /* Right fade */ linear-gradient(to left, var(--q-dark) 0%, transparent 30%, transparent 70%, var(--q-dark) 100%);
  mix-blend-mode: darken; /* Ensures darker areas blend naturally with the image */
  z-index: 1; /* Place it above the background image */
}

.page-content-container {
  position: relative;
}

.game-result {
  background-color: rgba(255, 255, 255, 0.1);
  box-shadow: 5px 5px 10px black;
}
</style>
