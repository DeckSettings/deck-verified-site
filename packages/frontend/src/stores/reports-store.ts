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
    recentlyCreated: [] as HomeReport[],
    recentlyCreatedLastFetch: null as number | null,
    recentlyUpdated: [] as HomeReport[],
    recentlyUpdatedLastFetch: null as number | null,
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
    async loadRecentlyCreated(count: number = 5) {
      const now = Date.now()
      if (this.recentlyCreatedLastFetch && (now - this.recentlyCreatedLastFetch < CACHE_DURATION) && this.recentlyCreated.length >= count) {
        console.debug('Serving recent reports from store cache')
        return
      }

      const reports = await fetchRecentReports(count, 'created')
      this.recentlyCreated = reports
      this.recentlyCreatedLastFetch = now
    },
    async loadRecentlyUpdated(count: number = 5) {
      const now = Date.now()
      if (this.recentlyUpdatedLastFetch && (now - this.recentlyUpdatedLastFetch < CACHE_DURATION) && this.recentlyUpdated.length >= count) {
        console.debug('Serving recent reports from store cache')
        return
      }

      const reports = await fetchRecentReports(count, 'updated')
      this.recentlyUpdated = reports
      this.recentlyUpdatedLastFetch = now
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
