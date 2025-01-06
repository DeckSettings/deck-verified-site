const redis = require('redis')
const logger = require('./logger.cjs')

// Redis config
const redisHost = process.env.REDIS_HOST || '127.0.0.1'
const redisPort = process.env.REDIS_PORT || 6379
const redisPassword = process.env.REDIS_PASSWORD || null
const defaultCacheTime = process.env.DEFAULT_CACHE_TIME || 600 // Default 10 Minutes

// Redis connection
const redisClient = redis.createClient({
  socket: {
    host: redisHost,
    port: redisPort
  },
  password: redisPassword
})

/**
 * Establishes a connection to the Redis server and ensures the RedisSearch index is created.
 * Logs connection status and any errors encountered.
 *
 * @returns {Promise<void>}
 */
const connectToRedis = async () => {
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
 *
 * @returns {Promise<void>}
 */
const createRedisSearchIndex = async () => {
  try {
    // Check if the index already exists
    const indexExists = await redisClient.ft.info('games_idx').catch(() => null)

    if (!indexExists) {
      logger.info('Creating RedisSearch index...')

      // Create the index with a game name (TEXT) and appid (NUMERIC)
      await redisClient.ft.create(
        'games_idx',
        {
          appsearch: { type: 'TEXT', SORTABLE: true }  // Searchable index. Other fields can be added, but will not be searchable.
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
 *
 * @param {string} input - The string to be sanitized.
 * @returns {string} - The escaped string.
 */
const escapeRedisKey = (input) => {
  // Comment with backslash the characters ,.<>{}[]"':;!@#$%^&*()-+=~ and whitespace
  return input.toString().toLowerCase().trim().replace(/[,.<>{}\[\]"':;!@#$%^&*()\-+=\~\s]/g, '\\$&')
}

/**
 * Stores game data in Redis as a hash entry.
 * The game is indexed by either AppID or game name.
 * NOTE:  Special characters in the search string are escaped. Without this,
 *        we are unable to search on these special characters.
 *
 * @param {string} gameName - The name of the game.
 * @param {string|null} [appId=null] - The AppID of the game, if available.
 * @param {string|null} [banner=null] - URL of the game banner image.
 * @returns {Promise<void>}
 * @throws {Error} - Throws an error if gameName is not provided.
 */
const storeGameInRedis = async (gameName, appId = null, banner = null) => {
  if (!gameName) {
    throw new Error('Game name is required.')
  }

  const gameId = appId ? `game:${appId}` : `game:${encodeURIComponent(gameName.toLowerCase())}`
  const searchString = appId ? `${appId}_${gameName.toLowerCase()}` : `${gameName.toLowerCase()}`
  const escapedSearchString = escapeRedisKey(searchString)
  try {
    await redisClient.hSet(gameId, {
      appsearch: escapedSearchString, // Add string used for searches
      appname: gameName,  // Use gameName for the appname
      appid: appId ? String(appId) : '',   // Store appid, use empty string if null
      appbanner: banner ? String(banner) : ''   // Store poster, use empty string if null
    })
    logger.info(`Stored game: ${gameName} (appid: ${appId ?? 'null'}, banner: ${banner ?? 'null'})`)
  } catch (error) {
    logger.error('Failed to store game in Redis:', error)
  }
}

/**
 * Searches for games in Redis based on the provided search term.
 * Uses RedisSearch to match the term against indexed game data.
 *
 * @param {string|null} searchTerm - The term to search for.
 * @param {number|null} appId - An AppID to search for.
 * @param {string|null} gameName - The game name to search for.
 * @returns {Promise<Array>} - Returns an array of matching game objects.
 * @throws {Error} - Throws an error if no search term is provided.
 */
const searchGamesInRedis = async (searchTerm = null, appId = null, gameName = null) => {
  if (!searchTerm && !appId && !gameName) {
    throw new Error('Search term is required.')
  }
  if (searchTerm && searchTerm.length > 100) {
    throw new Error('Search term too long.')
  }
  if (searchTerm && /\*{3,}/.test(searchTerm)) {
    throw new Error('Too many wildcards in search term.')
  }

  try {
    let query = null
    if (searchTerm) {
      // Construct the search query to match either appname or appid
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

    return results.documents.map(doc => ({
      name: doc.value.appname,
      appId: doc.value.appid !== '' ? doc.value.appid : null,
      banner: doc.value.appbanner !== '' ? doc.value.appbanner : null
    }))
  } catch (error) {
    logger.error('Error during search:', error)
    return []
  }
}

/**
 * Caches recent game reports from GitHub in Redis.
 *
 * @param {Array} data - The data to cache.
 * @returns {Promise<void>}
 * @throws {Error} - Throws an error if no data is provided.
 */
const redisCacheRecentGameReports = async (data) => {
  if (!data) {
    throw new Error('Data is required for caching GitHub recent game reports.')
  }
  const redisKey = 'github_game_reports_recent'
  const cacheTime = defaultCacheTime
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub recent game reports for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Looks up recent game reports cached in Redis.
 *
 * @returns {Promise<Object|null>} - Returns cached data or null if no cache exists.
 */
const redisLookupRecentGameReports = async () => {
  const redisKey = 'github_game_reports_recent'
  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved GitHub recent game reports from Redis cache`)
      return JSON.parse(cachedData)
    }
  } catch (error) {
    logger.error('Redis error while fetching cached recent game reports:', error)
  }
  return null
}

/**
 * Caches popular game reports from GitHub in Redis.
 *
 * @param {Array} data - The data to cache.
 * @returns {Promise<void>}
 * @throws {Error} - Throws an error if no data is provided.
 */
const redisCachePopularGameReports = async (data) => {
  if (!data) {
    throw new Error('Data is required for caching GitHub popular game reports.')
  }
  const redisKey = 'github_game_reports_popular'
  const cacheTime = defaultCacheTime
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub popular game reports for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Looks up popular game reports cached in Redis.
 *
 * @returns {Promise<Object|null>} - Returns cached data or null if no cache exists.
 */
const redisLookupPopularGameReports = async () => {
  const redisKey = 'github_game_reports_popular'
  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved GitHub popular game reports from Redis cache`)
      return JSON.parse(cachedData)
    }
  } catch (error) {
    logger.error('Redis error while fetching cached popular game reports:', error)
  }
  return null
}

/**
 * Caches the list of issue labels from GitHub in Redis.
 *
 * @param {Array} data - The data to cache.
 * @returns {Promise<void>}
 * @throws {Error} - Throws an error if no data is provided.
 */
const redisCacheGitHubIssueLabels = async (data) => {
  if (!data) {
    throw new Error('Data is required for caching GitHub issue labels.')
  }
  const redisKey = 'github_issue_labels'
  const cacheTime = defaultCacheTime
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub issue labels for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Looks up the list of issue labels cached in Redis.
 *
 * @returns {Promise<Object|null>} - Returns cached data or null if no cache exists.
 */
const redisLookupGitHubIssueLabels = async () => {
  const redisKey = 'github_issue_labels'
  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved GitHub issue labels from Redis cache`)
      return JSON.parse(cachedData)
    }
  } catch (error) {
    logger.error('Redis error while fetching cached GitHub issue labels:', error)
  }
  return null
}

/**
 * Caches the game report body schema from the GitHub repo in Redis.
 *
 * @param {Array} data - The data to cache.
 * @returns {Promise<void>}
 * @throws {Error} - Throws an error if no data is provided.
 */
const redisCacheReportBodySchema = async (data) => {
  if (!data) {
    throw new Error('Data is required for caching GitHub report body schema.')
  }
  const redisKey = 'github_game_reports_body_schema'
  const cacheTime = defaultCacheTime
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub report body schema for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Looks up the game report body schema cached in Redis.
 *
 * @returns {Promise<Object|null>} - Returns cached data or null if no cache exists.
 */
const redisLookupReportBodySchema = async () => {
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
 * Caches GitHub project details in Redis.
 * This data is cached for one day.
 *
 * @param {Object} data - The project details to be cached.
 * @param {string|null} [appId=null] - The AppID associated with the project.
 * @param {string|null} [gameName=null] - The name of the game associated with the project.
 * @returns {Promise<void>}
 * @throws {Error} - Throws an error if no data is provided or if neither AppID nor Game Name is specified.
 */
const redisCacheGitHubProjectDetails = async (data, appId = null, gameName = null) => {
  if (!data) {
    throw new Error('Data is required for caching GitHub project details.')
  }
  if (!appId && !gameName) {
    throw new Error('Either an AppID or Game Name is required.')
  }
  const redisKey = appId ? `github_project_details:${escapeRedisKey(appId)}` : `github_project_details:${escapeRedisKey(gameName)}`
  const cacheTime = 60 * 60 * 24 // Cache results in Redis for 1 day
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub project details for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Looks up GitHub project details from Redis by AppID or Game Name.
 *
 * @param {string|null} [appId=null] - The AppID of the project to look up.
 * @param {string|null} [gameName=null] - The game name associated with the project to look up.
 * @returns {Promise<Object|null>} - Returns the cached project details if found, or null if not cached.
 * @throws {Error} - Throws an error if neither AppID nor Game Name is provided.
 */
const redisLookupGitHubProjectDetails = async (appId = null, gameName = null) => {
  if (!appId && !gameName) {
    throw new Error('Either an AppID or Game Name is required.')
  }
  const redisKey = appId ? `github_project_details:${escapeRedisKey(appId)}` : `github_project_details:${escapeRedisKey(gameName)}`
  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved GitHub project for AppID "${appId}" from Redis cache`)
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
 *
 * @param {Object} data - The list of Steam game suggestions to cache.
 * @param {string} appId - The AppID of the game details from Steam.
 * @returns {Promise<void>}
 * @throws {Error} - Throws an error if no data or search term is provided.
 */
const redisCacheSteamAppDetails = async (data, appId) => {
  if (!data) {
    throw new Error('Data is required for caching a Steam app details.')
  }
  if (!appId) {
    throw new Error('An AppID is required to cache a Steam app details.')
  }
  const redisKey = `steam_app_details:${escapeRedisKey(appId)}`
  const cacheTime = 60 * 60 * 24 * 2 // Cache results in Redis for 2 days
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached Steam suggestion list for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Retrieves a cached object of Steam details for a given App ID.
 *
 * @param {string} appId - The AppID of the project to look up.
 * @returns {Promise<Object|null>} - Returns the cached list of suggestions if found, or null if not cached.
 * @throws {Error} - Throws an error if no search term is provided.
 */
const redisLookupSteamAppDetails = async (appId) => {
  if (!appId) {
    throw new Error('An AppID is required to lookup Steam app details.')
  }
  const redisKey = `steam_app_details:${escapeRedisKey(appId)}`
  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved Steam app details for "${appId}" from Redis cache`)
      return JSON.parse(cachedData)
    }
  } catch (error) {
    logger.error('Redis error while fetching cached Steam app details:', error)
  }
  return null
}

/**
 * Caches a list of Steam game search suggestions in Redis.
 * The cached data is stored for 2 days to improve search performance and reduce API calls
 * to the Steam store.
 *
 * @param {Object} data - The list of Steam game suggestions to cache.
 * @param {string} searchTerm - The search term used to retrieve the suggestions.
 * @returns {Promise<void>}
 * @throws {Error} - Throws an error if no data or search term is provided.
 */
const redisCacheSteamSearchSuggestions = async (data, searchTerm) => {
  if (!data) {
    throw new Error('Data is required for caching a Steam suggestion list.')
  }
  if (!searchTerm) {
    throw new Error('A search term is required to cache a Steam suggestion list.')
  }
  const redisKey = `steam_game_suggestions:${escapeRedisKey(searchTerm)}`
  const cacheTime = 60 * 60 * 24 * 2 // Cache results in Redis for 2 days
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached Steam suggestion list for ${cacheTime} seconds with key ${redisKey}`)
}

/**
 * Retrieves a cached list of Steam game search suggestions from Redis.
 *
 * @param {string} searchTerm - The search term used to look up the cached suggestions.
 * @returns {Promise<Object[]|null>} - Returns the cached list of suggestions if found, or null if not cached.
 * @throws {Error} - Throws an error if no search term is provided.
 */
const redisLookupSteamSearchSuggestions = async (searchTerm) => {
  if (!searchTerm) {
    throw new Error('A search term is required.')
  }
  const redisKey = `steam_game_suggestions:${escapeRedisKey(searchTerm)}`
  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Retrieved Steam suggestion list for search term "${searchTerm}" from Redis cache`)
      return JSON.parse(cachedData)
    }
  } catch (error) {
    logger.error('Redis error while fetching cached suggestions:', error)
  }
  return null
}

module.exports = {
  redisClient,
  connectToRedis,
  storeGameInRedis,
  searchGamesInRedis,
  redisCacheRecentGameReports,
  redisLookupRecentGameReports,
  redisCachePopularGameReports,
  redisLookupPopularGameReports,
  redisCacheGitHubIssueLabels,
  redisLookupGitHubIssueLabels,
  redisCacheReportBodySchema,
  redisLookupReportBodySchema,
  redisCacheGitHubProjectDetails,
  redisLookupGitHubProjectDetails,
  redisCacheSteamAppDetails,
  redisLookupSteamAppDetails,
  redisCacheSteamSearchSuggestions,
  redisLookupSteamSearchSuggestions
}
