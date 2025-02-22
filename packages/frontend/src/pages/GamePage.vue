<script setup lang="ts">
import GameData from 'components/GameData.vue'
import ScrollToTop from 'components/elements/ScrollToTop.vue'
import NavBackButton from 'components/elements/NavBackButton.vue'

/*METADATA - Found in GameData component as it is dynamically generated per game*/
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
