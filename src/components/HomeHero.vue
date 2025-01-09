<script setup lang="ts">

</script>

<template>
  <div class="hero row items-center q-pa-xs-md q-pa-sm-xl full-width">
    <div class="col-xs-12 col-md-6 text-left q-pa-md">
      <h1 class="text-h3 q-mb-lg q-mt-none" :class="{'text-center': $q.screen.lt.sm}">Welcome to Deck Verified!</h1>
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
    <div class="col-xs-12 col-md-6 q-pa-md flex flex-center gt-sm">
      <img src="~/assets/steam-deck-verified.png" alt="Hero Image" class="hero-image">
    </div>
  </div>
</template>

<style scoped>
.hero {
  background-image: linear-gradient(to right, var(--q-dark) 50%, transparent), url('src/assets/hero-background1.webp');
  background-blend-mode: multiply;
  background-size: cover;
  background-position: center;
}

.hero-image {
  width: 100%;
  max-width: 500px;
  height: auto;
}

/* sm width */
@media (min-width: 600px) {
  .hero > div {
    max-width: 1000px;
    margin: 0 auto;
  }
}
</style>
