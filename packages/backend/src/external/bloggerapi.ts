import logger from '../logger'
import config from '../config'
import {
  redisLookupReportsSummaryBlog,
  redisCacheReportsSummaryBlog,
  acquireRedisLock,
} from '../redis'
import type { BloggerReportSummary, GameDetails } from '../../../shared/src/game'

/**
 * Fetches Blog summary of reviews
 * - On cache hit: returns string immediately.
 * - On cache miss: returns null immediately, then warms cache in background (deduped by a short Redis lock).
 */
export const fetchBlogReviewSummary = async (gameDetails: Partial<GameDetails>): Promise<string | null> => {
  // Generate a cache key. Prefer App ID if available.
  const baseKey = gameDetails.appId
    ? String(gameDetails.appId)
    : String(gameDetails.gameName || '')

  if (!baseKey) {
    logger.warn('fetchBlogReviewSummary called without appId or gameName.')
    return null
  }

  // Create a content hash to refresh when data changes (reports/external_reviews length or latest updated_at)
  const hashBasis = {
    appId: gameDetails.appId ?? null,
    reportsLen: gameDetails.reports?.length ?? 0,
    extLen: gameDetails.external_reviews?.length ?? 0,
    latestReportUpdatedAt: gameDetails.reports
      ?.map((r: any) => r.updated_at)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] ?? null,
  }
  // Tiny, deterministic hash
  const hash = (() => {
    try {
      const str = JSON.stringify(hashBasis, Object.keys(hashBasis).sort())
      let h = 0
      for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
      return (h >>> 0).toString(16)
    } catch {
      return 'na'
    }
  })()

  // Fetch cache data
  const key = `${baseKey} - ${hash}`
  const cachedData = await redisLookupReportsSummaryBlog(key)
  if (cachedData) {
    return cachedData.reports_summary
  }

  // Ensure we have configured a blogger API key
  if (!config.bloggerApiKey) {
    logger.error('BLOGGER_API_KEY is not set; skipping blogger summary call.')
    return null
  }

  // Acquire short lock to dedupe background work
  const gotLock = await acquireRedisLock(`reports_summary_blog:${key}`, 60)
  if (gotLock) {
    // Fire-and-forget background fetch. Avoid unhandled rejection noise.
    ;(async () => {
      try {
        logger.info(`(BG TASK) Fetching Reports Summary Blog for ${key} from DeckVerified blogger API...`)
        const response: Response = await fetch('https://blogger.deckverified.games', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': config.bloggerApiKey!,
          },
          body: JSON.stringify(gameDetails),
        })

        // Check if response is ok (status 200)
        if (!response.ok) {
          const errorBody = await response.text()
          logger.error(`(BG TASK) Blogger worker responded ${response.status}: ${errorBody}`)
          await redisCacheReportsSummaryBlog({ reports_summary: null }, key, 86400) // Cache error response for 1 day
          return
        }

        const responseData: BloggerReportSummary = await response.json()
        // IMPORTANT: treat explicit null as a valid result and cache it for max TTL
        if (responseData.reports_summary === null) {
          await redisCacheReportsSummaryBlog({ reports_summary: null }, key)
          logger.info(`(BG TASK) Cached blogger summary (null) for ${key}.`)
          return
        }

        const reportsSummary = responseData.reports_summary?.trim() ?? ''
        if (!reportsSummary) {
          // Empty string is unexpected -> treat as error/negative for 1 day
          logger.warn('(BG TASK) Blogger worker returned empty summary string.')
          await redisCacheReportsSummaryBlog({ reports_summary: null }, key, 86400) // Cache error response for 1 day
          return
        }

        // Returned a summary. Cache for full length
        await redisCacheReportsSummaryBlog({ reports_summary: reportsSummary }, key)
        logger.info(`(BG TASK) Cached blogger summary for ${key}.`)
      } catch (error) {
        logger.error(`(BG TASK) Failed to fetch Reports Summary Blog for ${key}:`, error)
        await redisCacheReportsSummaryBlog({ reports_summary: null }, key, 86400) // Cache error response for 1 day
      }
    })().catch(async () => {
      // Background task itself rejected: negative cache 1 day
      await redisCacheReportsSummaryBlog({ reports_summary: null }, key, 86400) // Cache error response for 1 day
    })
  }

  // Return immediately on miss. The next request will likely hit the cache.
  return null
}
