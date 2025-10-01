<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import HomeReportsList from 'components/HomeReportsList.vue'

const route = useRoute()

const reportType = computed(() => route.params.type)
</script>

<template>
  <q-page class="q-pa-md">
    <div v-if="reportType === 'recent'">
      <HomeReportsList reportSelection="recentlyUpdated" :count="20" />
    </div>
    <div v-else-if="reportType === 'views'">
      <HomeReportsList reportSelection="views" :count="20" />
    </div>
    <div v-else-if="reportType === 'popular'">
      <HomeReportsList reportSelection="popular" :count="20" />
    </div>
    <div v-else>
      <!-- Handle other report types or show a default message -->
      <div class="text-h6">Report type "{{ reportType }}" not found.</div>
    </div>
  </q-page>
</template>
