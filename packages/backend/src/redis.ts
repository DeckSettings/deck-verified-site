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
  SteamStoreAppDetails,
  SteamGame, HardwareInfo
} from '../../shared/src/game'

// Redis client
export const redisClient: RedisClientType = createClient({
  socket: {
    host: config.redisHost,
    port: config.redisPort
  },
  password: config.redisPassword
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
    const indexExists = await redisClient.ft.info('games_idx').catch(() => null)

    if (!indexExists) {
      logger.info('Creating RedisSearch index...')

      // Create the index with a game name (TEXT) and appid (NUMERIC)
      await redisClient.ft.create(
        'games_idx',
        {
          appsearch: { type: SchemaFieldTypes.TEXT, SORTABLE: true }
        },
        {
          ON: 'HASH',
          PREFIX: 'game:'
        }
      )
      logger.info('RedisSearch index created.')
    }
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
 * Stores game data in Redis as a hash entry.
 * The game is indexed by either AppID or game name.
 * NOTE:  Special characters in the search string are escaped. Without this,
 *        we are unable to search on these special characters.
 */
export const storeGameInRedis = async (gameName: string, appId: string | null = null, banner: string | null = null): Promise<void> => {
  if (!gameName) {
    throw new Error('Game name is required.')
  }

  const gameId = appId ? `game:${appId}` : `game:${encodeURIComponent(gameName.toLowerCase())}`
  const searchString = appId ? `${appId}_${gameName.toLowerCase()}` : `${gameName.toLowerCase()}`
  const escapedSearchString = escapeRedisKey(searchString)

  try {
    await redisClient.hSet(gameId, {
      appsearch: escapedSearchString, // Add string used for searches
      appname: gameName,              // Use gameName for the appname
      appid: appId || '',             // Store appid, use empty string if null
      appbanner: banner || ''         // Store poster, use empty string if null
    })
    logger.info(`Stored game: ${gameName} (appid: ${appId ?? 'null'}, banner: ${banner ?? 'null'})`)
  } catch (error) {
    logger.error('Failed to store game in Redis:', error)
  }
}

/**
 * Searches for games in Redis based on the provided search term.
 * Uses RedisSearch to match the term against indexed game data.
 */
export const searchGamesInRedis = async (searchTerm: string | null = null, appId: string | null = null, gameName: string | null = null): Promise<GameSearchCache[]> => {
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
      logger.info(`Searching cached games list for '${searchTerm}'`)
      query = `@appsearch:*${escapeRedisKey(searchTerm)}*`
    } else if (appId) {
      logger.info(`Searching cached games list by AppID '${appId}'`)
      query = `@appsearch:${escapeRedisKey(appId)}_*`
    } else if (gameName) {
      logger.info(`Searching cached games list by game name '${gameName}'`)
      query = `@appsearch:*_${escapeRedisKey(gameName)}`
    }

    const results = await redisClient.ft.search(
      'games_idx',
      query,
      {
        LIMIT: { from: 0, size: 10 }
      }
    )

    if (results.total === 0) {
      logger.info('No games found.')
      return []
    }

    return results.documents.map((doc): GameSearchCache => ({
      name: typeof doc.value.appname === 'string' ? doc.value.appname : '',
      appId: typeof doc.value.appid === 'string' && doc.value.appid !== '' ? doc.value.appid : null,
      banner: typeof doc.value.appbanner === 'string' && doc.value.appbanner !== '' ? doc.value.appbanner : null
    }))
  } catch (error) {
    logger.error('Error during search:', error)
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
  cacheTime: number = 60 * 60 * 24 * 2 // Default to 2 days
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
  cacheTime: number = 60 * 60 * 24 * 2 // Default to 2 days
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
  searchTerm: string
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
