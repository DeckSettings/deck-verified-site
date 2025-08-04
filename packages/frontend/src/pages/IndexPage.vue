<script setup lang="ts">
import { ref } from 'vue'
import { useMeta } from 'quasar'
import HomeReportsList from 'components/HomeReportsList.vue'
import HomeHero from 'components/HomeHero.vue'
import ScrollToTop from 'components/elements/ScrollToTop.vue'
import HomeSupportedDevicesSection from 'components/HomeSupportedDevicesSection.vue'

/*METADATA*/
const metaTitle = ref('Welcome')
const metaDescription = ref('Welcome to Deck Verified is an open-source, community-driven database of performance reports, settings, and tweaks for handheld gaming PCs like the Steam Deck, ROG Ally, and Legion Go.')
const metaLink = ref('https://deckverified.games/deck-verified/')
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
    <HomeHero />

    <section class="reports-section q-pa-md">
      <div class="row">
        <div class="col-xs-12 col-md-6" :class="$q.platform.is.mobile ? 'q-pb-md' : 'q-pa-md'">
          <HomeReportsList reportSelection="recentlyUpdated" />
        </div>
        <div class="col-xs-12 col-md-6" :class="$q.platform.is.mobile ? 'q-pb-md' : 'q-pa-md'">
          <HomeReportsList reportSelection="popular" />
        </div>
      </div>
    </section>

    <ScrollToTop />
  </q-page>
</template>

<style scoped>

</style>
