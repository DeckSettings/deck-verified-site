import { defineStore } from 'pinia'
import { fetchHomepageContributors, fetchHomepageRecentGames } from 'src/utils/api'
import type { ContributorSummary, HomepageRecentGame } from 'src/utils/api'

const CACHE_DURATION = 60 * 1000

export const useHomepageStore = defineStore('homepage', {
  state: () => ({
    topContributors: [] as ContributorSummary[],
    newContributors: [] as ContributorSummary[],
    recentGames: [] as HomepageRecentGame[],
    contributorsLastFetch: null as number | null,
    recentGamesLastFetch: null as number | null,
  }),
  actions: {
    async loadContributors(topLimit: number = 4, newLimit: number = 4, force = false) {
      const now = Date.now()
      if (
        !force &&
        this.contributorsLastFetch &&
        (now - this.contributorsLastFetch < CACHE_DURATION) &&
        this.topContributors.length >= Math.min(topLimit, 1) &&
        this.newContributors.length >= Math.min(newLimit, 1)
      ) {
        return
      }

      const response = await fetchHomepageContributors(topLimit, newLimit)
      this.topContributors = response?.topContributors || []
      this.newContributors = response?.newContributors || []
      this.contributorsLastFetch = now
    },
    async loadRecentGames(limit: number = 6, force = false) {
      const now = Date.now()
      if (
        !force &&
        this.recentGamesLastFetch &&
        (now - this.recentGamesLastFetch < CACHE_DURATION) &&
        this.recentGames.length >= limit
      ) {
        return
      }

      this.recentGames = await fetchHomepageRecentGames(limit)
      this.recentGamesLastFetch = now
    },
  },
})
