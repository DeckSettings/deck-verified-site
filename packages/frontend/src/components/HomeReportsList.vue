<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { refreshScrollTrigger, useScrollTrigger } from 'src/composables/useScrollTrigger'
import { useReportsStore } from 'stores/reports-store'
import ReportList from 'components/elements/ReportList.vue'
import ReportStatsList from 'components/elements/ReportStatsList.vue'
import type { HomeReport } from 'src/utils/api'
import type { GameDetailsRequestMetricResult } from '../../../shared/src/game'
import { QAjaxBar } from 'quasar'

const ajaxBar = ref<QAjaxBar | null>(null)

const props = defineProps({
  reportSelection: {
    type: String,
    required: true,
  },
  count: {
    type: Number,
    default: 5,
  },
})

const reportStore = useReportsStore()
const isLoading = ref(true)
const listTitle = computed(() => {
  if (props.reportSelection === 'popular') return 'Most Popular Reports (most likes)'
  if (props.reportSelection === 'recentlyCreated') return 'Recently Created Reports'
  if (props.reportSelection === 'recentlyUpdated') return 'Recently Updated Reports'
  if (props.reportSelection === 'views') return 'Most Viewed (Past 7 days)'
  return 'Undefined List Title'
})

const skeletonItems = computed(() => Array.from({ length: props.count }, (_, index) => index))

const reportsList = computed(() => {
  if (props.reportSelection === 'popular') return reportStore.popular as HomeReport[]
  if (props.reportSelection === 'recentlyCreated') return reportStore.recentlyCreated as HomeReport[]
  if (props.reportSelection === 'recentlyUpdated') return reportStore.recentlyUpdated as HomeReport[]
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

async function scheduleScrollTriggerRefresh() {
  if (typeof window === 'undefined') return

  if (typeof window.requestAnimationFrame === 'function') {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        void refreshScrollTrigger().finally(resolve)
      })
    })
  } else {
    await refreshScrollTrigger()
  }
}

async function loadReports() {
  isLoading.value = true
  if (ajaxBar.value) {
    ajaxBar.value.start()
  }
  try {
    await useScrollTrigger()

    if (props.reportSelection === 'popular') {
      await reportStore.loadPopular(props.count)
    } else if (props.reportSelection === 'recentlyCreated') {
      await reportStore.loadRecentlyCreated(props.count)
    } else if (props.reportSelection === 'recentlyUpdated') {
      await reportStore.loadRecentlyUpdated(props.count)
    } else if (props.reportSelection === 'views') {
      await reportStore.loadViews(props.count)
    }

    await nextTick()
    await scheduleScrollTriggerRefresh()
  } finally {
    isLoading.value = false
    // Ensure we stop the ajax bar after loading
    if (ajaxBar.value) {
      ajaxBar.value.stop()
    }
  }
}

onMounted(() => {
  void loadReports()
})

watch(reportsList, async () => {
  if (props.reportSelection === 'views') return
  await nextTick()
  await scheduleScrollTriggerRefresh()
}, { flush: 'post' })

watch(reportsStatsList, async () => {
  if (props.reportSelection !== 'views') return
  await nextTick()
  await scheduleScrollTriggerRefresh()
}, { flush: 'post' })
</script>

<template>
  <q-ajax-bar
    v-if="$q.platform.isMobileUi"
    ref="ajaxBar"
    :position="$q.platform.isMobileUi ? 'top' : 'bottom'"
    color="secondary"
    size="5px"
    skip-hijack
  />
  <q-card class="home-reports-card text-white">
    <q-card-section class="home-reports-header">
      <h4 class="text-h6 q-ma-none">{{ listTitle }}</h4>
    </q-card-section>
    <q-card-section class="q-pt-none q-px-sm-sm q-px-xs" :class="{ 'no-padding': $q.platform.is.mobile }">
      <div v-if="isLoading" class="q-pa-md-md">
        <q-list padding>
          <q-item
            v-for="item in skeletonItems"
            :key="item"
            class="report-item"
            :class="{ 'q-pl-md': $q.platform.is.mobile }"
          >
            <q-item-section top avatar class="q-pa-none q-pr-sm q-pr-sm-md">
              <q-skeleton
                type="rect"
                animation="wave"
                width="100px"
                height="150px"
                class="skeleton-poster"
              />
            </q-item-section>
            <q-item-section class="game-info-section">
              <q-skeleton
                type="text"
                class="q-mb-xs"
                :width="$q.platform.is.mobile ? '70%' : '60%'"
                animation="wave"
              />
              <q-skeleton
                type="text"
                class="q-mb-xs"
                :width="$q.platform.is.mobile ? '90%' : '80%'"
                animation="wave"
              />
              <q-skeleton
                type="text"
                :width="$q.platform.is.mobile ? '60%' : '40%'"
                animation="wave"
              />
              <template v-if="listType === 'ReportStatsList'">
                <q-skeleton
                  type="text"
                  class="q-mt-sm"
                  :width="$q.platform.is.mobile ? '50%' : '30%'"
                  animation="wave"
                />
                <q-skeleton
                  type="rect"
                  class="rounded-borders q-mt-xs"
                  width="100%"
                  height="12px"
                  animation="wave"
                />
              </template>
            </q-item-section>
            <q-item-section
              v-if="listType === 'ReportList'"
              side
              class="gt-xs q-pl-md"
            >
              <q-skeleton type="QChip" width="120px" height="32px" class="q-mb-sm" animation="wave" />
              <q-skeleton type="text" width="80px" animation="wave" />
            </q-item-section>
          </q-item>
        </q-list>
      </div>
      <ReportList
        v-else-if="listType === 'ReportList'"
        :reports-list="reportsList" />
      <ReportStatsList
        v-else
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
  border-radius: 3px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  z-index: 1000;
}

.home-reports-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.skeleton-poster {
  border-radius: 12px;
}
</style>
