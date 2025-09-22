<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMeta, useQuasar } from 'quasar'
import { useReportsStore } from 'stores/reports-store'
import type { Pinia } from 'pinia'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import ScrollToTop from 'components/elements/ScrollToTop.vue'
import HomeHero from 'components/HomeHero.vue'
import HomePageSection from 'components/HomePageSection.vue'
import HomeReportsList from 'components/HomeReportsList.vue'
import HomeSupportedDevicesSection from 'components/HomeSupportedDevicesSection.vue'
import HomeDeckyPlugin from 'components/HomeDeckyPlugin.vue'


// Quasar preFetch (SSR + client) to ensure game data is loaded before render
defineOptions({
  async preFetch({ store }: { store: Pinia; currentRoute: RouteLocationNormalizedLoaded }) {
    const s = useReportsStore(store)
    if (process.env.SERVER) {
      // SSR: block so bots get full HTML
      await s.loadPopular()
      await s.loadRecent()
      await s.loadViews()
    }
  },
})

const $q = useQuasar()

const reportStore = useReportsStore()

onMounted(async () => {
  await reportStore.loadViews()
})
const fallbackSectionBackground = 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1817070/library_hero.jpg'

const sectionBackgrounds = computed<string[]>(() => {
  return reportStore.views.map(rpt => {
    const heroUrl = rpt.metadata?.hero || rpt.metadata?.poster
    const posterUrl = rpt.metadata?.poster || rpt.metadata?.hero
    if ($q.screen.width < 1024) {
      return posterUrl || fallbackSectionBackground
    }
    return heroUrl || fallbackSectionBackground
  })
})

function getSectionBackground(index: number): string {
  const backgrounds = sectionBackgrounds.value
  if (!backgrounds.length) {
    return fallbackSectionBackground
  }
  return backgrounds[index] ?? fallbackSectionBackground
}

/*METADATA*/
const metaTitle = ref('Steam Deck Game Settings & Performance Reports')
const metaDescription = ref('Find the best Steam Deck settings for popular PC games. Community-driven performance reports, graphics tweaks, and battery life tips for Steam Deck, ROG Ally, and Legion Go.')
const metaLink = ref('https://deckverified.games/')
const metaLogo = ref('https://deckverified.games/logo2.png')
const metaImage = ref('https://deckverified.games/hero-image.png')
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
        content: 'Steam Deck, ROG Ally, gaming performance, game settings, handheld gaming, battery life, FPS, graphics presets, ProtonDB, Linux gaming, compatibility',
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
      twitterImage: { name: 'twitter:image', content: metaImage.value },
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
  <q-page class="bg-dark text-white q-pb-xl">
    <div>
      <HomePageSection>
        <HomeHero />
      </HomePageSection>
    </div>

    <div>
      <HomePageSection
        section-title="reports">
        <div class="row">
          <div class="col-xs-12 col-md-6 q-pt-md q-pa-md-sm q-px-lg-md">
            <HomeReportsList reportSelection="recentlyUpdated" />
          </div>
          <div class="col-xs-12 col-md-6 q-pt-md q-pa-md-sm q-px-lg-md">
            <HomeReportsList reportSelection="views" />
          </div>
        </div>
      </HomePageSection>
    </div>

    <div class="supported-devices-section">
      <HomePageSection
        :add-debug-markers="false"
        section-title="devices"
        bg-show-start-pos="top center"
        bg-show-end-pos="bottom center"
        background-colour="var(--q-primary)"
        :background-image="getSectionBackground(2)">
        <HomeSupportedDevicesSection />
      </HomePageSection>
    </div>

    <div class="decky-plugin-section">
      <HomePageSection
        :add-debug-markers="false"
        section-title="devices"
        bg-show-start-pos="top bottom-=200px"
        background-colour="var(--q-primary)"
        :background-image="getSectionBackground(3)">
        <HomeDeckyPlugin />
      </HomePageSection>
    </div>

    <ScrollToTop />
  </q-page>
</template>

<style scoped>
.supported-devices-section {
  margin-top: 300px;
}

.decky-plugin-section {
  margin-top: 100px;
}

@media (max-width: 1023.98px) {
  .supported-devices-section {
    margin-top: 100px;
  }
}
</style>
