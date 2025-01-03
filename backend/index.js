const express = require('express')
const { connectToRedis, redisClient } = require('./redis')
const { updateGameIndex, fetchReports, fetchProject, fetchIssueLabels } = require('./github')
const { generalLimiter } = require('./rateLimiter')
const {
  cacheTime,
  storeGameInRedis,
  searchGamesInRedis,
  fetchSteamGameDetails,
  fetchSteamGameSuggestions
} = require('./helpers')
const logger = require('./logger')

const app = express()

// Apply a rate limiter to all routes
app.use(generalLimiter)


/**
 * Get the most recent reports from the GitHub repository.
 *
 * @returns {object[]} 200 - An array of report objects.
 * @returns {array} 204 - No reports found.
 * @returns {object} 500 - Internal server error.
 */
app.get('/deck-verified/api/v1/recent_reports', async (req, res) => {
  const redisKey = 'issues_top_recent'
  try {
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info('Serving from Redis cache')
      return res.json(JSON.parse(cachedData))
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
      await redisClient.set(redisKey, JSON.stringify(reports.items), { EX: cacheTime }) // Cache for 1 hour
      logger.info('Data fetched from GitHub and cached in Redis')

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
  const redisKey = 'issues_top_popular'
  try {
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info('Serving from Redis cache')
      return res.json(JSON.parse(cachedData))
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
      await redisClient.set(redisKey, JSON.stringify(reports.items), { EX: cacheTime }) // Cache for 1 hour
      logger.info('Data fetched from GitHub and cached in Redis')

      return res.json(reports.items)
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

  try {
    searchString = decodeURIComponent(searchString)
  } catch (error) {
    return res.status(400).json({ error: `Invalid game_name parameter: ${error}` })
  }

  // Run search
  let results = []
  try {
    if (includeExternal) {
      const steamResults = await fetchSteamGameSuggestions(searchString)
      // Loop over steamResults and add them to redis
      for (const result of steamResults) {
        logger.info(`Storing project ${result.name}, appId ${result.appId}, and banner ${result.img} in RedisSearch`)
        try {
          await storeGameInRedis(result.name, result.appId, result.img)
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
  const searchTerm = appId ? `appid="${appId}"` : `name="${decodeURIComponent(gameName)}"`

  const redisKey = `game_details:${searchTerm}`
  const cachedData = await redisClient.get(redisKey)
  if (cachedData) {
    logger.info('Serving from Redis cache')
    return res.json(JSON.parse(cachedData))
  }

  try {
    logger.info('Searching GitHub Projects for results')
    const projects = await fetchProject(searchTerm, null)
    if (projects && projects.length > 0) {
      const project = projects[0]
      returnData = {
        gameName: project.gameName,
        appId: project.appId,
        projectNumber: project.projectNumber,
        metadata: project.metadata,
        reports: project.issues
      }
    }

    if (!returnData && includeExternal && appId) {
      logger.info('Searching Steam Game API Projects for results')
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
      }
    }

    if (!returnData) {
      logger.info(`No results found for search term "${searchTerm}".`)
      return res.status(204).json({})
    }

    // Store results in redis
    // TODO: Check if it is worth storing this search result here
    await storeGameInRedis(returnData.gameName, returnData.appId, returnData.metadata.banner)
    await redisClient.set(redisKey, JSON.stringify(returnData), { EX: 60 }) // TODO: Cache for 1 hour (cacheTime)

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
  const redisKey = `issue_labels`
  try {
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info('Serving from Redis cache')
      return res.json(JSON.parse(cachedData))
    }

    const labels = await fetchIssueLabels()
    await redisClient.set(redisKey, JSON.stringify(labels), { EX: cacheTime }) // Cache for 1 hour
    logger.info('Data fetched from GitHub and cached in Redis')

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
    // Call updateGameIndex on start
    await updateGameIndex()
    // Schedule updateGameIndex to run every "cacheTime" minutes
    setInterval(updateGameIndex, cacheTime * 1000)

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
