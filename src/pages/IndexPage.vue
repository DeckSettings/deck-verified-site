<script setup lang="ts">
import RecentReports from 'components/RecentReports.vue'
import PopularReports from 'components/PopularReports.vue'
import HomeHero from 'components/HomeHero.vue'
</script>

<template>
  <q-page class="bg-dark text-white">
    <HomeHero />

    <section class="reports-section q-pa-md">
      <div class="row">
        <div class="col-xs-12 col-md-6" :class="$q.platform.is.mobile ? 'q-pb-md' : 'q-pa-md'">
          <RecentReports />
        </div>
        <div class="col-xs-12 col-md-6" :class="$q.platform.is.mobile ? 'q-pb-md' : 'q-pa-md'">
          <PopularReports />
        </div>
      </div>
    </section>
  </q-page>
</template>

<style scoped>

</style>
