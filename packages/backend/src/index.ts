import express from 'express'
import { format } from 'date-fns'
import type { Request, Response, NextFunction } from 'express'
import helmet from 'helmet'
import config from './config'
import { generalLimiter } from './rateLimiter'
import logger, { logMetric } from './logger'
import {
  connectToRedis,
  storeGameInRedis,
  searchGamesInRedis, getGamesWithReports
} from './redis'
import {
  fetchIssueLabels, fetchPopularReports,
  fetchProjectsByAppIdOrGameName, fetchRecentReports,
  fetchGameReportTemplate, updateGameIndex, fetchHardwareInfo, fetchReportBodySchema
} from './github'
import {
  fetchJosh5Avatar, fetchSDHQReview,
  fetchSteamGameSuggestions,
  fetchSteamStoreGameDetails,
  generateImageLinksFromAppId, generateSDHQReviewData
} from './helpers'
import {
  GameDetails,
  GameMetadata,
  GameReport,
  GameReportForm,
  GameSearchResult,
  SDHQReview
} from '../../shared/src/game'

// Log shutdown requests
process.on('SIGINT', () => {
  logger.info('Shutting down server...')
  process.exit(0)
})

// Init Express app
const app = express()

// Trust the first reverse proxy
if (config.proxyCount > 0) {
  app.set('trust proxy', config.proxyCount)
}

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

  // Define paths that should not be logged
  let logRequest = true
  if (req.path === '/deck-verified/api/v1/health') {
    logRequest = false
  }

  if (logRequest) {
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
        x_forwarded_proto: req.headers['x-forwarded-proto'] || '',
        method: req.method,
        path2: req.path,
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
  }
  next()
})

/**
 * Get the most recent reports from the GitHub repository.
 *
 * @returns {object[]} 200 - Service is healthy.
 * @returns {object} 500 - Internal server error.
 */
app.get('/deck-verified/api/v1/health', async (req: Request, res: Response) => {
  const proto = req.headers['x-forwarded-proto'] || req.protocol
  const baseUrl = `${proto}://${req.get('host')}`
  res.status(200).json({
    status: 'OK',
    baseUrl: baseUrl,
    remote_ip: req.ip,
    protocol: req.protocol,
    method: req.method,
    path: req.originalUrl,
    referer: req.headers['referer'] || '-',
    user_agent: req.headers['user-agent'] || ''
  })
})

/**
 * Fetch an image, log a metric, and return the image.
 *
 * @route GET /deck-verified/api/v1/images/plugin/:pluginName/avatar.jpg
 * @param {string} pluginName - The name of the plugin being tracked.
 *
 * @returns {image} 200 - Returns the requested image.
 * @returns {object} 500 - Internal server error.
 */
app.get('/deck-verified/api/v1/images/plugin/:pluginName/avatar.jpg', async (req: Request, res: Response) => {
  const { pluginName } = req.params
  const requestIp = req.ips.length > 0 ? req.ips[0] : req.ip
  const userAgent = req.headers['user-agent'] || 'Unknown'

  // Log the metric
  logMetric('plugin_viewed', pluginName, {
    request_ip: requestIp,
    user_agent: userAgent
  })

  try {
    const imageBuffer = await fetchJosh5Avatar()
    if (!imageBuffer) {
      return res.status(500).json({ error: 'Failed to fetch image' })
    }
    logger.info(`Serving image for plugin: ${pluginName}`)
    res.setHeader('Content-Type', 'image/jpeg')
    return res.send(imageBuffer)
  } catch (error) {
    logger.error('Error fetching image:', error)
    return res.status(500).json({ error: 'Failed to fetch image' })
  }
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
 * Fetch a paginated list of games with reports from the database.
 *
 * This endpoint retrieves a filtered list of games that have at least one report,
 * sorted by the number of reports in descending order. Supports pagination
 * through `from` and `limit` query parameters.
 *
 * @queryParam from {number} - The number to fetch from for pagination.
 * @queryParam limit {number} - The max number of reports to return for pagination.
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
 *     "appId": 1151640,
 *     "metadata": {
 *       "banner": "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1151640/header.jpg",
 *       "poster": "https://steamcdn-a.akamaihd.net/steam/apps/1151640/library_600x900.jpg",
 *       "hero": "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1151640/library_hero.jpg",
 *       "background": "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1151640/page_bg_generated_v6b.jpg"
 *     },
 *     "reportCount": 2
 *   }
 * ]
 */
