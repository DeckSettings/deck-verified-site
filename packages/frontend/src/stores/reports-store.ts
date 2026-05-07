import { defineStore } from 'pinia'
import {
  fetchPopularReports,
  fetchRecentReports,
  fetchTopGameDetailsRequestMetrics,
} from 'src/utils/api'
import type { HomeReport } from 'src/utils/api'
import type { GameDetailsRequestMetricResult } from '../../../shared/src/game'

const CACHE_DURATION = 60 * 1000 // 1 minute
const buildDevicesCacheKey = (devices: string[] = []) =>
  Array.from(new Set(
    devices
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  )).sort((a, b) => a.localeCompare(b)).join('|')

export const useReportsStore = defineStore('reports', {
  state: () => ({
    popular: [] as HomeReport[],
    popularLastFetch: null as number | null,
    popularCacheKey: '' as string,
    recentlyCreated: [] as HomeReport[],
    recentlyCreatedLastFetch: null as number | null,
    recentlyCreatedCacheKey: '' as string,
    recentlyUpdated: [] as HomeReport[],
    recentlyUpdatedLastFetch: null as number | null,
    recentlyUpdatedCacheKey: '' as string,
    views: [] as GameDetailsRequestMetricResult[],
  }),
  actions: {
    async loadPopular(count: number = 5, devices: string[] = []) {
      const now = Date.now()
      const cacheKey = `count:${count}:devices:${buildDevicesCacheKey(devices)}`
      if (
        this.popularLastFetch &&
        this.popularCacheKey === cacheKey &&
        (now - this.popularLastFetch < CACHE_DURATION) &&
        this.popular.length >= count
      ) {
        console.debug('Serving popular reports from store cache')
        return
      }

      const reports = await fetchPopularReports(count, devices)
      this.popular = reports
      this.popularLastFetch = now
      this.popularCacheKey = cacheKey
    },
    async loadRecentlyCreated(count: number = 5, devices: string[] = []) {
      const now = Date.now()
      const cacheKey = `count:${count}:devices:${buildDevicesCacheKey(devices)}`
      if (
        this.recentlyCreatedLastFetch &&
        this.recentlyCreatedCacheKey === cacheKey &&
        (now - this.recentlyCreatedLastFetch < CACHE_DURATION) &&
        this.recentlyCreated.length >= count
      ) {
        console.debug('Serving recent reports from store cache')
        return
      }

      const reports = await fetchRecentReports(count, 'created', devices)
      this.recentlyCreated = reports
      this.recentlyCreatedLastFetch = now
      this.recentlyCreatedCacheKey = cacheKey
    },
    async loadRecentlyUpdated(count: number = 5, devices: string[] = []) {
      const now = Date.now()
      const cacheKey = `count:${count}:devices:${buildDevicesCacheKey(devices)}`
      if (
        this.recentlyUpdatedLastFetch &&
        this.recentlyUpdatedCacheKey === cacheKey &&
        (now - this.recentlyUpdatedLastFetch < CACHE_DURATION) &&
        this.recentlyUpdated.length >= count
      ) {
        console.debug('Serving recent reports from store cache')
        return
      }

      const reports = await fetchRecentReports(count, 'updated', devices)
      this.recentlyUpdated = reports
      this.recentlyUpdatedLastFetch = now
      this.recentlyUpdatedCacheKey = cacheKey
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
