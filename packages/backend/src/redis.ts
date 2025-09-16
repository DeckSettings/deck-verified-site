import { createClient, SchemaFieldTypes } from 'redis'
import type { RedisClientType } from 'redis'
import config from './config'
import logger from './logger'
import {
  GameReport,
  GameSearchCache,
  GitHubIssueLabel,
  GitHubReportIssueBodySchema,
  GitHubProjectGameDetails,
  GitHubIssueTemplate,
  SteamStoreAppDetails,
  SteamGame, HardwareInfo,
  SDHQReview,
  SDGVideoReview,
  BloggerReportSummary,
} from '../../shared/src/game'
import { isValidNumber } from './helpers'

// Redis client
export const redisClient: RedisClientType = createClient({
  socket: {
    host: config.redisHost,
    port: config.redisPort,
  },
  password: config.redisPassword,
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
 * Stores game data in Redis as a hash entry.
 * The game is indexed by either AppID or game name.
 * NOTE:  Special characters in the search string are escaped. Without this,
 *        we are unable to search on these special characters.
 */
export const storeGameInRedis = async (options: {
  gameName: string;
  appId?: string | null;
  banner?: string | null;
  poster?: string | null;
  reportCount?: number | null;
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
 * Caches recent game reports from GitHub in Redis.
 */
export const redisCacheRecentGameReports = async (data: GameReport[]): Promise<void> => {
  if (!data || !Array.isArray(data)) {
    throw new Error('Data is required for caching GitHub recent game reports.')
  }
  const redisKey = 'github_game_reports_recent'
  const cacheTime = config.defaultCacheTime
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub recent game reports for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Looks up recent game reports cached in Redis.
 *
 * @returns {Promise<GameReport[] | null>} - Returns cached data or null if no cache exists.
 */
export const redisLookupRecentGameReports = async (): Promise<GameReport[] | null> => {
  const redisKey = 'github_game_reports_recent'
  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info('Retrieved GitHub recent game reports from Redis cache')
      return JSON.parse(cachedData) as GameReport[]
    }
  } catch (error) {
    logger.error('Redis error while fetching cached recent game reports:', error)
  }
  return null
}

/**
 * Caches popular game reports from GitHub in Redis.
 */
export const redisCachePopularGameReports = async (data: GameReport[]): Promise<void> => {
  if (!data || !Array.isArray(data)) {
    throw new Error('Data is required for caching GitHub popular game reports.')
  }
  const redisKey = 'github_game_reports_popular'
  const cacheTime = config.defaultCacheTime
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub popular game reports for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Looks up popular game reports cached in Redis.
 */
export const redisLookupPopularGameReports = async (): Promise<GameReport[] | null> => {
  const redisKey = 'github_game_reports_popular'
  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info('Retrieved GitHub popular game reports from Redis cache')
      return JSON.parse(cachedData) as GameReport[]
    }
  } catch (error) {
    logger.error('Redis error while fetching cached popular game reports:', error)
  }
  return null
}

/**
 * Caches author game reports from GitHub in Redis.
 * This data is cached for one day.
 */
export const redisCacheAuthorGameReportCount = async (count: number, author: string): Promise<void> => {
  if (!count) {
    throw new Error('A number is required for caching GitHub author game report count.')
  }
  const redisKey = `github_game_reports_author:${author}`
  const cacheTime = 60 * 60 * 24 // Cache results in Redis for 1 day
  await redisClient.set(redisKey, Number(count), { EX: cacheTime })
  logger.info(`Cached GitHub author game reports for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Looks up author game reports cached in Redis.
 */
export const redisLookupAuthorGameReportCount = async (author: string): Promise<number | null> => {
  const redisKey = `github_game_reports_author:${author}`
  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info('Retrieved GitHub author game reports from Redis cache')
      return Number(cachedData)
    }
  } catch (error) {
    logger.error('Redis error while fetching cached author game reports:', error)
  }
  return null
}

/**
 * Caches the list of issue labels from GitHub in Redis.
 */
export const redisCacheGitHubIssueLabels = async (data: GitHubIssueLabel[]): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching GitHub issue labels.')
  }
  const redisKey = 'github_issue_labels'
  const cacheTime = config.defaultCacheTime

  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub issue labels for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Looks up the list of issue labels cached in Redis.
 */
export const redisLookupGitHubIssueLabels = async (): Promise<GitHubIssueLabel[] | null> => {
  const redisKey = 'github_issue_labels'
  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved GitHub issue labels from Redis cache`)
      return JSON.parse(cachedData) as GitHubIssueLabel[]
    }
  } catch (error) {
    logger.error('Redis error while fetching cached GitHub issue labels:', error)
  }
  return null
}

