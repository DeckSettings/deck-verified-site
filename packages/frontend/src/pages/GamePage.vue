<script setup lang="ts">
import GameData from 'components/GameData.vue'
import ScrollToTop from 'components/elements/ScrollToTop.vue'
import { useGameStore } from 'src/stores/game-store'
import { useAuthStore } from 'src/stores/auth-store'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { Pinia } from 'pinia'
import { nextTick, ref } from 'vue'

// Quasar preFetch (SSR + client) to ensure game data is loaded before render
defineOptions({
  async preFetch({ store, currentRoute }: { store: Pinia; currentRoute: RouteLocationNormalizedLoaded }) {
    const s = useGameStore(store)
    const a = useAuthStore(store)
    const githubToken = a.isLoggedIn && a.accessToken ? a.accessToken : null
    if (process.env.SERVER) {
      // SSR: block so bots get full HTML
      await s.ensureLoaded(currentRoute, githubToken)
    } else {
      // Client nav: switch page immediately, fetch in background
      s.resetGameState()                                // clear old game instantly
      void s.ensureLoaded(currentRoute, githubToken)    // fire & forget (no await)
    }
  },
})

const refreshVersion = ref(0)
const handleRefresh = async (done: () => void) => {
  refreshVersion.value++
  await nextTick()
  done()
}
</script>

<template>
  <q-pull-to-refresh class="fit" no-mouse @refresh="handleRefresh">
    <q-page class="bg-dark text-white q-pb-xl" :padding="!$q.platform.isMobileUi">
      <GameData :key="`GameData-${refreshVersion}`" />
      <ScrollToTop />
    </q-page>
  </q-pull-to-refresh>
</template>

<style scoped>

</style>
