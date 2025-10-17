import { createClient, SchemaFieldTypes } from 'redis'
import type { RedisClientType } from 'redis'
import config from './config'
import logger from './logger'
import {
  GameSearchCache,
  BloggerReportSummary,
} from '../../shared/src/game'
import { isValidNumber } from './helpers'

export interface TaskProgressState {
  taskId: string
  status: string
  icon: string | null
  title: string
  message: string
  progress: number | 'indeterminate' | null
  done: boolean
  variant?: string
  updatedAt: number
  revision: string
}

const EVENT_PROGRESS_TTL_SECONDS = 30 * 60

export const redisConnectionOptions = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword,
}

// Redis client
export const redisClient: RedisClientType = createClient({
  socket: {
    host: redisConnectionOptions.host,
    port: redisConnectionOptions.port,
  },
  password: redisConnectionOptions.password,
})

/**
 * Establishes a connection to the Redis server and ensures the RedisSearch index is created.
 * Logs connection status and any errors encountered.
 *
 * @returns {Promise<void>}
 */
export const connectToRedis = async (): Promise<void> => {
  redisClient.on('connect', () => {
    logger.info('Connected to Redis!')
  })
  redisClient.on('error', (err) => {
    logger.error('Redis connection error:', err)
  })
  try {
    // Connect to redis
    await redisClient.connect()
    // Create redis search index
    await createRedisSearchIndex()
  } catch (err) {
    logger.error('Error connecting to Redis:', err)
    process.exit(1)
  }
}

/**
 * Ensure Redis is connected before performing any Redis operations.
 */
export const ensureRedisConnection = async (): Promise<void> => {
  if (!redisClient.isOpen) {
    await connectToRedis()
  }
}

/**
 * Creates a RedisSearch index for games if it doesn't already exist.
 * This index allows efficient searching of game data stored in Redis.
 * Logs success or failure during index creation.
 */
export const createRedisSearchIndex = async (): Promise<void> => {
  try {
    // Check if the index already exists
    const indexExists = await redisClient.ft.info('games_idx').catch((error) => {
      logger.warn('Index check failed. Assuming index does not exist.', error)
      return null
    })

    if (indexExists) {
      logger.info('RedisSearch index already exists. Skipping creation.')
      return
    }

    logger.info('Creating RedisSearch index...')

    // Create the index with the specified fields
    await redisClient.ft.create(
      'games_idx',
      {
        appsearch: { type: SchemaFieldTypes.TEXT, SORTABLE: true },
        appname: { type: SchemaFieldTypes.TEXT, SORTABLE: true },
        reportcount: { type: SchemaFieldTypes.NUMERIC, SORTABLE: true },
      },
      {
        ON: 'HASH',
        PREFIX: 'game:',
      },
    )

    logger.info('RedisSearch index created successfully.')
  } catch (error) {
    logger.error('Error creating RedisSearch index:', error)
  }
}

/**
 * Escapes strings for safe usage in Redis keys.
 */