/**
 * Caches the game report body schema from the GitHub repo in Redis.
 */
export const redisCacheReportBodySchema = async (data: GitHubReportIssueBodySchema): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching GitHub report body schema.')
  }
  const redisKey = 'github_game_reports_body_schema'
  const cacheTime = config.defaultCacheTime

  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub report body schema for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Looks up the game report body schema cached in Redis.
 */
export const redisLookupReportBodySchema = async (): Promise<GitHubReportIssueBodySchema | null> => {
  const redisKey = 'github_game_reports_body_schema'
  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved GitHub report body schema from Redis cache`)
      return JSON.parse(cachedData)
    }
  } catch (error) {
    logger.error('Redis error while fetching cached GitHub report body schema:', error)
  }
  return null
}

/**
 * Caches the hardware info from the GitHub repo in Redis.
 */
export const redisCacheHardwareInfo = async (data: HardwareInfo[]): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching GitHub hardware info.')
  }
  const redisKey = 'github_hardware_info'
  const cacheTime = config.defaultCacheTime

  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub hardware info for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Looks up the hardware info cached in Redis.
 */
export const redisLookupHardwareInfo = async (): Promise<HardwareInfo[] | null> => {
  const redisKey = 'github_hardware_info'
  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved GitHub hardware info from Redis cache`)
      return JSON.parse(cachedData)
    }
  } catch (error) {
    logger.error('Redis error while fetching cached GitHub hardware info:', error)
  }
  return null
}

/**
 * Caches the game report template from the GitHub repo in Redis.
 */
export const redisCacheGameReportTemplate = async (data: GitHubIssueTemplate): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching GitHub game report template.')
  }
  const redisKey = 'github_game_report_template'
  const cacheTime = config.defaultCacheTime

  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub game report template for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Looks up the game report template cached in Redis.
 */
export const redisLookupGameReportTemplate = async (): Promise<GitHubIssueTemplate | null> => {
  const redisKey = 'github_game_report_template'
  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved GitHub game report template from Redis cache`)
      return JSON.parse(cachedData)
    }
  } catch (error) {
    logger.error('Redis error while fetching cached GitHub game report template:', error)
  }
  return null
}

/**
 * Caches GitHub project details in Redis.
 * This data is cached for one day.
 */
export const redisCacheGitHubProjectDetails = async (data: GitHubProjectGameDetails | Record<string, never>, appId: string | null = null, gameName: string | null = null): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching GitHub project details.')
  }
  if (!appId && !gameName) {
    throw new Error('Either an AppID or Game Name is required.')
  }
  const redisKey = appId
    ? `github_project_details:${escapeRedisKey(appId)}`
    : `github_project_details:${escapeRedisKey(gameName!)}`
  const cacheTime = 60 * 60 * 24 // Cache results in Redis for 1 day

  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub project details for ${cacheTime} seconds with key ${redisKey}`)
}
/**
 * Looks up GitHub project details from Redis by AppID or Game Name.
 */
export const redisLookupGitHubProjectDetails = async (appId: string | null = null, gameName: string | null = null): Promise<GitHubProjectGameDetails | null> => {
  if (!appId && !gameName) {
    throw new Error('Either an AppID or Game Name is required.')
  }
  const redisKey = appId
    ? `github_project_details:${escapeRedisKey(appId)}`
    : `github_project_details:${escapeRedisKey(gameName!)}`
  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved GitHub project for AppID "${appId}" or Game Name "${gameName}" from Redis cache`)
      return JSON.parse(cachedData)
    }
  } catch (error) {
    logger.error('Redis error while fetching cached suggestions:', error)
  }
  return null
}

/**
 * Caches an object of Steam app details in Redis.
 * The cached data is stored for 2 days to improve search performance and reduce API calls
 * to the Steam store.
 */
export const redisCacheSteamAppDetails = async (
  data: SteamStoreAppDetails | Record<string, never>,
  appId: string,
  cacheTime: number = 60 * 60 * 24 * 2, // Default to 2 days
): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching Steam app details.')
  }
  if (!appId) {
    throw new Error('An AppID is required to cache Steam app details.')
  }

  const redisKey = `steam_app_details:${escapeRedisKey(appId)}`
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached Steam app details for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Retrieves a cached object of Steam details for a given App ID.
 */
export const redisLookupSteamAppDetails = async (appId: string): Promise<SteamStoreAppDetails | null> => {
  if (!appId) {
    throw new Error('An AppID is required to lookup Steam app details.')
  }

  const redisKey = `steam_app_details:${escapeRedisKey(appId)}`
  try {
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved Steam app details for "${appId}" from Redis cache`)
      return JSON.parse(cachedData) as SteamStoreAppDetails
    }
  } catch (error) {
    logger.error('Redis error while fetching cached Steam app details:', error)
  }
  return null
}

