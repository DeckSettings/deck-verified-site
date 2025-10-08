import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { GamePriceSummary, GameRatingsSummary } from '../../../shared/src/game'
import { fetchGamePriceSummary, fetchGameRatingsSummary } from 'src/utils/api'

const CACHE_DURATION_MS = 60 * 60 * 1000

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface MarketParams {
  appId?: string | null;
  gameName?: string | null;
}

const buildCacheKey = (appId?: string | null, gameName?: string | null): string | null => {
  if (appId) {
    return `app:${appId}`
  }
  if (gameName) {
    return `name:${gameName.trim().toLowerCase()}`
  }
  return null
}

const isEntryValid = (entry: CacheEntry<unknown> | undefined): boolean => {
  return Boolean(entry && entry.expiresAt > Date.now())
}

export const useGameMarketStore = defineStore('gameMarket', () => {
  const priceCache = ref<Record<string, CacheEntry<GamePriceSummary | null>>>({})
  const ratingsCache = ref<Record<string, CacheEntry<GameRatingsSummary | null>>>({})
  const pendingPriceRequests = new Map<string, Promise<GamePriceSummary | null>>()
  const pendingRatingsRequests = new Map<string, Promise<GameRatingsSummary | null>>()

  const cachePriceResult = (key: string, data: GamePriceSummary | null) => {
    priceCache.value[key] = {
      data,
      expiresAt: Date.now() + CACHE_DURATION_MS,
    }
  }

  const cacheRatingsResult = (key: string, data: GameRatingsSummary | null) => {
    ratingsCache.value[key] = {
      data,
      expiresAt: Date.now() + CACHE_DURATION_MS,
    }
  }

  const finalizePriceRequest = (key: string) => {
    pendingPriceRequests.delete(key)
  }

  const finalizeRatingsRequest = (key: string) => {
    pendingRatingsRequests.delete(key)
  }

  const loadPriceSummary = async (params: MarketParams): Promise<GamePriceSummary | null> => {
    const key = buildCacheKey(params.appId, params.gameName)
    if (!key) {
      return null
    }

    const cachedEntry = priceCache.value[key]
    if (isEntryValid(cachedEntry)) {
      return cachedEntry?.data ?? null
    }

    if (pendingPriceRequests.has(key)) {
      return pendingPriceRequests.get(key) ?? null
    }

    const requestPromise = fetchGamePriceSummary(params)
      .then((result) => {
        cachePriceResult(key, result)
        return result
      })
      .catch((error) => {
        console.error('Failed to load price summary:', error)
        return null
      })
      .finally(() => finalizePriceRequest(key))

    pendingPriceRequests.set(key, requestPromise)
    return requestPromise
  }

  const loadRatingsSummary = async (params: MarketParams): Promise<GameRatingsSummary | null> => {
    const key = buildCacheKey(params.appId, params.gameName)
    if (!key) {
      return null
    }

    const cachedEntry = ratingsCache.value[key]
    if (isEntryValid(cachedEntry)) {
      return cachedEntry?.data ?? null
    }

    if (pendingRatingsRequests.has(key)) {
      return pendingRatingsRequests.get(key) ?? null
    }

    const requestPromise = fetchGameRatingsSummary(params)
      .then((result) => {
        cacheRatingsResult(key, result)
        return result
      })
      .catch((error) => {
        console.error('Failed to load ratings summary:', error)
        return null
      })
      .finally(() => finalizeRatingsRequest(key))

    pendingRatingsRequests.set(key, requestPromise)
    return requestPromise
  }

  return {
    loadPriceSummary,
    loadRatingsSummary,
  }
})