export const escapeRedisKey = (input: string): string => {
  // Comment with backslash the characters ,.<>{}[]"':;!@#$%^&*()-+=~ and whitespace
  return input.toString().toLowerCase().trim().replace(/[,.<>{}\[\]"':;!@#$%^&*()\-+=\~\s]/g, '\\$&')
}

/**
 * Try to acquire a short-lived distributed lock in Redis.
 *
 * @param key Base key (will be escaped internally).
 * @param ttlSeconds Expiration time for the lock in seconds. Defaults to 60.
 * @returns true if lock was acquired, false otherwise.
 */
export const acquireRedisLock = async (
  key: string,
  ttlSeconds = 60,
): Promise<boolean> => {
  const lockKey = `lock:${escapeRedisKey(key)}`
  try {
    // Redis v4: set(key, value, { NX: true, EX: seconds })
    const res = await redisClient.set(lockKey, '1', { NX: true, EX: ttlSeconds })
    return res === 'OK'
  } catch (e) {
    logger.warn(`Failed to acquire lock for ${key}:`, e)
    return false
  }
}

/**
 * Caches a generic object in Redis against a given cache key.
 */
export const redisCacheExtData = async (
  data: string,
  key: string,
  cacheTime: number,
): Promise<void> => {
  if (data === undefined || data === null) {
    throw new Error('The data key is required for caching the ext data.')
  }
  if (!key) {
    throw new Error('A key is required to cache the ext data.')
  }
  if (!cacheTime) {
    throw new Error('A cache time is required to cache the ext data.')
  }
  const redisKey = `ext_data:${escapeRedisKey(key)}`
  await ensureRedisConnection()
  await redisClient.set(redisKey, data, { EX: cacheTime })
}

/**
 * Retrieves a generic cached object for a given cache key.
 */
export const redisLookupExtData = async (key: string): Promise<string | null> => {
  if (!key) {
    throw new Error('A key is required to lookup the ext data.')
  }
  const redisKey = `ext_data:${escapeRedisKey(key)}`
  await ensureRedisConnection()
  const cachedData = await redisClient.get(redisKey)
  if (cachedData) {
    return cachedData
  }
  return null
}

export const setTaskProgress = async (
  userId: string,
  taskId: string,
  data: Omit<TaskProgressState, 'taskId' | 'updatedAt' | 'revision'>,
): Promise<TaskProgressState> => {
  await ensureRedisConnection()
  const updatedAt = Date.now()
  const revision = updatedAt.toString()
  const payload: TaskProgressState = {
    taskId,
    updatedAt,
    revision,
    ...data,
  }
  const key = `dv:${userId}:taskprogress:${taskId}`
  try {
    await redisClient.set(key, JSON.stringify(payload), { EX: EVENT_PROGRESS_TTL_SECONDS })
  } catch (error) {
    logger.error('Failed to set task progress', error)
  }
  return payload
}

export const getTaskProgress = async (
  userId: string,
  taskId: string,
): Promise<TaskProgressState | null> => {
  await ensureRedisConnection()
  const key = `dv:${userId}:taskprogress:${taskId}`
  try {
    const raw = await redisClient.get(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TaskProgressState
    return parsed
  } catch (error) {
    logger.error('Failed to get task progress', error)
    return null
  }
}


/**
 * Stores game data in Redis as a hash entry.
 * The game is indexed by either AppID or game name.
 * NOTE:  Special characters in the search string are escaped. Without this,
 *        we are unable to search on these special characters.
 */
export const storeGameInRedis = async (options: {
  gameName: string
  appId?: string | null
  banner?: string | null
  poster?: string | null
  reportCount?: number | null
}): Promise<void> => {
  const { gameName, appId = null, banner = null, poster = null, reportCount = null } = options
  if (!gameName) {
    throw new Error('Game name is required.')
  }

  // Ensure that the provided App ID is valid
  const validAppId = !!(appId && appId.trim() !== '' && isValidNumber(Number(appId)))

  // NOTE: The gameId is stored as a url encoded lowercase string if the game name is all that is available.
  const gameId = validAppId ? `game:${appId}` : `game:${encodeURIComponent(gameName.toLowerCase())}`
  const searchString = validAppId ? `${appId}_${gameName}` : `0_${gameName}`

  try {
    const existingData = await redisClient.hGetAll(gameId)

    // Ensure reportCount is a valid number
    const existingReportCount = existingData.reportcount ? parseInt(existingData.reportcount, 10) : 0
    const validReportCount = isNaN(existingReportCount) ? 0 : existingReportCount
    const newReportCount = reportCount !== null ? reportCount : validReportCount

    const updatedData = {
      appsearch: escapeRedisKey(searchString),
      appname: gameName,
      appid: appId ?? existingData.appid ?? '',
      appbanner: banner ?? existingData.appbanner ?? '',
      appposter: poster ?? existingData.appposter ?? '',
      reportcount: newReportCount.toString(), // Always store as a string for Redis
    }

    await redisClient.hSet(gameId, updatedData)
    await redisClient.expire(gameId, (60 * 60 * 24 * 7)) // Cache search results in Redis for 1 week
    logger.info(`Stored game: ${gameName} (appid: ${appId ?? 'null'}, banner: ${banner ?? 'null'}, reports: ${newReportCount})`)
  } catch (error) {
    logger.error('Failed to store game in Redis:', error)
  }
}

/**
 * Searches for games in Redis based on the provided search term.
 * Uses RedisSearch to match the term against indexed game data.
 */
export const searchGamesInRedis = async (
  searchTerm: string | null = null,
  appId: string | null = null,
  gameName: string | null = null,
  from: number | null = null,
  limit: number | null = null,
): Promise<GameSearchCache[]> => {
  if (!searchTerm && !appId && !gameName) {
    throw new Error('Search term is required.')
  }
  if (Array.isArray(searchTerm)) {
    throw new Error('Search term cannot be an array.')
  }
  if (searchTerm && searchTerm.length > 100) {
    throw new Error('Search term too long.')
  }
  if (searchTerm && /\*{3,}/.test(searchTerm)) {
    throw new Error('Too many wildcards in search term.')
  }

  try {
    let query = ''
    if (searchTerm) {
      logger.info(`Searching cached games list for term '${searchTerm}'`)
      query = `@appsearch:*${escapeRedisKey(searchTerm)}*`
    } else if (appId) {
      logger.info(`Searching cached games list by AppID '${appId}'`)
      query = `@appsearch:${escapeRedisKey(appId)}_*`
    } else if (gameName) {
      logger.info(`Searching cached games list by game name '${gameName}'`)
      query = `@appsearch:*_${escapeRedisKey(gameName)}`
    }

    // Validate and default `from` and `limit` parameters
    const validatedFrom = typeof from === 'number' && from >= 0 ? from : 0
    const validatedLimit = typeof limit === 'number' && limit > 0 ? limit : 100

    const results = await redisClient.ft.search(
      'games_idx',
      query,
      {
        LIMIT: { from: validatedFrom, size: validatedLimit },
      },
    )

    if (results.total === 0) {
      logger.info('No games found.')
      return []
    }

    return results.documents.map((doc): GameSearchCache => ({
      name: typeof doc.value.appname === 'string' ? doc.value.appname : '',
      appId: typeof doc.value.appid === 'string' && doc.value.appid !== '' ? doc.value.appid : null,
      banner: typeof doc.value.appbanner === 'string' && doc.value.appbanner !== '' ? doc.value.appbanner : null,
      poster: typeof doc.value.appposter === 'string' && doc.value.appposter !== '' ? doc.value.appposter : null,
      reportCount: doc.value.reportcount && doc.value.reportcount !== '' ? Number(doc.value.reportcount) : null,
    }))
  } catch (error) {
    logger.error('Error during search:', error)
    return []
  }
}

/**
 * Retrieves all games stored in Redis with a reportcount greater than 0,
 * ordered by the most reports first.
 */
export const getGamesWithReports = async (
  from: number = 0,
  limit: number = 100,
  orderBy: 'appname' | 'reportcount' = 'reportcount',
  direction: 'ASC' | 'DESC' = 'DESC',
): Promise<GameSearchCache[]> => {
  try {
    // Validate and sanitize limit
    const sanitizedLimit = Math.min(Math.max(limit, 1), 500) // Ensures 1 <= limit <= 500

    // Set SORTBY field based on orderBy parameter
    const sortByField = orderBy === 'appname' ? 'appname' : 'reportcount'

    const results = await redisClient.ft.search(
      'games_idx',
      '@reportcount:[1 +inf]',
      {
        SORTBY: { BY: sortByField, DIRECTION: direction },
        LIMIT: { from, size: sanitizedLimit },
      },
    )

    if (results.total === 0) {
      logger.info('No games with reports found.')
      return []
    }

    return results.documents.map((doc): GameSearchCache => ({
      name: typeof doc.value.appname === 'string' ? doc.value.appname : '',
      appId: typeof doc.value.appid === 'string' && doc.value.appid !== '' ? doc.value.appid : null,
      banner: typeof doc.value.appbanner === 'string' && doc.value.appbanner !== '' ? doc.value.appbanner : null,
      poster: typeof doc.value.appposter === 'string' && doc.value.appposter !== '' ? doc.value.appposter : null,
      reportCount: doc.value.reportcount && doc.value.reportcount !== '' ? Number(doc.value.reportcount) : null,
    }))
  } catch (error) {
    logger.error('Error retrieving games with reports:', error)
    return []
  }
}

/**
 * Logs an aggregated metric into a daily sorted set.
 */
export const logAggregatedMetric = async (
  metricName: string,
  metricValue: string,
): Promise<void> => {
  // Use today's date in YYYY-MM-DD format to separate daily logs
  const today = new Date().toISOString().split('T')[0]
  const key = `metric_aggregate:${metricName}:${today}`

  try {
    // Increment the score for this metricValue in today's sorted set
    await redisClient.zIncrBy(key, 1, metricValue)
    // Set a TTL of 7 days so that these keys expire automatically
    await redisClient.expire(key, 7 * 24 * 60 * 60)
  } catch (error) {
    logger.error('Error logging aggregated metric:', error)
  }
}

/**
 * Retrieves aggregated metric counts for the past X days (up to 7).
 */
export const getAggregatedMetrics = async (
  metricName: string,
  days: number = 7,
  limit: number = 100,
): Promise<{ metricValue: string; count: number }[]> => {
  // Limit the days to 7 maximum
  days = Math.min(days, 7)

  // Build a list of daily keys
  const keys: string[] = []
  for (let i = 0; i < days; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const day = date.toISOString().split('T')[0]
    keys.push(`metric_aggregate:${metricName}:${day}`)
  }

  // Temporary key for aggregating the results
  const tempKey = `metric_aggregate:${metricName}:temp:${Date.now()}:${Math.random().toString(36).substring(2, 10)}`

  try {
    // Combine the sorted sets, summing their scores.
    await redisClient.zUnionStore(tempKey, keys, { AGGREGATE: 'SUM' })

    // Retrieve the top 'limit' metric values sorted by their aggregated score using zRangeWithScores with REV option.
    const results = await redisClient.zRangeWithScores(tempKey, 0, limit - 1, { REV: true })

    // Clean up the temporary key
    await redisClient.del(tempKey)

    // Format the results into an array of objects.
    // `results` is now an array of objects like { value: '...', score: '...' }
    const aggregated = results.map((item: { value: string; score: number | string }) => ({
      metricValue: item.value,
      count: Number(item.score),
    }))

    return aggregated
  } catch (error) {
    logger.error('Error aggregating metrics:', error)
    return []
  }
}


/**
 * Persists arbitrary IsThereAnyDeal payloads in Redis under a namespaced key for a configurable TTL.
 */
export const redisCacheIsThereAnyDealResponse = async (
  data: unknown,
  key: string,
  cacheTime: number = 60 * 60 * 6,
): Promise<void> => {
  if (!key) {
    throw new Error('A lookup key is required to cache IsThereAnyDeal data.')
  }

  const redisKey = `itad:${escapeRedisKey(key)}`
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached IsThereAnyDeal response for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Retrieves a cached IsThereAnyDeal payload by lookup key, returning null when the entry is missing or on errors.
 */
export const redisLookupIsThereAnyDealResponse = async (key: string): Promise<unknown | null> => {
  if (!key) {
    throw new Error('A lookup key is required to lookup IsThereAnyDeal data.')
  }

  const redisKey = `itad:${escapeRedisKey(key)}`
  try {
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved IsThereAnyDeal response for "${key}" from Redis cache`)
      return JSON.parse(cachedData)
    }
  } catch (error) {
    logger.error('Redis error while fetching cached IsThereAnyDeal response:', error)
  }
  return null
}

/**
 * Stores a ProtonDB summary snapshot for a Steam app ID in Redis with a default 24 hour expiration.
 */
export const redisCacheProtonDbSummary = async (
  data: unknown,
  appId: string,
  cacheTime: number = 60 * 60 * 24,
): Promise<void> => {
  if (!appId) {
    throw new Error('An AppID is required to cache ProtonDB summary.')
  }

  const redisKey = `protondb_summary:${escapeRedisKey(appId)}`
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached ProtonDB summary for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Fetches a cached ProtonDB summary for the supplied app ID, returning null if no cache entry exists.
 */
export const redisLookupProtonDbSummary = async (appId: string): Promise<unknown | null> => {
  if (!appId) {
    throw new Error('An AppID is required to lookup ProtonDB summary.')
  }

  const redisKey = `protondb_summary:${escapeRedisKey(appId)}`
  try {
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved ProtonDB summary for "${appId}" from Redis cache`)
      return JSON.parse(cachedData)
    }
  } catch (error) {
    logger.error('Redis error while fetching cached ProtonDB summary:', error)
  }
  return null
}

/**
 * Caches an object of the reports summary blog in Redis.
 * The cached data is stored for 6 months to improve API performance and reduce API calls.
 */
export const redisCacheReportsSummaryBlog = async (
  data: BloggerReportSummary,
  key: string,
  cacheTime: number = 60 * 60 * 24 * 182, // Default to 6 months
): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching the reports summary blog.')
  }
  if (!key) {
    throw new Error('An key is required to cache the reports summary blog.')
  }

  const redisKey = `reports_summary_blog:${escapeRedisKey(key)}`
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached the reports summary blog for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Retrieves a cached object of the reports summary blog for a given App ID.
 */
export const redisLookupReportsSummaryBlog = async (key: string): Promise<BloggerReportSummary | null> => {
  if (!key) {
    throw new Error('An key is required to lookup the reports summary blog.')
  }

  const redisKey = `reports_summary_blog:${escapeRedisKey(key)}`
  try {
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved the reports summary blog for "${key}" from Redis cache`)
      return JSON.parse(cachedData) as BloggerReportSummary
    }
  } catch (error) {
    logger.error('Redis error while fetching cached the reports summary blog:', error)
  }
  return null
}
