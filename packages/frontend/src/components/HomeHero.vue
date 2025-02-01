<script setup lang="ts">
import { ref } from 'vue'

const baseUrl = ref(`${import.meta.env.BASE_URL}`)
</script>

<template>

  <div class="background-container"
       :style="{ backgroundImage: `linear-gradient(to top, var(--q-dark) 50%, transparent), url('${baseUrl}/hero-background2.jpg')` }"></div>
  <div class="background-container"></div>
  <div class="page-content-container row items-center q-pa-xs-md q-pa-sm-xl full-width">
    <div class="col-xs-12 col-md-6 text-left q-pt-md q-px-md q-pb-none">
      <h1 class="text-h3 q-mb-lg q-mt-none" :class="{'text-center': $q.screen.lt.sm}">
        Welcome to Deck Verified!
      </h1>
      <p class="text-body1" :class="{'text-center': $q.screen.lt.sm}">
        Deck Verified is a fully open-source, community-driven database built to help you get the best gaming experience
        on your handheld device.
      </p>
      <p class="text-body1" :class="{'text-center': $q.screen.lt.sm}">
        We provide game settings, performance tweaks, and compatibility reports specifically tailored for the Steam
        Deck,
        ROG Ally, and other portable PCs.
      </p>
      <div class="q-pb-md" :class="{'text-center': $q.screen.lt.sm}">
        <q-btn
          class="q-mr-md q-mt-md"
          :class="{'full-width': $q.screen.lt.sm}"
          icon="fab fa-github"
          href="https://github.com/DeckSettings/game-reports-steamos"
          target="_blank"
          label="View & Contribute to Reports"
          color="white"
          text-color="black"
          no-caps
        />
        <q-btn
          class="q-mr-md q-mt-md"
          :class="{'full-width q-mt-sm': $q.screen.lt.sm}"
          icon="fab fa-github"
          href="https://github.com/DeckSettings/deck-verified-site"
          target="_blank"
          label="View Website Source"
          color="white"
          text-color="black"
          no-caps
        />
        <p class="text-caption q-mt-md" :class="{'text-center': $q.screen.lt.sm}">
          All game report data and website source code are available on GitHub. Feel free to contribute!
        </p>
      </div>
    </div>
    <div class="col-xs-12 col-md-6 q-pa-md q-pb-none flex flex-center gt-sm">
      <img :src="`${baseUrl}/hero-image.png`" alt="Hero Image" class="hero-image">
    </div>
    <div class="full-width row justify-center q-mb-lg q-px-md">
      <q-btn
        :class="{'full-width': $q.screen.lt.sm}"
        :size="$q.screen.lt.sm ? 'md': 'lg'"
        icon="view_kanban"
        label="View All Games With Reports"
        color="secondary"
        text-color="white"
        no-caps
        :to="{ name: 'games-with-reports' }"
      />
    </div>
  </div>
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

.hero-image {
  width: 100%;
  max-width: 700px;
  height: auto;
}

/* sm width */
@media (min-width: 600px) {
  .page-content-container > div {
    margin: 0 auto;
  }
}
</style>
