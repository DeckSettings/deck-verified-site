<script setup lang="ts">
import { computed, ref } from 'vue'
import googlePlayBadgeUrl from 'src/assets/GetItOnGooglePlay_Badge_Web_color_English.svg'

const slides = [
  {
    title: 'Easily search optimised settings',
    subtitle: 'Quickly find game reports by typing a name or Steam App ID. The search updates as you type so you can discover how other players have tuned their games for better performance on your device.',
    img: new URL('../assets/mobile-app-screenshots/search-cyberpunk.png', import.meta.url).href,
  },
  {
    title: 'Filter by any PC handheld',
    subtitle: 'Use filters to match your setup, like device or launcher, and see reports made for your exact hardware. Works great for Steam Deck, ROG Ally, Legion Go, MSI Claw, and more.',
    img: new URL('../assets/mobile-app-screenshots/filter-reports.png', import.meta.url).href,
  },
  {
    title: 'Easily submit and edit your own reports',
    subtitle: 'Add your own settings in just a few taps. Use the auto-complete fields or upload a screenshot and let the app read your game settings automatically with built-in OCR.',
    img: new URL('../assets/mobile-app-screenshots/submit-reports.png', import.meta.url).href,
  },
]

const slide = ref(1)
const currentSlide = computed(() => slides[Math.max(0, Math.min(slides.length - 1, slide.value - 1))])
</script>

<template>
  <div class="android-app-promo">
    <div class="android-app-promo__media" aria-hidden="true">
      <div class="mobile-frame">
        <q-carousel
          v-model.number="slide"
          animated
          :autoplay="10000"
          infinite
          class="mobile-carousel"
        >
          <q-carousel-slide
            v-for="(slideItem, index) in slides"
            :key="index"
            :name="index + 1"
            :img-src="slideItem.img"
          />
        </q-carousel>
      </div>
    </div>
    <q-card class="android-app-promo__card">
      <q-card-section class="android-app-promo__card-section q-pb-none">
        <h2 class="text-h3 q-ma-none text-center">
          Get the Official App
        </h2>
        <p>
          Take the power of <strong>Deck Verified Games</strong> and the <strong>Deck Settings</strong> project on the
          go with our official Android app. Browse community-driven reports and discover the best performance settings
          for your favorite handheld PC games—anytime, anywhere. Whether you’re gaming on a <strong>Steam Deck</strong>,
          <strong>ROG Ally</strong>, <strong>Lenovo Legion Go</strong>, <strong>Zotac Zone</strong>, or <strong>MSI
          Claw</strong>, the app helps you get the most out of your device.
        </p>
        <p>
          The Android app includes all the features of the website in a clean, mobile-friendly layout. You can search
          for game reports, filter by device, and even submit or edit your own findings directly from your phone.
        </p>
        <p>
          Right now, the app is available for Android only. Depending on community support, I’d love to bring it to iOS
          as well. If you’d like to help make that happen, you can support development on
          <a class="inline-link"
             href="https://ko-fi.com/josh5coffee/goal?g=0"
             target="_blank"
             rel="noopener">Ko-fi</a>.
        </p>
      </q-card-section>

      <q-card-section class="row justify-center q-py-none">
        <q-btn
          flat
          unelevated
          padding="none"
          class="google-play-btn"
          href="https://play.google.com/store/apps/details?id=nz.co.streamingtech.deckverified"
          target="_blank"
        >
          <img
            :src="googlePlayBadgeUrl"
            alt="Get it on Google Play"
            class="google-play-badge">
        </q-btn>
      </q-card-section>

      <q-separator dark class="q-mx-xl q-my-md" />

      <q-card-section class="carousel-text text-center q-pt-none">
        <div class="text-h6 carousel-text-title">{{ currentSlide?.title }}</div>
        <div class="text-caption carousel-text-subtitle">{{ currentSlide?.subtitle || '' }}</div>
      </q-card-section>
    </q-card>
  </div>
</template>

<style scoped>
.android-app-promo {
  display: flex;
  flex-direction: row;
  justify-content: center;
  min-height: 640px;
  align-items: center;
  margin: 0 100px;
  gap: 2rem;
  overflow: visible;
}

.android-app-promo__media {
  position: relative;
  z-index: 1101;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  order: 2;
  min-width: 200px;
  max-width: 450px;
  width: clamp(220px, 22vw, 400px);
  flex: 1 0 auto;
}

.mobile-frame {
  position: relative;
  background-image: url('../assets/samsung-s23-ultra-front-facing.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
  width: 100%;
  max-width: 350px;
  aspect-ratio: 400 / 840;
  height: auto;
}

.mobile-carousel {
  position: absolute;
  overflow: hidden;
  /* Screen cut-out section calculations (image coords: left 16px, top 17px to 379px, 826px) */
  top: 2.02%;
  left: 4%;
  width: 90.75%;
  height: 96.31%;
}

.android-app-promo__card {
  max-width: 700px;
  min-width: 400px;
  z-index: 1000;
  flex: 0 1 auto;
  background: color-mix(in srgb, var(--q-dark) 80%, transparent);
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-radius: 16px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

.android-app-promo__card-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.carousel-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  height: clamp(7.5rem, 20vh, 8.5rem);
  padding: 0.5rem 1rem 0.75rem 1rem;
  box-sizing: border-box;
}

.carousel-text .carousel-text-title {
  margin: 0 0 0.5rem 0;
  text-align: center;
}

.carousel-text .carousel-text-subtitle {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  margin: 0;
}

.android-app-promo__card a {
  color: var(--q-primary);
  text-decoration-color: color-mix(in srgb, var(--q-primary) 50%, transparent);
}

.android-app-promo__card a:hover {
  text-decoration: underline;
}

@media (max-width: 1023.98px) {
  .android-app-promo {
    flex-direction: column;
    margin: 0 0 50px 0;
  }

  .android-app-promo__card,
  .android-app-promo__media {
    max-width: 900px;
  }

  .android-app-promo__media {
    order: 1;
  }
}

@media (max-width: 599.98px) {
  .android-app-promo {
    gap: 1.25rem;
  }

  .android-app-promo__media {
    width: 97vw;
  }

  .android-app-promo__card {
    min-width: 200px;
  }
}

.google-play-btn {
  width: 200px;
  height: auto;
  padding: 0;
  min-width: 0;
  display: inline-block;
  line-height: 0;
  background: transparent;
  box-shadow: none;
}

.google-play-badge {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
}
</style>