app.get('/deck-verified/api/v1/games_with_reports', async (req: Request, res: Response) => {
  const orderBy = req.query['orderBy'] === 'appname' ? 'appname' : 'reportcount'
  const orderDirection = req.query['orderDirection'] === 'ASC' ? 'ASC' : 'DESC'
  const from = parseInt(req.query['from'] as string, 10) || 0
  const limit = Math.min(parseInt(req.query['limit'] as string, 10) || 100, 500)
  if (from < 0 || limit <= 0) {
    return res.status(400).json({ error: 'Invalid pagination parameters' })
  }

  try {
    const gamesWithReports = await getGamesWithReports(from, limit, orderBy, orderDirection)
    if (gamesWithReports.length > 0) {
      const results: GameSearchResult[] = await Promise.all(
        gamesWithReports.map(async (game) => {
          const metadata: GameMetadata = {
            banner: game.banner || null,
            poster: game.poster || null,
            hero: null,
            background: null
          }

          if (game.appId) {
            const gameImages = await generateImageLinksFromAppId(String(game.appId))
            metadata.banner = metadata.banner ?? gameImages.banner
            metadata.poster = metadata.poster ?? gameImages.poster
            metadata.hero = gameImages.hero
            metadata.background = gameImages.background
          }

          return {
            gameName: game.name,
            appId: Number(game.appId),
            metadata,
            reportCount: game.reportCount ?? 0
          }
        })
      )

      return res.json(results)
    }

    return res.status(204).json([])
  } catch (error) {
    logger.error('Error retrieving games with reports:', error)
    return res.status(500).json({ error: 'Failed to retrieve games with reports' })
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
 *     "appId": 1151640,
 *     "metadata": {
 *       "banner": "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1151640/header.jpg",
 *       "poster": "https://steamcdn-a.akamaihd.net/steam/apps/1151640/library_600x900.jpg",
 *       "hero": "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1151640/library_hero.jpg",
 *       "background": "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1151640/page_bg_generated_v6b.jpg"
 *     },
 *     "reportCount": 2
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
            const gameImages = await generateImageLinksFromAppId(result.appId)
            const appId = result.appId && result.appId.trim() !== '' ? result.appId : null
            await storeGameInRedis({
              gameName: result.name,
              appId: appId,
              banner: gameImages.banner,
              poster: gameImages.poster
            })
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
            metadata: metadata as GameMetadata,
            reportCount: game.reportCount ?? 0
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
  const requestIp = req.ips.length > 0 ? req.ips[0] : req.ip
  const userAgent = req.headers['user-agent'] || 'Unknown'

  if (!appId && !gameName) {
    return res.status(400).json({ error: 'No valid query parameter' })
  }

  // Start with a partial GameDetails object
  let returnData: Partial<GameDetails> = {
    reports: [],
    external_reviews: []
  }

  try {
    // First try GitHub project data
    const project = await fetchProjectsByAppIdOrGameName(appId, gameName, null)
    if (project && project.projectNumber) {
      returnData = {
        ...returnData,
        gameName: project.gameName,
        appId: project.appId,
        projectNumber: project.projectNumber,
        metadata: project.metadata,
        reports: project.reports || [],
        external_reviews: []
      }
      logger.info('Using GitHub project data for game details result')
    }

    // If we have no project data, check RedisSearch
    if (!returnData.gameName && appId) {
      const games = await searchGamesInRedis(null, appId)
      if (games.length > 0) {
        const redisResult = games[0]
        if (redisResult) {
          const gameImages = await generateImageLinksFromAppId(appId)
          returnData = {
            ...returnData,
            gameName: redisResult.name,
            appId: Number(appId),
            projectNumber: null,
            metadata: {
              poster: gameImages.poster,
              hero: gameImages.hero,
              background: gameImages.background,
              banner: gameImages.banner
            },
            reports: [],
            external_reviews: []
          }
          logger.info('Using local RedisSearch data for game details result')
        }
      }
    }

    // Fetch steam store results only if no other results were found our internal search
    if (!returnData.gameName && includeExternal && appId) {
      const steamResult = await fetchSteamStoreGameDetails(appId)
      if (steamResult && steamResult.name) {
        const gameImages = await generateImageLinksFromAppId(appId)
        returnData = {
          ...returnData,
          gameName: steamResult.name,
          appId: Number(appId),
          projectNumber: null,
          metadata: {
            poster: gameImages.poster,
            hero: gameImages.hero,
            background: gameImages.background,
            banner: gameImages.banner
          },
          reports: [],
          external_reviews: []
        }
        logger.info('Using Steam store API data for game details result')
      }
    }

    // Add additional external source data based on appId
    if (includeExternal && appId) {
      const sdhqReviews = await generateSDHQReviewData(appId)
      if (sdhqReviews.length > 0) {
        returnData.external_reviews = [
          ...(returnData.external_reviews || []),
          ...sdhqReviews
        ]
      }
    }

    // Log the metric for the game details lookup
    const metricName = 'game_details'
    const metricValue = appId || gameName
    logMetric(metricName, metricValue, {
      request_ip: requestIp,
      user_agent: userAgent,
      game_name: returnData?.gameName || gameName,
      app_id: returnData?.appId || appId,
      report_count: returnData?.reports?.length || 0
    })

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

/**
 * Generate sitemap.xml dynamically based on games with reports.
 *
 * @returns {string} XML - Sitemap content.
 */
app.get('/sitemap.xml', async (req: Request, res: Response) => {
  try {
    const proto = req.headers['x-forwarded-proto'] || req.protocol
    const baseUrl = `${proto}://${req.get('host')}`
    const lastModDate = format(new Date(), 'yyyy-MM-dd') // Current date for lastmod
    const staticPages = [
      { loc: `${baseUrl}/deck-verified/`, priority: '1.0' },
      { loc: `${baseUrl}/deck-verified/games-with-reports`, priority: '0.8' }
    ]

    // Fetch all games with reports from RedisSearch
    const gamesWithReports = await getGamesWithReports(0, 500) // Limit 500
    const gamePages = gamesWithReports
      .filter((game) => game.appId) // Ensure appId exists
      .map((game) => ({
        loc: `${baseUrl}/deck-verified/app/${game.appId}`,
        priority: '0.7'
      }))

    // Construct XML sitemap
    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticPages, ...gamePages]
      .map(
        (page) => `  <url>
    <loc>${page.loc}</loc>
    <lastmod>${lastModDate}</lastmod>
    <priority>${page.priority}</priority>
  </url>`
      )
      .join('\n')}
</urlset>`

    res.header('Content-Type', 'application/xml').send(sitemapXml)
  } catch (error) {
    logger.error('Error generating sitemap.xml:', error)
    res.status(500).send('Failed to generate sitemap.xml')
  }
})

/**
 * Generate robots.txt dynamically.
 *
 * @returns {string} - Robots.txt content.
 */
app.get('/robots.txt', async (req: Request, res: Response) => {
  const proto = req.headers['x-forwarded-proto'] || req.protocol
  const baseUrl = `${proto}://${req.get('host')}`
  const robotsTxt = `User-agent: *
Disallow:

Sitemap: ${baseUrl}/sitemap.xml`

  res.header('Content-Type', 'text/plain').send(robotsTxt)
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
      logger.info(`Starting scheduled tasks to run every ${3600 * 1000} milliseconds`)
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
