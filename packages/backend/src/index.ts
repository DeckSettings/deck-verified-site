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
  searchGamesInRedis, getGamesWithReports,
  logAggregatedMetric, getAggregatedMetrics
} from './redis'
import {
  fetchIssueLabels, fetchPopularReports,
  fetchProjectsByAppIdOrGameName, fetchRecentReports,
  fetchGameReportTemplate, updateGameIndex, fetchHardwareInfo, fetchReportBodySchema
} from './github'
import {
  fetchJosh5Avatar,
  fetchSteamGameSuggestions,
  fetchSteamStoreGameDetails,
  generateImageLinksFromAppId,
  generateSDHQReviewData,
  generateSDGReviewData
} from './helpers'
import type {
  AggregateMetricResponse,
  GameDetails,
  GameDetailsRequestMetricResult,
  GameMetadata,
  GameReportForm,
  GameSearchResult,
  GameSearchCache
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

  // If both parameters are missing, return an error.
  if (!appId && !gameName) {
    return res.status(400).json({ error: 'No valid query parameter' })
  }

  // Start with a partial GameDetails object.
  let returnData: Partial<GameDetails> = {
    reports: [],
    external_reviews: []
  }

  // Start with initial discovered values.
  let discoveredAppId: number | null = appId ? Number(appId) : null
  let discoveredGameName: string | null = gameName

  try {
    // First try GitHub project data.
    const project = await fetchProjectsByAppIdOrGameName(discoveredAppId !== null ? discoveredAppId.toString() : null, discoveredGameName, null)
    if (project && project.projectNumber) {
      // Update discovered values.
      discoveredAppId = project.appId // project.appId is a number.
      discoveredGameName = project.gameName
      returnData = {
        ...returnData,
        gameName: discoveredGameName,
        appId: discoveredAppId,
        projectNumber: project.projectNumber,
        metadata: project.metadata,
        reports: project.reports || [],
        external_reviews: []
      }
      logger.info('Using GitHub project data for game details result')
    }

    // If no project data found, try RedisSearch.
    if (!returnData.gameName) {
      let games: GameSearchCache[] = []
      if (discoveredAppId !== null) {
        games = await searchGamesInRedis(null, discoveredAppId.toString())
      } else if (discoveredGameName) {
        games = await searchGamesInRedis(null, null, discoveredGameName)
      }
      if (games.length > 0) {
        const redisResult = games[0]
        if (redisResult) {
          // Update discoveredAppId if missing.
          if (discoveredAppId === null && redisResult.appId) {
            discoveredAppId = Number(redisResult.appId)
          }
          discoveredGameName = redisResult.name
          let metadata: GameMetadata = {
            poster: null,
            hero: null,
            background: null,
            banner: null
          }
          // Only generate image links if we have a valid discoveredAppId.
          if (discoveredAppId !== null) {
            const gameImages = await generateImageLinksFromAppId(discoveredAppId.toString())
            metadata = {
              poster: gameImages.poster,
              hero: gameImages.hero,
              background: gameImages.background,
              banner: gameImages.banner
            }
          }
          returnData = {
            ...returnData,
            gameName: redisResult.name,
            appId: discoveredAppId,
            projectNumber: null,
            metadata: metadata,
            reports: [],
            external_reviews: []
          }
          logger.info('Using local RedisSearch data for game details result')
        }
      }
    }

    // Fetch steam store results only if no other results were found our internal search
    if (!returnData.gameName && includeExternal && discoveredAppId !== null) {
      const steamResult = await fetchSteamStoreGameDetails(discoveredAppId.toString())
      if (steamResult && steamResult.name) {
        const gameImages = await generateImageLinksFromAppId(discoveredAppId.toString())
        discoveredGameName = steamResult.name
        returnData = {
          ...returnData,
          gameName: steamResult.name,
          appId: discoveredAppId,
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
    if (includeExternal && discoveredAppId !== null) {
      const sdhqReviews = await generateSDHQReviewData(discoveredAppId.toString())
      if (sdhqReviews.length > 0) {
        returnData.external_reviews = [
          ...(returnData.external_reviews || []),
          ...sdhqReviews
        ]
      }
      const sdgVideoReviews = await generateSDGReviewData(discoveredAppId.toString())
      if (sdgVideoReviews.length > 0) {
        returnData.external_reviews = [
          ...(returnData.external_reviews || []),
          ...sdgVideoReviews
        ]
      }
    }

    // Log the metric for the game details lookup
    const metricName = 'game_details'
    const metricValue = `${returnData?.appId ?? discoveredAppId ?? '_'}:${returnData?.gameName ?? discoveredGameName ?? '_'}`
    logMetric(metricName, metricValue, {
      request_ip: requestIp,
      user_agent: userAgent,
      game_name: returnData?.gameName || discoveredGameName,
      app_id: returnData?.appId || discoveredAppId,
      report_count: returnData?.reports?.length || 0
    })
    // Cache the aggregate metric for the game details lookup
    await logAggregatedMetric(metricName, metricValue)

    if (!returnData || !returnData.gameName) {
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
 * Get aggregated game_details metrics
 *
 * @queryParam days {string} - The number of past days to include in the aggregation (max 7). Defaults to 7.
 * @queryParam min_report_count {string} - The minimum aggregated report count a metric must have to be returned. Defaults to 0.
 *
 * @returns {object} 200 - An object containing the metric name, days used, minimum report count filter, and an array of metric results.
 * @returns {object} 500 - Internal server error.
 *
 * @example
 * {
 *   "metric": "game_details",
 *   "days": 7,
 *   "min_report_count": 5,
 *   "results": [
 *     {
 *       "metricValue": "1172380",
 *       "count": 42
 *     },
 *     {
 *       "metricValue": "SomeGameName",
 *       "count": 36
 *     }
 *   ]
 * }
 */
app.get('/deck-verified/api/v1/metric/game_details', async (req: Request, res: Response) => {
  try {
    // Parse query parameters
    const days = Math.min(parseInt(req.query['days'] as string, 10) || 7, 7)
    const limit = Math.min(parseInt(req.query['limit'] as string, 10) || 100, 500)
    const minReportCount = req.query['min_report_count']
      ? parseInt(req.query['min_report_count'] as string, 10)
      : 0
    const maxReportCount = req.query['max_report_count']
      ? parseInt(req.query['max_report_count'] as string, 10)
      : Infinity
    const disableDedupe = req.query.disable_dedupe === 'true'
    const disableFilter = req.query.disable_filter === 'true'

    // Retrieve the aggregated metrics for the past `days` for 'game_details'
    const aggregatedMetrics = await getAggregatedMetrics('game_details', days, limit)

    // Transform the results by extracting app_id and game_name from metricValue
    const transformedMetrics = await Promise.all(
      aggregatedMetrics.map(async metric => {
        const [rawAppId, rawGameName] = metric.metricValue.split(':')
        const app_id =
          rawAppId === '_' || rawAppId.trim() === '' || isNaN(Number(rawAppId))
            ? null
            : Number(rawAppId)
        const game_name =
          rawGameName === '_' || rawGameName.trim() === '' ? null : rawGameName

        // Start with the base result per your interface
        let result: GameDetailsRequestMetricResult = {
          app_id,
          game_name,
          count: metric.count,
          report_count: 0
        }

        // Enrich the result with metadata
        let metadata: GameMetadata = {
          banner: null,
          poster: null,
          hero: null,
          background: null
        }
        // Search by AppId if provided
        let games = undefined
        if (app_id !== null) {
          games = await searchGamesInRedis(null, String(app_id))
        } else if (game_name !== null) {
          games = await searchGamesInRedis(null, null, game_name)
        }
        if (games && games.length > 0) {
          const redisResult = games[0]
          metadata = {
            banner: redisResult.banner ?? null,
            poster: redisResult.poster ?? null,
            hero: null,
            background: null
          }
          if (redisResult.reportCount) {
            result.report_count = redisResult.reportCount ?? 0
          }
        }
        // Fill in missing data if app_id is available
        if (app_id !== null) {
          // Generate image links if app_id is not null
          const gameImages = await generateImageLinksFromAppId(String(app_id))
          metadata = {
            banner: metadata.banner ?? gameImages.banner,
            poster: metadata.poster ?? gameImages.poster,
            hero: metadata.hero ?? gameImages.hero,
            background: metadata.background ?? gameImages.background
          }
        }

        // Add the metadata property to the result
        return { ...result, metadata }
      })
    )

    // Deduplicate metrics
    const dedupeMetrics = (metricsArray: GameDetailsRequestMetricResult[]): GameDetailsRequestMetricResult[] => {
      const dedupeMetricsGroup: GameDetailsRequestMetricResult[] = []
      for (const rec of metricsArray) {
        // Try to find a matching group.
        let foundGroup: GameDetailsRequestMetricResult | undefined

        // If the record has a game_name, try to match (case-insensitive).
        if (rec.game_name) {
          const recGameName = rec.game_name.toLowerCase()
          foundGroup = dedupeMetricsGroup.find(g => g.game_name && g.game_name.toLowerCase() === recGameName)
        }


        // If no match by game_name and we have a valid app_id, try matching by app_id.
        if (!foundGroup && rec.app_id !== null) {
          foundGroup = dedupeMetricsGroup.find(g => g.app_id === rec.app_id)
        }

        if (foundGroup) {
          // Merge counts.
          foundGroup.count = (foundGroup.count ?? 0) + (rec.count ?? 0)
          foundGroup.report_count = (foundGroup.report_count ?? 0) + (rec.report_count ?? 0)

          // If the current record has both app_id and game_name,
          // it takes priority and overwrites the values in the group.
          if (rec.app_id !== null && rec.game_name) {
            foundGroup.app_id = rec.app_id
            foundGroup.game_name = rec.game_name
            foundGroup.metadata = rec.metadata
          } else {
            // Otherwise, update only missing values.
            if (foundGroup.app_id === null && rec.app_id !== null) {
              foundGroup.app_id = rec.app_id
              foundGroup.metadata = rec.metadata
            }
            if (!foundGroup.game_name && rec.game_name) {
              foundGroup.game_name = rec.game_name
            }
          }
        } else {
          // No matching group was found; add this record as a new group.
          dedupeMetricsGroup.push({
            ...rec,
            count: rec.count ?? 0,
            report_count: rec.report_count ?? 0
          })
        }
      }
      return dedupeMetricsGroup
    }
    const dedupePass1 = dedupeMetrics(transformedMetrics)
    let dedupePass2 = dedupeMetrics(dedupePass1)
    if (disableDedupe) {
      dedupePass2 = transformedMetrics
    }

    // Filter by report count
    let filteredMetrics = Object.values(dedupePass2).filter(metric => {
      // Filter out if no name or app id exists
      if (!metric.app_id && !metric.game_name) {
        return false
      }
      // Assume report_count is 0 if null or undefined
      const reportCount = metric.report_count ?? 0
      return reportCount >= minReportCount && reportCount <= maxReportCount
    })
    if (disableFilter) {
      filteredMetrics = dedupePass2
    }

    // Build the response object
    const returnData: AggregateMetricResponse = {
      metric: 'game_details',
      days,
      results: filteredMetrics
    }

    // Return the response as JSON
    return res.status(200).json(returnData)
  } catch (error) {
    logger.error('Error retrieving aggregated game_details metrics:', error)
    return res.status(500).json({ error: 'Internal Server Error' })
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
