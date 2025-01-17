import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import helmet from 'helmet'
import config from './config'
import { generalLimiter } from './rateLimiter'
import logger from './logger'
import {
  connectToRedis,
  storeGameInRedis,
  searchGamesInRedis
} from './redis'
import {
  fetchIssueLabels, fetchPopularReports,
  fetchProjectsByAppIdOrGameName, fetchRecentReports,
  fetchGameReportTemplate, updateGameIndex, fetchHardwareInfo, fetchReportBodySchema
} from './github'
import { fetchSteamGameSuggestions, fetchSteamStoreGameDetails, generateImageLinksFromAppId } from './helpers'
import { GameDetails, GameMetadata, GameReportForm, GameSearchResult } from '../../shared/src/game'

// Log shutdown requests
process.on('SIGINT', () => {
  logger.info('Shutting down server...')
  process.exit(0)
})

// Init Express app
const app = express()

// Trust the first reverse proxy
app.set('trust proxy', 1)

// Apply some production security hardening
if (config.nodeEnv === 'production') {
  logger.info('Running with helmet enabled.')
  app.use(helmet())
} else {
  logger.info('Running with helmet disabled.')
}

// Apply a rate limiter to all routes
if (config.enableRateLimiter) {
  logger.info('Running with rate limiter enabled.')
  app.use(generalLimiter)
} else {
  logger.info('Running with rate limiter disabled.')
}

// Configure middleware to log requests
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime()
  res.on('finish', () => {
    const duration = process.hrtime(start)
    const timeTaken = (duration[0] * 1e3) + (duration[1] / 1e6)
    const user = '' // Placeholder for is user auth is added at a later stage
    const timeNow = new Date()
    const timeNowString = timeNow.toISOString()
    const responseLength = res.getHeader('Content-Length') || 0
    const httpReferer = req.headers['referer'] || '-'
    const userAgent = req.headers['user-agent'] || ''
    const message = `${req.ip} - ${user} [${timeNowString}] "${req.method}" ${res.statusCode} ${responseLength} "${httpReferer}" "${userAgent}"`
    const logData = {
      source_project: 'deck-verified-api',
      source_version: 1, // TODO: Cook version into build
      process: process.pid,
      time: timeNowString,
      timestamp: Math.floor(Date.now() / 1000),
      duration_in_ms: timeTaken.toFixed(3),
      message: message,
      x_forwarded_for: req.headers['x-forwarded-for'] || '',
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      response_length: responseLength,
      // @ts-ignore
      rate_limit_used: req.rateLimit ? req.rateLimit.current : '0',
      // @ts-ignore
      rate_limit_remaining: req.rateLimit ? req.rateLimit.remaining : '0',
      referer: httpReferer,
      user_agent: userAgent,
      remote_ip: req.ip
    }
    logger.info(logData)
  })
  next()
})

/**
 * Get the most recent reports from the GitHub repository.
 *
 * @returns {object[]} 200 - Service is healthy.
 * @returns {object} 500 - Internal server error.
 */
app.get('/deck-verified/api/v1/health', async (_req: Request, res: Response) => {
  res.status(200).send('OK')
})

/**
 * Get the most recent reports from the GitHub repository.
 *
 * @returns {object[]} 200 - An array of report objects.
 * @returns {array} 204 - No reports found.
 * @returns {object} 500 - Internal server error.
 */
app.get('/deck-verified/api/v1/recent_reports', async (_req: Request, res: Response) => {
  try {
    const reports = await fetchRecentReports()
    if (reports && reports?.length > 0) {
      return res.json(reports)
    }
    logger.info('No reports found.')
    return res.status(204).json([]) // 204 No Content
  } catch (error) {
    logger.error('Error fetching popular reports:', error)
    return res.status(500).json({ error: 'Failed to fetch popular reports' })
  }
})

/**
 * Get the most popular reports from the GitHub repository.
 *
 * @returns {object[]} 200 - An array of report objects.
 * @returns {array} 204 - No reports found.
 * @returns {object} 500 - Internal server error.
 */
