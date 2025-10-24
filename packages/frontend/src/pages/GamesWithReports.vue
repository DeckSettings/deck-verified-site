<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useMeta } from 'quasar'
import { fetchGamesWithReports } from 'src/utils/api'
import type { GameSearchResult } from '../../../shared/src/game'
import ScrollToTop from 'components/elements/ScrollToTop.vue'
import PageHeader from 'components/elements/PageHeader.vue'
import ReportForm from 'components/ReportForm.vue'
import PrimaryButton from 'components/elements/PrimaryButton.vue'

const baseUrl = ref((`${import.meta.env.BASE_URL ?? ''}`).replace(/^\/$/, '').replace(/\/$/, ''))
const gamesWithReports = ref<GameSearchResult[] | null>(null)
const gameBackground = ref(`${baseUrl.value}/hero-background2.jpg`)

const fetchGames = async () => {
  gamesWithReports.value = await fetchGamesWithReports(0, 100)

  if (gamesWithReports.value && gamesWithReports.value.length > 0) {
    const randomGame = gamesWithReports.value[Math.floor(Math.random() * gamesWithReports.value.length)]
    gameBackground.value = randomGame?.metadata?.hero || ''
  }
}

const reportFormDialogOpen = ref<boolean>(false)

const openDialog = () => {
  // Push a dummy state so that "back" will trigger popstate
  history.pushState({ dialog: true }, '')
  reportFormDialogOpen.value = true
}

const closeDialog = () => {
  reportFormDialogOpen.value = false
  // Remove the dummy state
  if (history.state && history.state.dialog) {
    history.back()
  }
}

const onPopState = () => {
  if (reportFormDialogOpen.value) {
    closeDialog()
  }
}

onMounted(async () => {
  window.addEventListener('popstate', onPopState)
  await fetchGames()
})
onBeforeUnmount(() => {
  window.removeEventListener('popstate', onPopState)
})

/*METADATA*/
const metaTitle = ref('Handheld Game Settings (Community Reports)')
const metaDescription = ref('Browse Steam Deck game settings and community performance reports. Find graphics presets, FPS targets, and battery life tips for top PC games on Steam Deck, ROG Ally, and Legion Go, and other handhelds.')
const metaLink = ref('https://deckverified.games/games-with-reports')
const metaLogo = ref('https://deckverified.games/logo2.png')
const metaImage = ref('https://deckverified.games/hero-image.png')
const metaAlt = ref('Handheld game settings reports')
const metaImageType = ref('image/png')
const metaImageWidth = ref('700')
const metaImageHeight = ref('330')
useMeta(() => {
  return {
    title: metaTitle.value,
    titleTemplate: title => `${title} - Deck Verified Games`,
    meta: {
      description: { name: 'description', content: metaDescription.value },
      keywords: {
        name: 'keywords',
        content: 'Steam Deck settings, Steam Deck game settings, Steam Deck performance, FPS, battery life, graphics presets, game optimisation, Proton, Linux gaming',
      },
      equiv: { 'http-equiv': 'Content-Type', content: 'text/html; charset=UTF-8' },

      // Open Graph (Facebook, Discord, etc.)
      ogTitle: { property: 'og:title', content: `${metaTitle.value} - Deck Verified Games` },
      ogType: { property: 'og:type', content: 'website' },
      ogImage: { property: 'og:image', content: metaImage.value },
      ogImageType: { property: 'og:image:type', content: metaImageType.value },
      ogImageAlt: { property: 'og:image:alt', content: metaAlt.value },
      ogImageWidth: { property: 'og:image:width', content: metaImageWidth.value },
      ogImageHeight: { property: 'og:image:height', content: metaImageHeight.value },
      ogUrl: { property: 'og:url', content: metaLink.value },
      ogDescription: { property: 'og:description', content: metaDescription.value },

      // Twitter Card (X)
      twitterCard: { name: 'twitter:card', content: 'summary_large_image' },
      twitterSite: { name: 'twitter:site', content: '@jsunnex' },
      twitterTitle: { name: 'twitter:title', content: `${metaTitle.value} - Deck Verified Games` },
      twitterDescription: { name: 'twitter:description', content: metaDescription.value },
      twitterImage: { name: 'twitter:image', content: metaImage.value },
    },

    link: { canonical: { rel: 'canonical', href: metaLink.value } },

    script: {
      ldJson: {
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'VideoGame',
          name: 'Deck Verified Games - Game reports',
          url: metaLink.value,
          image: metaImage.value || undefined,
          gamePlatform: ['Steam Deck'],
          operatingSystem: 'SteamOS',
          publisher: {
            '@type': 'Organization',
            name: 'Deck Verified Games',
            logo: {
              '@type': 'ImageObject',
              'url': metaLogo.value,
            },
          },
        }),
      },
    },
  }
})
</script>

