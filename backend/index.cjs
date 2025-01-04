const express = require('express')
const { generalLimiter } = require('./rateLimiter.cjs')
const {
  connectToRedis,
  storeGameInRedis,
  searchGamesInRedis,
  redisLookupRecentGameReports,
  redisCacheRecentGameReports,
  redisCachePopularGameReports,
  redisLookupPopularGameReports
} = require('./redis.cjs')
const { updateGameIndex, fetchProjectsByAppIdOrGameName, fetchReports, fetchIssueLabels } = require('./github.cjs')
const {
  fetchSteamGameDetails,
  fetchSteamGameSuggestions
} = require('./helpers.cjs')
const logger = require('./logger.cjs')

// Init Express app
const app = express()

// Trust the first reverse proxy
app.set('trust proxy', 1)

// Apply a rate limiter to all routes
app.use(generalLimiter)

// Configure middleware to log requests
app.use((req, res, next) => {
  const start = process.hrtime()
  res.on('finish', () => {
    const duration = process.hrtime(start)
    const timeTaken = (duration[0] * 1e3) + (duration[1] / 1e6) // Convert to milliseconds
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${timeTaken.toFixed(3)} ms`)
  })
  next()
})

/**
 * Get the most recent reports from the GitHub repository.
 *
 * @returns {object[]} 200 - An array of report objects.
 * @returns {array} 204 - No reports found.
 * @returns {object} 500 - Internal server error.
 */
app.get('/deck-verified/api/v1/recent_reports', async (req, res) => {
  try {
    const cachedData = await redisLookupRecentGameReports()
    if (cachedData) {
      logger.info('Serving from Redis cache')
      return res.json(cachedData)
    }

    const reports = await fetchReports(
      undefined,
      undefined,
      'open',
      'updated',
      'desc',
      5
    )
    if (reports && reports.items.length > 0) {
      await redisCacheRecentGameReports(reports.items)
      res.json(reports.items)
    } else {
      logger.info('No reports found.')
      res.status(204).json([]) // 204 No Content
    }
  } catch (error) {
    logger.error('Error fetching recent reports:', error)
    res.status(500).json({ error: 'Failed to fetch recent reports' })
  }
})

/**
 * Get the most popular reports from the GitHub repository.
 *
 * @returns {object[]} 200 - An array of report objects.
 * @returns {array} 204 - No reports found.
 * @returns {object} 500 - Internal server error.
 */
app.get('/deck-verified/api/v1/popular_reports', async (req, res) => {
  try {
    const cachedData = await redisLookupPopularGameReports()
    if (cachedData) {
      logger.info('Serving from Redis cache')
      return res.json(cachedData)
    }

    const reports = await fetchReports(
      undefined,
      undefined,
      'open',
      'reactions-+1',
      'desc',
      5
    )
    if (reports && reports.items.length > 0) {
      await redisCachePopularGameReports(reports.items)
      res.json(reports.items)
    } else {
      logger.info('No reports found.')
      return res.status(204).json([]) // 204 No Content
    }
  } catch (error) {
    logger.error('Error fetching popular reports:', error)
    return res.status(500).json({ error: 'Failed to fetch popular reports' })
  }
})

/**
 * Search for games in the database.
 *
 * @queryParam term {string} - The search term to use.
 * @queryParam include_external {boolean} - Whether to include external search results (e.g., from Steam).
 *
 * @returns {object[]} 200 - An array of game objects.
 * @returns {array} 204 - No games found
 * @returns {object} 400 - Bad request, missing or invalid search term.
 * @returns {object} 500 - Internal server error.
 *
 * @example
 * [
 *   {
 *     "gameName": "Horizon Zero Dawn™ Complete Edition",
 *     "appId": "1151640",
 *     "metadata": {
 *       "banner": "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1151640/header.jpg"
 *     }
 *   }
 * ]
 */
app.get('/deck-verified/api/v1/search_games', async (req, res) => {
  let searchString = req.query['term']
  const includeExternal = req.query['include_external'] === 'true'

  if (!searchString) {
    return res.status(400).json({ error: 'Missing search parameter' })
  }

  // Run search
  let results = []
  try {
    if (includeExternal) {
      const steamResults = await fetchSteamGameSuggestions(searchString)
      // Loop over steamResults and add them to redis
      for (const result of steamResults) {
        logger.info(`Storing project ${result.name}, appId ${result.appId} in RedisSearch`)
        try {
          if (result.name && result.appId) {
            const headerImage = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${result.appId}/header.jpg`
            await storeGameInRedis(result.name, result.appId, headerImage)
          }
        } catch (error) {
          logger.error('Error storing game in Redis:', error)
        }
      }
    }

    // Fetch results from redis
    const games = await searchGamesInRedis(searchString)
    if (games.length > 0) {
      for (let game of games) {
        results.push({
          gameName: game.name,
          appId: game.appId,
          metadata: {
            banner: game.banner
          }
        })
      }
      return res.json(results)
    } else {
      logger.info('No games found.')
      return res.status(204).json([])
    }
  } catch (error) {
    logger.error('Error:', error)
    return res.status(500).json({ error: 'Failed to search games' })
  }
})

