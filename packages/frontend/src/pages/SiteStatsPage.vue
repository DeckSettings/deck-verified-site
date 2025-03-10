<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useMeta } from 'quasar'
import ScrollToTop from 'components/elements/ScrollToTop.vue'
import NavBackButton from 'components/elements/NavBackButton.vue'
import ReportForm from 'components/ReportForm.vue'
import StatsGameDetailsRequestsList from 'components/StatsGameDetailsRequestsList.vue'

const gameBackground = ref(`${import.meta.env.BASE_URL}/hero-background2.jpg`)
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
})
onBeforeUnmount(() => {
  window.removeEventListener('popstate', onPopState)
})

/*METADATA*/
const metaTitle = ref('Site & API Stats')
const metaDescription = ref('Discover detailed statistics about Deck Verified’s website and API. Explore metrics on game requests, usage trends, and performance data to gain insights into platform activity and user behavior.')
const metaLink = ref('https://deckverified.games/deck-verified/site-stats')
const metaLogo = ref('https://deckverified.games/deck-verified/logo2.png')
const metaImage = ref('https://deckverified.games/deck-verified/hero-image.png')
const metaAlt = ref('Deck Verified Site Statistics')
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
        content:
          'site stats, api stats, website analytics, api analytics, performance metrics, usage statistics, game request metrics, Deck Verified, metrics dashboard, platform activity'
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
      <div class="row items-center justify-between q-mb-md">
        <div class="col-12 col-md-6">
          <div class="text-h3 q-ml-xl q-mt-xl q-mb-sm">
            Site Stats
          </div>
          <div class="q-ml-xl q-mb-sm">
            <!--            All games with community-submitted reports-->
          </div>
        </div>
        <div class="col-12 col-md-6">
          <div class="column">
            <div class="col q-mt-lg" :class="$q.screen.lt.md ? 'self-center': 'self-end q-mr-xl'">
              <q-btn
                glossy
                :size="$q.screen.lt.sm ? 'md': 'lg'"
                icon="fas fa-file-invoice"
                label="Submit Report"
                color="secondary"
                text-color="white"
                @click="openDialog"
              />
              <q-dialog class="q-ma-none q-pa-none report-dialog"
                        full-height
                        :full-width="$q.screen.lt.md"
                        :maximized="$q.screen.lt.md"
                        v-model="reportFormDialogOpen"
                        @hide="closeDialog">
                <ReportForm :gameName="''"
                            :appId="''"
                            :gameBanner="''"
                            :gameBackground="''"
                            :previousSubmission="{game_display_settings: '- **DISPLAY RESOLUTION:** 1280x800'}" />
              </q-dialog>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style="max-width: 2000px; margin: 0 auto" class="row q-col-gutter-md q-row-gutter-md q-px-lg-xl">
      <div class="col-xs-12 col-md-6" :class="$q.platform.is.mobile ? 'q-pb-md' : 'q-pa-md'">
        <StatsGameDetailsRequestsList statSelection="withReports" />
      </div>
      <div class="col-xs-12 col-md-6" :class="$q.platform.is.mobile ? 'q-pb-md' : 'q-pa-md'">
        <StatsGameDetailsRequestsList statSelection="withoutReports" />
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

</style>
