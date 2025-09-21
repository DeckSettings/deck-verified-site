<script setup lang="ts">
import { computed, nextTick, onMounted, watch } from 'vue'
import ScrollTrigger from 'gsap/ScrollTrigger'
import { useReportsStore } from 'stores/reports-store'
import ReportList from 'components/elements/ReportList.vue'
import ReportStatsList from 'components/elements/ReportStatsList.vue'
import type { HomeReport } from 'src/services/gh-reports'
import type { GameDetailsRequestMetricResult } from '../../../shared/src/game'

const props = defineProps({
  reportSelection: {
    type: String,
    required: true,
  },
})

const reportStore = useReportsStore()
const listTitle = computed(() => {
  if (props.reportSelection === 'popular') return 'Most Popular Reports'
  if (props.reportSelection === 'recentlyUpdated') return 'Recently Updated Reports'
  if (props.reportSelection === 'views') return 'Most Viewed (Past 7 days)'
  return 'Undefined List Title'
})

const reportsList = computed(() => {
  if (props.reportSelection === 'popular') return reportStore.popular as HomeReport[]
  if (props.reportSelection === 'recentlyUpdated') return reportStore.recent as HomeReport[]
  return [] as HomeReport[]
})

const reportsStatsList = computed(() => {
  if (props.reportSelection === 'views') return reportStore.views as GameDetailsRequestMetricResult[]
  return [] as GameDetailsRequestMetricResult[]
})

const listType = computed(() => {
  if (props.reportSelection === 'views') return 'ReportStatsList'
  return 'ReportList'
})

function scheduleScrollTriggerRefresh() {
  if (typeof window === 'undefined') return
  if (typeof ScrollTrigger.refresh !== 'function') return

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      ScrollTrigger.refresh()
    })
  } else {
    ScrollTrigger.refresh()
  }
}

async function loadReports() {
  if (props.reportSelection === 'popular') {
    await reportStore.loadPopular()
  } else if (props.reportSelection === 'recentlyUpdated') {
    await reportStore.loadRecent()
  } else if (props.reportSelection === 'views') {
    await reportStore.loadViews()
  }

  await nextTick()
  scheduleScrollTriggerRefresh()
}

onMounted(() => {
  void loadReports()
})

watch(reportsList, async () => {
  if (props.reportSelection === 'views') return
  await nextTick()
  scheduleScrollTriggerRefresh()
}, { flush: 'post' })

watch(reportsStatsList, async () => {
  if (props.reportSelection !== 'views') return
  await nextTick()
  scheduleScrollTriggerRefresh()
}, { flush: 'post' })
</script>

<template>
  <q-card class="home-reports-card text-white">
    <q-card-section class="home-reports-header">
      <h4 class="text-h6 q-ma-none">{{ listTitle }}</h4>
    </q-card-section>
    <q-card-section class="q-pt-none" :class="{ 'no-padding': $q.platform.is.mobile }">
      <ReportList
        v-if="listType === 'ReportList'"
        :reports-list="reportsList" />
      <ReportStatsList
        v-if="listType === 'ReportStatsList'"
        :reports-stats-list="reportsStatsList"
        :items-per-page="0" />
    </q-card-section>
  </q-card>
</template>

<style scoped>
.home-reports-card {
  background: color-mix(in srgb, var(--q-dark) 60%, transparent);
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-radius: 16px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  z-index: 1000;
}

.home-reports-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