app.get('/deck-verified/api/v1/popular_reports', async (_req: Request, res: Response) => {
  try {
    const reports = await fetchPopularReports()
    if (reports && reports?.length > 0) {
      return res.json(reports)
    }
    logger.info('No reports found.')
    return res.status(204).json([]) // 204 No Content
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
app.get('/deck-verified/api/v1/search_games', async (req: Request, res: Response) => {
  const searchString = req.query['term'] as string
  const includeExternal = req.query['include_external'] === 'true'

  if (!searchString) {
    return res.status(400).json({ error: 'Missing search parameter' })
  }
  if (searchString.trim().length < 3) {
    return res.status(400).json({ error: 'Search parameter must be at least 3 characters long' })
  }

  try {
    if (includeExternal) {
      const { suggestions: steamResults, fromCache } = await fetchSteamGameSuggestions(searchString)
      if (!fromCache) {
        // Loop over steamResults and add them to redis
        for (const result of steamResults) {
          logger.info(`Storing project ${result.name}, appId ${result.appId} in RedisSearch`)
          if (result.name && result.appId) {
            const headerImage = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${result.appId}/header.jpg`
            await storeGameInRedis(result.name, result.appId, headerImage)
          }
        }
      }
    }

    // Fetch results from redis
    const games = await searchGamesInRedis(searchString)
    if (games.length > 0) {
      const results: GameSearchResult[] = await Promise.all(
        games.map(async (game) => {
          let metadata: Partial<GameMetadata> = {
            banner: game.banner,
            poster: null,
            hero: null,
            background: null
          }
          if (game.appId) {
            // Generate image links if appId is not null
            const gameImages = await generateImageLinksFromAppId(String(game.appId))
            metadata = {
              banner: metadata.banner ?? gameImages.banner,
              poster: metadata.poster ?? gameImages.poster,
              hero: metadata.hero ?? gameImages.hero,
              background: metadata.background ?? gameImages.background
            }
          }
          return {
            gameName: game.name,
            appId: Number(game.appId),
            metadata: metadata as GameMetadata
          }
        })
      )
      return res.json(results)
    }
    logger.info('No games found.')
    return res.status(204).json([])
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
app.get('/deck-verified/api/v1/game_details', async (req: Request, res: Response) => {
  const appId = req.query['appid'] as string | null
  const gameName = req.query['name'] as string | null
  const includeExternal = req.query['include_external'] === 'true'
  let returnData: GameDetails | null = null

  if (!appId && !gameName) {
    return res.status(400).json({ error: 'No valid query parameter' })
  }

  try {
    const project = await fetchProjectsByAppIdOrGameName(appId, gameName, null)
    if (project && project.projectNumber) {
      returnData = {
        gameName: project.gameName,
        appId: project.appId,
        projectNumber: project.projectNumber,
        metadata: project.metadata,
        reports: project.reports || []
      }
      logger.info('Using GitHub project data for game details result')
    }

    // If we have no project data, check RedisSearch
    if (!returnData && appId) {
      const games = await searchGamesInRedis(null, appId)
      if (games.length > 0) {
        const redisResult = games[0]
        if (redisResult) {
          const gameImages = await generateImageLinksFromAppId(appId)
          returnData = {
            gameName: redisResult.name,
            appId: Number(appId),
            projectNumber: null,
            metadata: {
              poster: gameImages.poster,
              hero: gameImages.hero,
              background: gameImages.background,
              banner: gameImages.banner
            },
            reports: []
          }
          logger.info('Using local RedisSearch data for game details result')
        }
      }
    }

    if (!returnData && includeExternal && appId) {
      const steamResult = await fetchSteamStoreGameDetails(appId)
      if (steamResult && steamResult.name) {
        const gameImages = await generateImageLinksFromAppId(appId)
        returnData = {
          gameName: steamResult.name,
          appId: Number(appId),
          projectNumber: null,
          metadata: {
            poster: gameImages.poster,
            hero: gameImages.hero,
            background: gameImages.background,
            banner: gameImages.banner
          },
          reports: []
        }
        logger.info('Using Steam store API data for game details result')
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
app.get('/deck-verified/api/v1/issue_labels', async (_req: Request, res: Response) => {
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

/**
 * Get the report form schema from the GitHub repository.
 *
 * @returns {object} 200 - An array of label objects.
 * @returns {object} 500 - Internal server error.
 */
app.get('/deck-verified/api/v1/report_form', async (_req: Request, res: Response) => {
  try {
    const template = await fetchGameReportTemplate()
    if (!template) {
      return res.status(204).json({})
    }
    const hardware = await fetchHardwareInfo()
    if (!hardware) {
      return res.status(204).json({})
    }
    const schema = await fetchReportBodySchema()
    if (!schema) {
      return res.status(204).json({})
    }

    const reportFormDetails: GameReportForm = {
      template: template,
      hardware: hardware,
      schema: schema
    }

    return res.json(reportFormDetails)
  } catch (error) {
    logger.error('Error:', error)
    return res.status(500).json({ error: 'Failed to fetch labels' })
  }
})

// Custom 404 response
app.use((_req: Request, res: Response) => {
  return res.status(404).json({ error: 'Not Found' })
})

const startServer = async () => {
  try {
    await connectToRedis()

    // Continue with the rest of the script after Redis is connected
    logger.info('Redis connected. Proceeding with the rest of the script...')

    // Optionally, run scheduled tasks
    const noScheduledTasks = process.argv.includes('--no-scheduled-tasks')
    if (!noScheduledTasks) {
      // Schedule updateGameIndex to run every hour
      logger.info('Starting scheduled tasks')
      setInterval(updateGameIndex, 3600 * 1000)
      // Optionally run on start also
      if (config.runScheduledTaskOnStart) {
        await updateGameIndex()
      }
    } else {
      logger.info('Running with scheduled tasks disabled.')
    }

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
