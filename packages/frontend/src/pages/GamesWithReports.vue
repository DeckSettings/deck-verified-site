<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useMeta } from 'quasar'
import { fetchGamesWithReports } from 'src/services/gh-reports'
import type { GameSearchResult } from '../../../shared/src/game'
import ScrollToTop from 'components/elements/ScrollToTop.vue'
import NavBackButton from 'components/elements/NavBackButton.vue'

const gamesWithReports = ref<GameSearchResult[] | null>(null)
const gameBackground = ref(`${import.meta.env.BASE_URL}/hero-background2.jpg`)

const fetchGames = async () => {
  gamesWithReports.value = await fetchGamesWithReports(0, 100)

  if (gamesWithReports.value && gamesWithReports.value.length > 0) {
    const randomGame = gamesWithReports.value[Math.floor(Math.random() * gamesWithReports.value.length)]
    gameBackground.value = randomGame?.metadata?.hero || ''
  }
}

onMounted(fetchGames)

/*METADATA*/
const metaTitle = ref('Games with Reports')
const metaDescription = ref('Browse a list of games with user-submitted performance reports and settings for handheld gaming devices like the Steam Deck, ROG Ally, and Legion Go.')
const metaLink = ref('https://deckverified.games/deck-verified/games-with-reports')
const metaLogo = ref('https://deckverified.games/deck-verified/logo2.png')
const metaImage = ref('https://deckverified.games/deck-verified/hero-image.png')
const metaAlt = ref('Handheld PC Collection')
const metaImageType = ref('image/png')
const metaImageWidth = ref('700')
const metaImageHeight = ref('330')
useMeta(() => {
  return {
    title: metaTitle.value,
    titleTemplate: title => `${title} - Deck Verified`,
    meta: {
      description: { name: 'description', content: metaDescription.value },
      keywords: {
        name: 'keywords',
        content: 'Steam Deck, ROG Ally, gaming performance, game settings, handheld gaming, battery life, FPS, graphics presets, ProtonDB, Linux gaming, compatibility settings, game optimization'
      },
      equiv: { 'http-equiv': 'Content-Type', content: 'text/html; charset=UTF-8' },

      // Open Graph (Facebook, Discord, etc.)
      ogTitle: { property: 'og:title', content: `${metaTitle.value} - Deck Verified` },
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
      twitterTitle: { name: 'twitter:title', content: `${metaTitle.value} - Deck Verified` },
      twitterDescription: { name: 'twitter:description', content: metaDescription.value },
      twitterImage: { name: 'twitter:image', content: metaImage.value }
    },

    link: { canonical: { rel: 'canonical', href: metaLink.value } },

    script: {
      ldJson: {
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          'name': 'Deck Verified',
          'url': metaLink.value,
          'description': metaDescription.value,
          'image': metaImage.value,
          'publisher': {
            '@type': 'Organization',
            'name': 'Deck Verified',
            'logo': {
              '@type': 'ImageObject',
              'url': metaLogo.value
            }
          }
        })
      }
    }
  }
})
</script>

<template>
  <q-page class="bg-dark text-white q-pb-xl" padding>
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
          class="col-6 col-sm-4 col-md-3 col-lg-2 col-xl-2 q-pa-sm">
          <q-card
            class="q-hoverable full-height game-result"
            clickable
            v-ripple>
            <router-link
              :to="game.appId ? `/app/${game.appId}` : `/game/${encodeURIComponent(game.gameName)}`"
              class="no-decoration ">
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
  background-color: rgba(255, 255, 255, 0.1);
  box-shadow: 5px 5px 10px black;
}

.no-decoration {
  text-decoration: none; /* Removes underline from the link itself */
  color: inherit; /* Ensures the text color stays normal */
  display: block; /* Ensures it behaves like a block element */
}

.no-decoration * {
  text-decoration: none !important; /* Removes underline from all child elements */
}
</style>