/**
 * Caches a list of Steam game search suggestions in Redis.
 * The cached data is stored for a default of 2 days to improve search performance
 * and reduce API calls to the Steam store.
 */
export const redisCacheSteamSearchSuggestions = async (
  data: SteamGame[],
  searchTerm: string,
  cacheTime: number = 60 * 60 * 24 * 2, // Default to 2 days
): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching a Steam suggestion list.')
  }
  if (!searchTerm) {
    throw new Error('A search term is required to cache a Steam suggestion list.')
  }
  const redisKey = `steam_game_suggestions:${escapeRedisKey(searchTerm)}`
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached Steam suggestion list for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Retrieves a cached list of Steam game search suggestions from Redis.
 */
export const redisLookupSteamSearchSuggestions = async (
  searchTerm: string,
): Promise<SteamGame[] | null> => {
  if (!searchTerm) {
    throw new Error('A search term is required.')
  }
  const redisKey = `steam_game_suggestions:${escapeRedisKey(searchTerm)}`
  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved Steam suggestion list for search term "${searchTerm}" from Redis cache`)
      return JSON.parse(cachedData) as SteamGame[]
    }
  } catch (error) {
    logger.error('Redis error while fetching cached suggestions:', error)
  }
  return null
}

/**
 * Caches an object of SDHQ Game Review in Redis.
 * The cached data is stored for 2 days to improve search performance and reduce API calls.
 */
export const redisCacheSDHQReview = async (
  data: SDHQReview[],
  appId: string,
  cacheTime: number = 60 * 60 * 24 * 2, // Default to 2 days
): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching SDHQ review.')
  }
  if (!appId) {
    throw new Error('An AppID is required to cache SDHQ review.')
  }

  const redisKey = `sdhq_review:${escapeRedisKey(appId)}`
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached SDHQ review for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Retrieves a cached object of SDHQ Game Review for a given App ID.
 */
export const redisLookupSDHQReview = async (appId: string): Promise<SDHQReview[] | null> => {
  if (!appId) {
    throw new Error('An AppID is required to lookup SDHQ review.')
  }

  const redisKey = `sdhq_review:${escapeRedisKey(appId)}`
  try {
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved SDHQ review for "${appId}" from Redis cache`)
      return JSON.parse(cachedData) as SDHQReview[]
    }
  } catch (error) {
    logger.error('Redis error while fetching cached SDHQ review:', error)
  }
  return null
}

/**
 * Caches an object of SDG Video Review in Redis.
 * The cached data is stored for 2 days to improve search performance and reduce API calls.
 */
export const redisCacheSDGReview = async (
  data: SDGVideoReview[],
  appId: string,
  cacheTime: number = 60 * 60 * 24 * 2, // Default to 2 days
): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching SDG review.')
  }
  if (!appId) {
    throw new Error('An AppID is required to cache SDG review.')
  }

  const redisKey = `sdg_review:${escapeRedisKey(appId)}`
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached SDG review for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Retrieves a cached object of SDG Video Review for a given App ID.
 */
export const redisLookupSDGReview = async (appId: string): Promise<SDGVideoReview[] | null> => {
  if (!appId) {
    throw new Error('An AppID is required to lookup SDG review.')
  }

  const redisKey = `sdg_review:${escapeRedisKey(appId)}`
  try {
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved SDG review for "${appId}" from Redis cache`)
      return JSON.parse(cachedData) as SDGVideoReview[]
    }
  } catch (error) {
    logger.error('Redis error while fetching cached SDG review:', error)
  }
  return null
}

/**
 * Caches an object of the reports summary blog in Redis.
 * The cached data is stored for 14 days to improve search performance and reduce API calls.
 */
export const redisCacheReportsSummaryBlog = async (
  data: BloggerReportSummary,
  key: string,
  cacheTime: number = 60 * 60 * 24 * 14, // Default to 14 days
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
