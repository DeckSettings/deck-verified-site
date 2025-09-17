import { defineStore } from 'pinia'
import {
  fetchPopularReports,
  fetchRecentReports,
  fetchTopGameDetailsRequestMetrics,
} from 'src/services/gh-reports'
import type { HomeReport } from 'src/services/gh-reports'
import type { GameDetailsRequestMetricResult } from '../../../shared/src/game'


export const useReportsStore = defineStore('reports', {
  state: () => ({
    popular: [] as HomeReport[],
    recent: [] as HomeReport[],
    views: [] as GameDetailsRequestMetricResult[],
  }),
  actions: {
    async loadPopular() {
      this.popular = await fetchPopularReports() as HomeReport[]
    },
    async loadRecent() {
      this.recent = await fetchRecentReports() as HomeReport[]
    },
    async loadViews() {
      const metrics = await fetchTopGameDetailsRequestMetrics(7, 1, 99999, 10)
      this.views = metrics
        .slice()
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
        .slice(0, 5) as GameDetailsRequestMetricResult[]
    },
  },
})
