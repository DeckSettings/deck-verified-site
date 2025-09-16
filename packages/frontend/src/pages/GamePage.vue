<script setup lang="ts">
import GameData from 'components/GameData.vue'
import ScrollToTop from 'components/elements/ScrollToTop.vue'
import NavBackButton from 'components/elements/NavBackButton.vue'
import { useGameStore } from 'src/stores/game-store'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { Pinia } from 'pinia'


// Quasar preFetch (SSR + client) to ensure game data is loaded before render
defineOptions({
  async preFetch({ store, currentRoute }: { store: Pinia; currentRoute: RouteLocationNormalizedLoaded }) {
    const s = useGameStore(store)
    if (process.env.SERVER) {
      // SSR: block so bots get full HTML
      await s.ensureLoaded(currentRoute)
    } else {
      // Client nav: switch page immediately, fetch in background
      s.resetGameState()                 // clear old game instantly
      void s.ensureLoaded(currentRoute)  // fire & forget (no await)
    }
  },
})
</script>

<template>
  <q-page class="bg-dark text-white q-pb-xl" padding>
    <NavBackButton />
    <GameData />
    <ScrollToTop />
  </q-page>
</template>

<style scoped>

</style>
