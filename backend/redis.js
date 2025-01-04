const redis = require('redis')
const logger = require('./logger')

// Redis config
const redisHost = process.env.REDIS_HOST || '127.0.0.1'
const redisPort = process.env.REDIS_PORT || 6379
const redisPassword = process.env.REDIS_PASSWORD || null
const defaultCacheTime = process.env.CACHE_TIME || 600 // Default 10 Minutes

// Redis connection
const redisClient = redis.createClient({
  socket: {
    host: redisHost,
    port: redisPort
  },
  password: redisPassword
})

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

const storeGameInRedis = async (gameName, appId = null, banner = null) => {
  if (!gameName) {
    throw new Error('Game name is required.')
  }

  const gameId = appId ? `game:${appId}` : `game:${encodeURIComponent(gameName.toLowerCase())}`
  const searchString = appId ? `${appId}_${gameName.toLowerCase()}` : `${gameName.toLowerCase()}`
  // Comment with backslash the characters ,.<>{}[]"':;!@#$%^&*()-+=~ and whitespace
  const escapedSearchString = searchString.toLowerCase().trim().replace(/[,.<>{}\[\]"':;!@#$%^&*()\-+=\~\s]/g, '\\$&')

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

const searchGamesInRedis = async (searchTerm) => {
  if (!searchTerm) {
    throw new Error('Search term is required.')
  }

  try {
    // Construct the search query to match either appname or appid
    logger.info(`Searching cached games list for '${searchTerm}'`)
    // Comment with backslash the characters ,.<>{}[]"':;!@#$%^&*()-+=~ and whitespace
    const escapedSearchTerm = searchTerm.toLowerCase().trim().replace(/[,.<>{}\[\]"':;!@#$%^&*()\-+=\~\s]/g, '\\$&')

    const query = `@appsearch:*${escapedSearchTerm}*`
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

const redisCacheRecentGameReports = async (data) => {
  if (!data) {
    throw new Error('Data is required for caching GitHub recent game reports.')
  }
  const redisKey = 'github_game_reports_recent'
  const cacheTime = defaultCacheTime
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub recent game reports for ${cacheTime} seconds with key ${redisKey}`)
}

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

const redisCachePopularGameReports = async (data) => {
  if (!data) {
    throw new Error('Data is required for caching GitHub popular game reports.')
  }
  const redisKey = 'github_game_reports_popular'
  const cacheTime = defaultCacheTime
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub popular game reports for ${cacheTime} seconds with key ${redisKey}`)
}

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

const redisCacheGitHubIssueLabels = async (data) => {
  if (!data) {
    throw new Error('Data is required for caching GitHub issue labels.')
  }
  const redisKey = 'github_issue_labels'
  const cacheTime = defaultCacheTime
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub issue labels for ${cacheTime} seconds with key ${redisKey}`)
}

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

const redisCacheReportBodySchema = async (data) => {
  if (!data) {
    throw new Error('Data is required for caching GitHub report body schema.')
  }
  const redisKey = 'github_game_reports_body_schema'
  const cacheTime = defaultCacheTime
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub report body schema for ${cacheTime} seconds with key ${redisKey}`)
}

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

const redisCacheGitHubProjectDetails = async (data, appId = null, gameName = null) => {
  if (!data) {
    throw new Error('Data is required for caching GitHub project details.')
  }
  if (!appId && !gameName) {
    throw new Error('Either an AppID or Game Name is required.')
  }
  const redisKey = appId ? `github_project_details:${appId}` : `github_project_details:${gameName}`
  const cacheTime = 60 * 60 * 24 // Cache results in Redis for 1 day
  await redisClient.set(redisKey, JSON.stringify(data), { EX: cacheTime })
  logger.info(`Cached GitHub project details for ${cacheTime} seconds with key ${redisKey}`)
}

const redisLookupGitHubProjectDetails = async (appId = null, gameName = null) => {
  if (!appId && !gameName) {
    throw new Error('Either an AppID or Game Name is required.')
  }
  const redisKey = appId ? `github_project_details:${appId}` : `github_project_details:${gameName}`
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
  redisLookupGitHubProjectDetails
}
