<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue'
import { fetchTopGameDetailsRequestMetrics } from 'src/services/gh-reports'
import type { GameDetailsRequestMetricResult } from '../../../shared/src/game'
import { getPCGamingWikiUrlFromGameName } from 'src/services/external-links'
import ReportStatsList from 'components/elements/ReportStatsList.vue'

export default defineComponent({
  methods: { getPCGamingWikiUrlFromGameName },
  components: { ReportStatsList },
  props: {
    statSelection: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const listTitle = ref('')
    const gameDetailsRequestsMetricResult = ref([] as GameDetailsRequestMetricResult[])

    onMounted(async () => {
      if (!props.statSelection) {
        listTitle.value = ''
      } else if (props.statSelection == 'withReports') {
        gameDetailsRequestsMetricResult.value = await fetchTopGameDetailsRequestMetrics(7, 1, 99999, null)
        listTitle.value = 'Top Requests This Week (With Reports)'
      } else if (props.statSelection == 'withoutReports') {
        gameDetailsRequestsMetricResult.value = await fetchTopGameDetailsRequestMetrics(7, 0, 0, null)
        listTitle.value = 'Top Requests This Week (No Reports)'
      }
      // Sort the list by request_count in descending order
      gameDetailsRequestsMetricResult.value.sort((a, b) => b.count - a.count)
    })

    return {
      listTitle,
      gameDetailsRequestsMetricResult,
    }
  },
})
</script>

<template>
  <q-card class="home-reports-card text-white">
    <q-card-section class="home-reports-header">
      <div class="text-h6 text-center">{{ listTitle }}</div>
    </q-card-section>
    <q-card-section class="q-pt-none" :class="{ 'no-padding': $q.platform.is.mobile }">
      <ReportStatsList :reports-stats-list="gameDetailsRequestsMetricResult" :items-per-page="6" />
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
}

.home-reports-header {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
