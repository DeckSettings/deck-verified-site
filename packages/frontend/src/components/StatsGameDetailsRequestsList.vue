<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue'
import { fetchTopGameDetailsRequestMetrics } from 'src/utils/api'
import type { GameDetailsRequestMetricResult } from '../../../shared/src/game'
import { getPCGamingWikiUrlFromGameName } from 'src/utils/external-links'
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
  <q-card class="reports-card text-white">
    <q-card-section class="row items-center justify-center">
      <div class="text-h6 text-center">{{ listTitle }}</div>
    </q-card-section>
    <q-card-section class="q-pt-none" :class="{ 'no-padding': $q.platform.is.mobile }">
      <ReportStatsList :reports-stats-list="gameDetailsRequestsMetricResult" :items-per-page="6" />
    </q-card-section>
  </q-card>
</template>

<style scoped>

</style>
