<script setup lang="ts">
import GameData from 'components/GameData.vue'
import ScrollToTop from 'components/elements/ScrollToTop.vue'
import NavBackButton from 'components/elements/NavBackButton.vue'
</script>

<template>
  <q-page class="bg-dark text-white q-pb-xl" :padding="!$q.platform.is.mobile">
    <NavBackButton />
    <GameData />
    <ScrollToTop />
  </q-page>
</template>

<style scoped>

</style>