/**
 * Get game details
 *
 * @queryParam name {string} - The game name
 * @queryParam appid {string} - The game App ID
 * @queryParam include_external {boolean} - Whether to include external search results (e.g., from Steam).
 *
 * @returns {object} 200 - A game data object.
 * @returns {object} 204 - No game found matching the query params
 * @returns {object} 400 - Bad request, missing or invalid search term.
 * @returns {object} 500 - Internal server error.
 *
 * @example
 * {
 *   "gameName": "Horizon Forbidden West™ Complete Edition",
 *   "appId": 2420110,
 *   "projectNumber": null,
 *   "metadata": {
 *     "poster": "https://steamcdn-a.akamaihd.net/steam/apps/2420110/library_600x900.jpg",
 *     "hero": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2420110/page_bg_generated_v6b.jpg",
 *     "banner": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2420110/header.jpg"
 *   },
 *   "reports": []
 * }
 */
app.get('/deck-verified/api/v1/game_details', async (req, res) => {
  const appId = req.query['appid']
  const gameName = req.query['name']
  const includeExternal = req.query['include_external'] === 'true'
  let returnData = null

  if (!appId && !gameName) {
    return res.status(400).json({ error: 'No valid query parameter' })
  }

  try {
    const project = await fetchProjectsByAppIdOrGameName(appId, gameName, null)
    if (project) {
      returnData = {
        gameName: project.gameName,
        appId: project.appId,
        projectNumber: project.projectNumber,
        metadata: project.metadata,
        reports: project.issues
      }
      logger.info('Using GitHub Project data for game details result')
    }

    if (!returnData && includeExternal && appId) {
      const steamResults = await fetchSteamGameDetails(appId)
      if (steamResults) {
        returnData = {
          gameName: steamResults.name,
          appId: appId,
          projectNumber: null,
          metadata: {
            poster: `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/library_600x900.jpg`,
            hero: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`,
            background: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/page_bg_generated_v6b.jpg`,
            banner: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`
          },
          reports: []
        }
        logger.info('Using Steam Game API data for game details result')
      }
    }

    if (!returnData) {
      logger.info(`No results found for appId "${appId}" or gameName "${gameName}".`)
      return res.status(204).json({})
    }

    return res.json(returnData)
  } catch (error) {
    logger.error('Error:', error)
    return res.status(500).json({ error: 'Failed to search games' })
  }
})

/**
 * Get all issue labels from the GitHub repository.
 *
 * @returns {object[]} 200 - An array of label objects.
 * @returns {array} 204 - No labels found
 * @returns {object} 500 - Internal server error.
 */
app.get('/deck-verified/api/v1/issue_labels', async (req, res) => {
  try {
    const labels = await fetchIssueLabels()
    if (!labels) {
      return res.status(204).json([])
    }
    return res.json(labels)
  } catch (error) {
    logger.error('Error:', error)
    return res.status(500).json({ error: 'Failed to fetch labels' })
  }
})

const startServer = async () => {
  try {
    await connectToRedis()

    // Continue with the rest of the script after Redis is connected
    logger.info('Redis connected. Proceeding with the rest of the script...')

    // Run scheduled tasks
    // Schedule updateGameIndex to run every hour
    setInterval(updateGameIndex, 3600 * 1000)

    // Server
    const port = 9022
    app.listen(port, () => {
      logger.info(`Server listening on port ${port}`)
    })
  } catch (error) {
    logger.error('Error starting the server:', error)
    process.exit(1)
  }
}

startServer()
