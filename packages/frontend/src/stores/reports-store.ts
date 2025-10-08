import { defineStore } from 'pinia'
import {
  fetchPopularReports,
  fetchRecentReports,
  fetchTopGameDetailsRequestMetrics,
} from 'src/utils/api'
import type { HomeReport } from 'src/utils/api'
import type { GameDetailsRequestMetricResult } from '../../../shared/src/game'

const CACHE_DURATION = 60 * 1000 // 1 minute

export const useReportsStore = defineStore('reports', {
  state: () => ({
    popular: [] as HomeReport[],
    popularLastFetch: null as number | null,
    recent: [] as HomeReport[],
    recentLastFetch: null as number | null,
    views: [] as GameDetailsRequestMetricResult[],
  }),
  actions: {
    async loadPopular(count: number = 5) {
      const now = Date.now()
      if (this.popularLastFetch && (now - this.popularLastFetch < CACHE_DURATION) && this.popular.length >= count) {
        console.debug('Serving popular reports from store cache')
        return
      }

      const reports = await fetchPopularReports(count)
      this.popular = reports
      this.popularLastFetch = now
    },
    async loadRecent(count: number = 5) {
      const now = Date.now()
      if (this.recentLastFetch && (now - this.recentLastFetch < CACHE_DURATION) && this.recent.length >= count) {
        console.debug('Serving recent reports from store cache')
        return
      }

      const reports = await fetchRecentReports(count)
      this.recent = reports
      this.recentLastFetch = now
    },
    async loadViews(count: number = 5) {
      const metrics = await fetchTopGameDetailsRequestMetrics(7, 1, 99999, count)
      this.views = metrics
        .slice()
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
        .slice(0, count) as GameDetailsRequestMetricResult[]
    },
  },
})
