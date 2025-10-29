import logger from '../logger'
import { redisCacheExtData, redisLookupExtData } from '../redis'
import { SDHQReview } from '../../../shared/src/game'

const RSS_PROXY_REDIS_PREFIX = 'rss_proxy_feed'
const RSS_PROXY_CACHE_TTL_SECONDS = 60 * 60 * 6 // 6 hours

const ALLOWED_RSS_HOSTS = new Set([
  'steamdeckhq.com',
  'www.steamdeckhq.com',
  'isthereanydeal.com',
  'www.isthereanydeal.com',
])

interface CachedRssPayload {
  content: string
  contentType: string | null
  fetchedAt: number
}

const RSS_REDIS_PREFIX = 'rss_feed'

/**
 * Caches an object of RSS Feed in Redis.
 * The cached data is stored for 2 days to improve search performance and reduce API calls.
 */
const redisCacheRSSFeed = async (
  payload: CachedRssPayload,
  key: string,
): Promise<void> => {
  if (!payload) {
    throw new Error('Data is required for caching RSS feed.')
  }
  if (!key) {
    throw new Error('A key is required to cache RSS feed.')
  }
  const redisKey = `${RSS_REDIS_PREFIX}:${key}`
  try {
    const cacheData = JSON.stringify(payload)
    await redisCacheExtData(cacheData, redisKey, RSS_PROXY_CACHE_TTL_SECONDS)
    logger.info(`Cached RSS feed for ${RSS_PROXY_CACHE_TTL_SECONDS} seconds with key ${redisKey}`)
  } catch (error) {
    logger.error(`Redis error while caching RSS feed for key "${redisKey}":`, error)
  }
}

/**
 * Retrieves a cached object of RSS Feed for a given key.
 */
const redisLookupRSSFeed = async (key: string): Promise<CachedRssPayload | null> => {
  if (!key) {
    throw new Error('A key is required to lookup RSS feed.')
  }
  const redisKey = `${RSS_REDIS_PREFIX}:${key}`
  try {
    const cachedData = await redisLookupExtData(redisKey)
    if (cachedData) {
      logger.info(`Retrieved RSS feed for "${key}" from Redis cache`)
      return JSON.parse(cachedData) as CachedRssPayload
    }
  } catch (error) {
    logger.error('Redis error while fetching cached RSS feed:', error)
  }
  return null
}

export class RssProxyError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'RssProxyError'
    this.statusCode = statusCode
  }
}

const decodeFeedUrl = (encodedUrl: string): string => {
  try {
    const decoded = Buffer.from(encodedUrl, 'base64').toString('utf-8').trim()
    if (!decoded) {
      throw new Error('Decoded URL is empty')
    }
    return decoded
  } catch (error) {
    logger.warn('Failed to decode base64 feed URL', error)
    throw new RssProxyError('invalid_feed', 400)
  }
}

const validateAllowedHost = (url: URL): void => {
  const hostname = url.hostname.toLowerCase()
  if (!ALLOWED_RSS_HOSTS.has(hostname)) {
    logger.warn(`Attempted access to disallowed host "${hostname}"`, {
      hostname,
      url: url.toString(),
    })
    throw new RssProxyError('feed_host_not_allowed', 403)
  }
}

export interface RssProxyResult extends CachedRssPayload {
  fromCache: boolean
}

export const fetchProxiedRssFeed = async (encodedFeedUrl: string | undefined): Promise<RssProxyResult> => {
  if (!encodedFeedUrl) {
    throw new RssProxyError('missing_feed', 400)
  }

  const decodedUrl = decodeFeedUrl(encodedFeedUrl)

  let feedUrl: URL
  try {
    feedUrl = new URL(decodedUrl)
  } catch (error) {
    logger.warn('Invalid feed URL after decoding', { decodedUrl })
    throw new RssProxyError('invalid_feed_url', 400)
  }

  validateAllowedHost(feedUrl)

  const cacheKey = encodedFeedUrl.toString()
  const cached = await redisLookupRSSFeed(cacheKey)
  if (cached) {
    return { ...cached, fromCache: true }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20000) // 20s timeout

  try {
    const response = await fetch(feedUrl.toString(), {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
      signal: controller.signal,
    })

    const content = await response.text()
    logger.info('RSS proxy response', {
      url: feedUrl.toString(),
      status: response.status,
      statusText: response.statusText,
      content,
    })

    if (!response.ok) {
      logger.warn('Upstream RSS feed returned non-OK status', {
        url: feedUrl.toString(),
        status: response.status,
      })
      const status = response.status >= 400 && response.status < 500 ? response.status : 502
      throw new RssProxyError('upstream_feed_error', status)
    }

    const contentType = response.headers.get('content-type')
    const payload: CachedRssPayload = {
      content,
      contentType,
      fetchedAt: Date.now(),
    }

    await redisCacheRSSFeed(payload, cacheKey)

    return {
      ...payload,
      fromCache: false,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      logger.error('Failed to fetch RSS feed due to timeout', { url: feedUrl.toString() })
      throw new RssProxyError('failed_to_fetch_feed_timeout', 504) // 504 Gateway Timeout
    }

    if (error instanceof RssProxyError) {
      throw error
    }
    logger.error('Failed to fetch RSS feed', {
      url: feedUrl.toString(),
      error,
      errorMessage: error instanceof Error ? error.message : 'unknown',
      errorStack: error instanceof Error ? error.stack : 'unknown',
      errorCause: error instanceof Error && 'cause' in error ? error.cause : 'unknown',
    })
    throw new RssProxyError('failed_to_fetch_feed', 502)
  } finally {
    clearTimeout(timeoutId)
  }
}