<template>
  <q-page class="bg-dark text-white q-pb-xl" :padding="!$q.platform.isMobileUi">
    <div class="background-container"
         :style="{ backgroundImage: `linear-gradient(to top, var(--q-dark), transparent), url('${gameBackground}')` }"></div>
    <PageHeader
      title="Games With Reports"
      subtitle="Community-tested graphics settings and performance targets for popular PC games on handhelds."
      :show-nav-back-button="true"
    >
      <div class="row items-center justify-end flex-wrap q-col-gutter-md q-row-gutter-sm">
        <div v-if="$q.screen.gt.sm" class="col-12 col-md-6 flex justify-end">
          <PrimaryButton
            size="lg"
            icon="fas fa-chart-bar"
            label="View Site Stats"
            :to="{ name: 'site-stats' }"
          />
        </div>
        <div class="col-12 col-md-6 flex justify-center">
          <PrimaryButton
            :size="$q.screen.lt.sm ? 'md': 'lg'"
            icon="fas fa-file-invoice"
            label="Submit Report"
            @click="openDialog"
          />
          <q-dialog class="q-ma-none q-pa-none report-dialog"
                    backdrop-filter="blur(2px)"
                    full-height
                    :full-width="$q.screen.lt.md"
                    :maximized="$q.screen.lt.md"
                    v-model="reportFormDialogOpen"
                    @hide="closeDialog">
            <ReportForm :game-name="''"
                        :app-id="''"
                        :game-banner="''"
                        :game-background="''"
                        :existing-report="{game_display_settings: '- **DISPLAY RESOLUTION:** 1280x800'}"
                        @cancel="closeDialog"
            />
          </q-dialog>
        </div>
      </div>
    </PageHeader>
    <div class="page-content-container">
      <div class="row items-center justify-between q-mb-md">
        <div class="col-12 col-md-5">
        </div>
      </div>

      <div
        style="max-width: 2000px; margin: 0 auto"
        class="row q-col-gutter-md q-row-gutter-md q-px-lg-xl">
        <div
          v-for="(game, index) in gamesWithReports" :key="index"
          class="col-6 col-sm-4 col-md-3 col-lg-2 col-xl-2 q-pa-sm">
          <q-card
            class="q-hoverable full-height game-result"
            clickable
            v-ripple>
            <router-link
              :to="game.appId ? `/app/${game.appId}` : `/game/${encodeURIComponent(game.gameName)}`"
              class="no-decoration">
              <div class="cursor-pointer relative-position column full-height">
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
            </router-link>
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
  background: color-mix(in srgb, var(--q-dark) 55%, transparent);
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  border-radius: 16px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  transition: transform 120ms ease, border-color 120ms ease, background-color 120ms ease;
}

.game-result:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--q-primary) 35%, transparent);
  background: color-mix(in srgb, var(--q-dark) 50%, transparent);
}

.no-decoration {
  text-decoration: none; /* Removes underline from the link itself */
  color: inherit; /* Ensures the text color stays normal */
  display: block; /* Ensures it behaves like a block element */
}

.no-decoration * {
  text-decoration: none !important; /* Removes underline from all child elements */
}

.game-image {
  border-bottom: 1px solid color-mix(in srgb, white 8%, transparent);
}
</style>
