import {
  acquireRedisLock,
  redisCacheExtData,
  redisLookupExtData,
} from '../redis'
import logger from '../logger'

const FX_RATES_REDIS_KEY = 'fxrates:latest'
const FX_RATES_LOCK_KEY = 'fxrates:lock'
const DEFAULT_CACHE_SECONDS = 60 * 60 * 24 // 24 hours

export interface FxRatesResponse {
  base?: string
  date?: string
  rates?: Record<string, number>

  [k: string]: unknown
}

/**
 * Cache fxrates JSON in Redis.
 */
const redisCacheFxRates = async (data: FxRatesResponse, cacheTime: number = DEFAULT_CACHE_SECONDS): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching fx rates.')
  }
  const redisKey = FX_RATES_REDIS_KEY
  try {
    await redisCacheExtData(JSON.stringify(data), redisKey, cacheTime)
    logger.info(`Cached FX rates for ${cacheTime} seconds with key ${redisKey}`)
  } catch (error) {
    logger.error(`Redis error while caching FX rates for key "${redisKey}":`, error)
  }
}

/**
 * Lookup cached fxrates JSON from Redis.
 */
const redisLookupFxRates = async (): Promise<FxRatesResponse | null> => {
  const redisKey = FX_RATES_REDIS_KEY
  try {
    const cachedData = await redisLookupExtData(redisKey)
    if (cachedData) {
      logger.info('Retrieved FX rates from Redis cache')
      return JSON.parse(cachedData) as FxRatesResponse
    }
  } catch (error) {
    logger.error('Redis error while fetching cached FX rates:', error)
  }
  return null
}

/**
 * Fetches latest FX rates from the external API with Redis caching.
 *
 * Returns the parsed JSON (or null on failure). Uses a short lock to avoid
 * spamming the external API when the cache is cold; background fetch will
 * populate the cache for later requests.
 */
export const fetchFxRates = async (forceRefresh: boolean = false): Promise<FxRatesResponse | null> => {
  if (!forceRefresh) {
    const cached = await redisLookupFxRates()
    if (cached) {
      return cached
    }
  }

  // Acquire short lock to dedupe background work
  const gotLock = await acquireRedisLock(FX_RATES_LOCK_KEY, 120)
  if (gotLock) {
    ;(async () => {
      try {
        const url = 'https://api.fxratesapi.com/latest'
        logger.info('(BG TASK) Fetching latest FX rates from fxratesapi...')
        const response = await fetch(url)

        if (!response.ok) {
          const errorBody = await response.text()
          logger.error(`(BG TASK) FX rates request failed with status ${response.status}: ${errorBody}`)
          // Cache a negative/empty result for 1 hour to avoid repeated failures
          await redisCacheFxRates({}, 60 * 60)
          return
        }

        const apiResp = await response.json()
        let normalized: FxRatesResponse | null = null
        if (apiResp && typeof apiResp === 'object') {
          // Prefer responses where success === true and a non-empty rates object exists.
          if ((apiResp.success === true || apiResp.success === undefined) && apiResp.rates && typeof apiResp.rates === 'object' && Object.keys(apiResp.rates).length > 0) {
            normalized = {
              base: typeof apiResp.base === 'string' ? apiResp.base : 'USD',
              date: typeof apiResp.date === 'string' ? apiResp.date : undefined,
              rates: apiResp.rates as Record<string, number>,
            }
          } else if (apiResp.rates && typeof apiResp.rates === 'object' && Object.keys(apiResp.rates).length > 0) {
            // Some responses might omit `success` but still include rates.
            normalized = {
              base: typeof apiResp.base === 'string' ? apiResp.base : 'USD',
              date: typeof apiResp.date === 'string' ? apiResp.date : undefined,
              rates: apiResp.rates as Record<string, number>,
            }
          }
        }

        if (normalized && normalized.rates && Object.keys(normalized.rates).length > 0) {
          // Cache results for normal TTL
          await redisCacheFxRates(normalized, DEFAULT_CACHE_SECONDS)
          logger.info('(BG TASK) Cached FX rates.')
        } else {
          logger.warn('(BG TASK) FX rates API returned unexpected data shape or empty rates.')
          await redisCacheFxRates({}, 60 * 60)
        }
      } catch (error) {
        logger.error('(BG TASK) Failed to fetch FX rates:', error)
        try {
          await redisCacheFxRates({}, 60 * 60)
        } catch (e) {
          logger.error('Failed to cache negative FX rates result:', e)
        }
      }
    })().catch(async (err) => {
      logger.error('(BG TASK) FX rates background task rejected:', err)
      try {
        await redisCacheFxRates({}, 60 * 60)
      } catch (e) {
        logger.error('Failed to cache negative FX rates after rejection:', e)
      }
    })
  }

  return null
}
