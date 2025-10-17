import './instrument'
import * as Sentry from '@sentry/node'
import express from 'express'
import { format } from 'date-fns'
import type { Request, Response, NextFunction } from 'express'
import helmet from 'helmet'
import config from './config'
import { generalLimiter } from './rateLimiter'
import logger, { logMetric } from './logger'
import {
  buildAuthResultCors,
  githubAuthStartHandler,
  githubAuthCallbackHandler,
  githubAuthResultHandler,
  githubAuthRefreshHandler,
} from './auth'
import {
  connectToRedis,
  storeGameInRedis,
  searchGamesInRedis, getGamesWithReports,
  logAggregatedMetric, getAggregatedMetrics,
  getTaskProgress,
} from './redis'
import {
  fetchIssueLabels, fetchPopularReports,
  fetchProjectsByAppIdOrGameName, fetchRecentReports,
  fetchGameReportTemplate, fetchHardwareInfo,
  fetchReportBodySchema, fetchReports,
} from './github'
import {
  fetchJosh5Avatar,
  generateImageLinksFromAppId,
  generateGameRatingsSummary,
} from './helpers'
import type {
  AggregateMetricResponse,
  GameDetails,
  GameDetailsRequestMetricResult,
  GameMetadata,
  GameReportForm,
  GameSearchResult,
  GameSearchCache,
  UserGameReport,
} from '../../shared/src/game'
import dvAuth from './middleware/dvAuth'
import {
  appendNotification,
  clearNotifications,
  loadNotifications,
  removeNotification,
  sanitizeNotificationInput,
} from './notifications'
import { githubMonitorQueue } from './jobs'
import { initializeWorkers } from './jobs/worker'
import { initScheduledTasks } from './jobs/scheduler'
import { generateIsThereAnyDealPriceSummary } from './external/itad'
import { fetchSteamGameSuggestions, fetchSteamStoreGameDetails } from './external/steam'
import { generateSDHQReviewData } from './external/sdhq'
import { fetchBlogReviewSummary } from './external/bloggerapi'
import { parseReportBody } from './helpers'

const delay = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

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
        remote_ip: req.ip,
      }
      logger.info(logData)
    })
  }
  next()
})

/**
 * Start GitHub PKCE OAuth flow.
 *
 * @queryParam mode {string} - Optional login mode to adjust behaviour (e.g., different redirect target).
 *
 * @returns {object} 302 - Redirects to GitHub authorise URL on success.
 * @returns {object} 404 - Auth disabled.
 * @returns {object} 500 - Failed to initiate GitHub auth flow.
 */
app.get('/deck-verified/api/auth/start', buildAuthResultCors(), async (req: Request, res: Response) => {
  if (!config.githubAppConfigured) {
    res.status(404).send('Auth disabled')
    return
  }
  try {
    const mode = typeof req.query.mode === 'string' ? req.query.mode : undefined
    const toBaseUrl = typeof req.query.to_base_url === 'string' ? req.query.to_base_url : undefined
    const toLocationB64 = typeof req.query.to_location === 'string' ? req.query.to_location : undefined
    const authorizeUrl = await githubAuthStartHandler({ mode, toBaseUrl, toLocationB64 })

    if (authorizeUrl) {
      if (mode === 'capacitor') {
        res.json({ url: authorizeUrl })
      } else {
        res.redirect(authorizeUrl)
      }
      return
    }

    logger.error('Failed to initiate GitHub auth flow: empty authorizeUrl')
    res.status(500).send('Auth start error')
  } catch (error) {
    logger.error('Failed to initiate GitHub auth flow:', error)
    res.status(500).send('Auth start error')
  }
})

/**
 * OAuth callback: exchanges code for tokens and redirects to the completion page.
 *
 * @queryParam code {string} - Authorization code from GitHub.
 * @queryParam state {string} - PKCE state value used to validate the request.
 *
 * @returns {object} 302 - Redirects to /auth/complete on success.
 * @returns {object} 400 - Missing or invalid `code` or `state`.
 * @returns {object} 404 - Auth disabled.
 * @returns {object} 500 - Internal server error during token exchange.
 */
app.get('/deck-verified/api/auth/callback', async (req: Request, res: Response) => {
  if (!config.githubAppConfigured) {
    res.status(404).send('Auth disabled')
    return
  }
  const { code, state } = req.query as { code?: string; state?: string }
  if (!code || !state) {
    res.status(400).send('Missing code or state')
    return
  }
  try {
    const { redirectUrl } = await githubAuthCallbackHandler(code, state)
    res.redirect(302, redirectUrl)
  } catch (error) {
    logger.error('OAuth callback error:', error)
    res.status(500).send('OAuth callback error')
  }
})

/**
 * Auth result: returns tokens for a given state exactly once.
 *
 * @queryParam state {string} - PKCE state value for retrieving the auth result.
 *
 * @returns {object} 200 - Auth result payload containing tokens.
 * @returns {object} 400 - Missing or invalid `state`.
 * @returns {object} 404 - Auth disabled, or state not found / already claimed.
 * @returns {object} 500 - Internal server error.
 */
app.use('/deck-verified/api/auth/result', buildAuthResultCors())
app.get('/deck-verified/api/auth/result', async (req: Request, res: Response) => {
  if (!config.githubAppConfigured) {
    res.status(404).json({ error: 'Auth disabled' })
    return
  }
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  if (!state) {
    res.status(400).json({ error: 'Missing state' })
    return
  }
  try {
    const payload = await githubAuthResultHandler(state)
    res.json(payload)
  } catch (error: any) {
    const msg = String(error?.message || '')
    if (msg.includes('not_found_or_already_claimed')) {
      res.status(404).json({ error: 'Not found or already claimed' })
    } else {
      logger.error('Auth result error:', error)
      res.status(500).json({ error: 'Auth result error' })
    }
  }
})

/**
 * Refresh access token using refresh_token.
 *
 * @bodyParam refresh_token {string} - The refresh token to exchange for a new access token.
 *
 * @returns {object} 200 - New access token (and refresh token, if applicable).
 * @returns {object} 400 - Missing or invalid `refresh_token`.
 * @returns {object} 404 - Auth disabled.
 * @returns {object} 500 - Internal server error during refresh.
 */
app.post('/deck-verified/api/auth/refresh', express.json(), async (req: Request, res: Response) => {
  if (!config.githubAppConfigured) {
    res.status(404).json({ error: 'Auth disabled' })
    return
  }
  const refreshToken = req.body?.refresh_token as string | undefined
  if (!refreshToken) {
    res.status(400).json({ error: 'Missing refresh token' })
    return
  }
  try {
    const resp = await githubAuthRefreshHandler(refreshToken)
    res.status(resp?.error ? 401 : 200).json(resp)
  } catch (error) {
    logger.error('Error refreshing token:', error)
    res.status(500).json({ error: 'Refresh error' })
  }
})

/**
 * Long poll for notifications belonging to the authenticated DV user.
 *
 * @queryParam since {number} - Optional timestamp; if provided, notifications updated after this timestamp are returned.
 *
 * @returns {object} 200 - Envelope of notifications for the user.
 * @returns {object} 401 - DV token missing or invalid.
 */
app.get('/deck-verified/api/dv/notifications', dvAuth, async (req: Request, res: Response) => {
  const identity = res.locals.dvIdentity
  if (!identity) {
    res.status(401).json({ error: 'missing_identity' } as any)
    return
  }

  const sinceParam = typeof req.query.since === 'string' ? Number(req.query.since) : null
  const since = typeof sinceParam === 'number' && Number.isFinite(sinceParam) && sinceParam >= 0 ? sinceParam : null

  const envelope = await loadNotifications(identity.id)
  res.json(envelope)
})

const EVENT_LONG_POLL_TIMEOUT_MS = 25_000
const EVENT_LONG_POLL_INTERVAL_MS = 1_000

app.post('/deck-verified/api/tasks', dvAuth, express.json(), async (req: Request, res: Response) => {
  const identity = res.locals.dvIdentity
  if (!identity) {
    res.status(401).json({ error: 'missing_identity' } as any)
    return
  }

  const { taskId, taskType, payload } = req.body ?? {}
  if (typeof taskId !== 'string' || !taskId) {
    res.status(400).json({ error: 'invalid_task_id' })
    return
  }
  if (typeof taskType !== 'string' || !taskType) {
    res.status(400).json({ error: 'invalid_task_type' })
    return
  }

  if (taskType === 'github:actions:monitor') {
    const githubToken = typeof req.headers['x-github-token'] === 'string' ? req.headers['x-github-token'] : null
    if (!githubToken) {
      res.status(400).json({ error: 'missing_github_token' })
      return
    }

    const issueNumber = Number(payload?.issueNumber)
    const issueUrl = typeof payload?.issueUrl === 'string' ? payload.issueUrl : null
    const createdAt = typeof payload?.createdAt === 'string' ? payload.createdAt : null
    const repositoryInput = payload?.repository

    let workflowType = typeof payload?.workflowType === 'string' ? payload.workflowType : 'validation'
    let operation: string | null = typeof payload?.operation === 'string' ? payload.operation : null

    if (!Number.isFinite(issueNumber) || !issueUrl || !createdAt) {
      res.status(400).json({ error: 'invalid_monitor_payload' })
      return
    }

    let repositoryPayload: { owner: string; name: string } | undefined
    if (repositoryInput && typeof repositoryInput === 'object') {
      const owner = typeof repositoryInput.owner === 'string' ? repositoryInput.owner : null
      const name = typeof repositoryInput.name === 'string' ? repositoryInput.name : null
      if (owner && name) {
        repositoryPayload = { owner, name }
      }
    }

    const jobPayload = {
      taskId,
      userId: identity.id,
      login: identity.login,
      issueNumber,
      issueUrl,
      createdAt,
      repository: repositoryPayload,
      githubToken,
      workflowType,
      operation,
    }

    await githubMonitorQueue.add('github-monitor-job', jobPayload, {
      removeOnComplete: true,
      attempts: 3,
    })

    res.status(202).json({ taskId, status: 'accepted' })
    return
  }

  res.status(400).json({ error: 'unsupported_task_type' })
})

app.get('/deck-verified/api/tasks/:taskId/progress', dvAuth, async (req: Request, res: Response) => {
  const identity = res.locals.dvIdentity
  if (!identity) {
    res.status(401).json({ error: 'missing_identity' } as any)
    return
  }

  const { taskId } = req.params
  if (!taskId) {
    res.status(400).json({ error: 'invalid_task_id' })
    return
  }

  const lastToken = typeof req.query.last === 'string' ? req.query.last : null
  const timeoutAt = Date.now() + EVENT_LONG_POLL_TIMEOUT_MS
  let aborted = false

  req.on('close', () => {
    aborted = true
  })

  while (!aborted) {
    const progress = await getTaskProgress(identity.id, taskId)
    if (!progress) {
      res.status(404).json({ error: 'task_not_found' })
      return
    }

    if (!lastToken || progress.revision !== lastToken) {
      res.json(progress)
      return
    }

    if (Date.now() >= timeoutAt) {
      res.status(204).end()
      return
    }

    await delay(EVENT_LONG_POLL_INTERVAL_MS)
  }
})


/**
 * Append a notification for the authenticated user.
 */
app.put('/deck-verified/api/dv/notifications', dvAuth, express.json(), async (req: Request, res: Response) => {
  const identity = res.locals.dvIdentity
  if (!identity) {
    res.status(401).json({ error: 'missing_identity' } as any)
    return
  }

  const payload = sanitizeNotificationInput((req.body && ('notification' in req.body)) ? req.body.notification : req.body)
  if (!payload) {
    res.status(400).json({ error: 'invalid_notification_payload' } as any)
    return
  }

  try {
    const envelope = await appendNotification(identity.id, payload)
    res.json(envelope)
  } catch (error) {
    logger.error('Failed to append notification', error)
    res.status(500).json({ error: 'notification_append_failed' } as any)
  }
})

/**
 * Remove all notifications for the authenticated user.
 */
app.delete('/deck-verified/api/dv/notifications', dvAuth, async (req: Request, res: Response) => {
  const identity = res.locals.dvIdentity
  if (!identity) {
    res.status(401).json({ error: 'missing_identity' } as any)
    return
  }
  try {
    const envelope = await clearNotifications(identity.id)
    res.json(envelope)
  } catch (error) {
    logger.error('Failed to clear notifications', error)
    res.status(500).json({ error: 'notification_clear_failed' } as any)
  }
})

/**
 * Remove a single notification by identifier.
 */
app.delete('/deck-verified/api/dv/notifications/:id', dvAuth, async (req: Request, res: Response) => {
  const identity = res.locals.dvIdentity
  if (!identity) {
    res.status(401).json({ error: 'missing_identity' } as any)
    return
  }
  const { id } = req.params
  if (!id) {
    res.status(400).json({ error: 'missing_notification_id' } as any)
    return
  }
  try {
    const envelope = await removeNotification(identity.id, id)
    res.json(envelope)
  } catch (error) {
    logger.error('Failed to remove notification', error)
    res.status(500).json({ error: 'notification_remove_failed' } as any)
  }
})

app.get('/deck-verified/api/user/reports', dvAuth, async (req: Request, res: Response) => {
  const identity = res.locals.dvIdentity
  if (!identity) {
    res.status(401).json({ error: 'missing_identity' })
    return
  }

  const githubToken = typeof req.headers['x-github-token'] === 'string' ? req.headers['x-github-token'] : null
  if (!githubToken) {
    res.status(400).json({ error: 'missing_github_token' })
    return
  }

  try {
    const reports = await fetchReports(
      undefined,
      null,
      identity.login,
      'updated',
      'desc',
      null,
      false,
      githubToken,
    )

    if (!reports) {
      res.status(204).json([])
      return
    }

    const [schema, hardwareInfo] = await Promise.all([fetchReportBodySchema(), fetchHardwareInfo()])

    const hasMissingMetadata = (m: Partial<GameMetadata>): boolean =>
      m.banner == null ||
      m.poster == null ||
      m.hero == null ||
      m.background == null

    const userReports: UserGameReport[] = await Promise.all(
      reports.items.map(async (issue) => {
        const parsedReport = await parseReportBody(issue.body, schema, hardwareInfo)
        let metadata: Partial<GameMetadata> = {
          banner: null,
          poster: null,
          hero: null,
          background: null,
        }
        if (parsedReport.game_name) {
          const games = await searchGamesInRedis(null, null, parsedReport.game_name)
          if (games.length > 0) {
            const redisResult = games[0]
            metadata = {
              banner: metadata.banner ?? redisResult.banner,
              poster: metadata.poster ?? redisResult.poster,
              hero: metadata.hero,
              background: metadata.background,
            }
          }
        }
        if (parsedReport.app_id) {
          if (hasMissingMetadata(metadata)) {
            const games = await searchGamesInRedis(null, parsedReport.app_id.toString(), null)
            if (games.length > 0) {
              const redisResult = games[0]
              metadata = {
                banner: metadata.banner ?? redisResult.banner,
                poster: metadata.poster ?? redisResult.poster,
                hero: metadata.hero,
                background: metadata.background,
              }
            }
          }
          // Generate metadata from AppId links as a fallback if still missing
          if (hasMissingMetadata(metadata)) {
            const fallbackImages = await generateImageLinksFromAppId(String(parsedReport.app_id))
            metadata = {
              banner: metadata.banner ?? fallbackImages.banner,
              poster: metadata.poster ?? fallbackImages.poster,
              hero: metadata.hero ?? fallbackImages.hero,
              background: metadata.background ?? fallbackImages.background,
            }
          }
        }

        return {
          issue,
          parsedReport,
          issueNumber: issue.number,
          issueId: issue.id,
          metadata: metadata as GameMetadata,
        }
      }),
    )

    res.json(userReports)
  } catch (error) {
    logger.error('Failed to fetch user reports', error)
    res.status(500).json({ error: 'failed_to_fetch_user_reports' })
  }
})

/**
 * A simple health check endpoint
 *
 * @returns {object[]} 200 - Service is healthy.
 * @returns {object} 500 - Internal server error.
 */
app.get('/deck-verified/api/v1/health', async (req: Request, res: Response) => {
  const proto = req.headers['x-forwarded-proto'] || req.protocol
  const baseUrl = `${proto}://${req.get('host')}`

  if (req.query.error === 'true') {
    throw new Error('Health check error!')
  }

  res.status(200).json({
    status: 'OK',
    baseUrl: baseUrl,
    remote_ip: req.ip,
    protocol: req.protocol,
    method: req.method,
    path: req.originalUrl,
    referer: req.headers['referer'] || '-',
    user_agent: req.headers['user-agent'] || '',
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

  // Extract optional metadata from GET params
  const plugin_uuid = req.query.id ? String(req.query.id) : undefined
  const plugin_version = req.query.v ? String(req.query.v) : undefined

  // Build the metric object with common properties
  const metricData = {
    request_ip: requestIp,
    user_agent: userAgent,
    ...(plugin_uuid && { plugin_uuid }),
    ...(plugin_version && { plugin_version }),
  }

  // Log the metric with the optional data if available
  logMetric('plugin_viewed', pluginName, metricData)

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
app.get('/deck-verified/api/v1/recent_reports', async (req: Request, res: Response) => {
  try {
    const count = parseInt(req.query.count as string, 10) || 5
    const sortParam = req.query.sortby === 'created' ? 'created' : 'updated'
    const reports = await fetchRecentReports(count, sortParam)
    if (reports && reports?.length > 0) {
      return res.json(reports)
    }
    logger.info('No reports found.')
    return res.status(204).json([]) // 204 No Content
  } catch (error) {
    logger.error('Error fetching recent reports:', error)
    return res.status(500).json({ error: 'Failed to fetch recent reports' })
  }
})

/**
 * Get the most popular reports from the GitHub repository.
 *
 * @returns {object[]} 200 - An array of report objects.
 * @returns {array} 204 - No reports found.
 * @returns {object} 500 - Internal server error.
 */
app.get('/deck-verified/api/v1/popular_reports', async (req: Request, res: Response) => {
  try {
    const count = parseInt(req.query.count as string, 10) || 5
    const reports = await fetchPopularReports(count)
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
            background: null,
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
            reportCount: game.reportCount ?? 0,
          }
        }),
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
              poster: gameImages.poster,
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
            background: null,
          }
          if (game.appId) {
            // Generate image links if appId is not null
            const gameImages = await generateImageLinksFromAppId(String(game.appId))
            metadata = {
              banner: metadata.banner ?? gameImages.banner,
              poster: metadata.poster ?? gameImages.poster,
              hero: metadata.hero ?? gameImages.hero,
              background: metadata.background ?? gameImages.background,
            }
          }
          return {
            gameName: game.name,
            appId: Number(game.appId),
            metadata: metadata as GameMetadata,
            reportCount: game.reportCount ?? 0,
          }
        }),
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
    external_reviews: [],
  }

  // Start with initially discovered values.
  let discoveredAppId: number | null = appId ? Number(appId) : null
  let discoveredGameName: string | null = gameName

  // TODO: Create a list here of AppIDs that we do not return anything for. Things like Proton, Steam Linux Runtime, etc.

  try {
    // First, try GitHub project data.
    const project = await fetchProjectsByAppIdOrGameName(discoveredAppId !== null ? discoveredAppId.toString() : null, discoveredGameName, null, false)
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
        external_reviews: [],
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
            banner: null,
          }
          // Only generate image links if we have a valid discoveredAppId.
          if (discoveredAppId !== null) {
            const gameImages = await generateImageLinksFromAppId(discoveredAppId.toString())
            metadata = {
              poster: gameImages.poster,
              hero: gameImages.hero,
              background: gameImages.background,
              banner: gameImages.banner,
            }
          }
          returnData = {
            ...returnData,
            gameName: redisResult.name,
            appId: discoveredAppId,
            projectNumber: null,
            metadata: metadata,
            reports: [],
            external_reviews: [],
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
            banner: gameImages.banner,
          },
          reports: [],
          external_reviews: [],
        }
        logger.info('Using Steam store API data for game details result')
      }
    }

    // Add a blog summary of report data
    returnData.reports_summary = null
    if (includeExternal || appId == null) {
      if ((returnData.reports?.length ?? 0) > 0 || (returnData.external_reviews?.length ?? 0) > 0) {
        const reportsSummary = await fetchBlogReviewSummary(returnData)
        if (reportsSummary && reportsSummary.length > 0) {
          returnData.reports_summary = reportsSummary
        }
      } else {
        logger.info(returnData)
        logger.info('Skipping blog summary for game details result as we have no reports or external reviews')
      }
    }

    // Add additional external source data based on appId
    if (includeExternal && discoveredAppId !== null) {
      const [sdhqReviews] = await Promise.all([
        generateSDHQReviewData(discoveredAppId.toString()),
      ])
      if (sdhqReviews.length > 0) {
        returnData.external_reviews = [
          ...(returnData.external_reviews || []),
          ...sdhqReviews,
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
      report_count: returnData?.reports?.length || 0,
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
 * Get price information for a game using IsThereAnyDeal data.
 *
 * @queryParam name {string} - Optional game name fallback when appid is not provided.
 * @queryParam appid {string} - Preferred Steam AppID for the lookup.
 *
 * @returns {object} 200 - Price summary for the game.
 * @returns {object} 204 - No price data available for the given query.
 * @returns {object} 400 - Missing required query parameters.
 * @returns {object} 500 - Internal server error.
 */
app.get('/deck-verified/api/v1/game_prices', async (req: Request, res: Response) => {
  const appId = typeof req.query['appid'] === 'string' ? req.query['appid'] : null
  const gameName = typeof req.query['name'] === 'string' ? req.query['name'] : null

  if (!appId && !gameName) {
    return res.status(400).json({ error: 'appid or name is required' })
  }

  try {
    const summary = await generateIsThereAnyDealPriceSummary({ appId, gameName })
    if (!summary) {
      return res.status(204).json({})
    }
    return res.json(summary)
  } catch (error) {
    logger.error('Error fetching price summary:', error)
    return res.status(500).json({ error: 'Failed to fetch price data' })
  }
})

/**
 * Get rating information for a game based on ProtonDB and Steam Deck Verified data.
 *
 * @queryParam name {string} - Optional game name (currently unused).
 * @queryParam appid {string} - Steam AppID for the lookup.
 *
 * @returns {object} 200 - Ratings summary for the game.
 * @returns {object} 204 - No rating data available for the given AppID.
 * @returns {object} 400 - Missing required query parameters.
 * @returns {object} 500 - Internal server error.
 */
app.get('/deck-verified/api/v1/game_ratings', async (req: Request, res: Response) => {
  const appId = typeof req.query['appid'] === 'string' ? req.query['appid'] : null
  const gameName = typeof req.query['name'] === 'string' ? req.query['name'] : null

  if (!appId && !gameName) {
    return res.status(400).json({ error: 'appid or name is required' })
  }

  if (!appId) {
    return res.status(400).json({ error: 'appid lookups are required at this time' })
  }

  try {
    const summary = await generateGameRatingsSummary(appId, gameName)
    if (!summary) {
      return res.status(204).json({})
    }
    return res.json(summary)
  } catch (error) {
    logger.error('Error fetching ratings summary:', error)
    return res.status(500).json({ error: 'Failed to fetch ratings data' })
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
        // IMPORTANT: Ensure we only split the first occurrence of ':'. Some games contain a : in the name.
        const [rawAppId, rawGameName] = metric.metricValue.split(/:(.+)/).slice(0, 2)
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
          report_count: 0,
        }

        // Enrich the result with metadata
        let metadata: GameMetadata = {
          banner: null,
          poster: null,
          hero: null,
          background: null,
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
            background: null,
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
            background: metadata.background ?? gameImages.background,
          }
        }

        // Add the metadata property to the result
        return { ...result, metadata }
      }),
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
            report_count: rec.report_count ?? 0,
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
      results: filteredMetrics,
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
      schema: schema,
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
      { loc: `${baseUrl}/`, priority: '1.0' },
      { loc: `${baseUrl}/about`, priority: '0.9' },
      { loc: `${baseUrl}/decky-plugin`, priority: '0.8' },
      { loc: `${baseUrl}/steam-deck-settings`, priority: '0.8' },
    ]

    // Fetch all games with reports from RedisSearch
    const gamesWithReports = await getGamesWithReports(0, 500) // Limit 500
    const gamePages = gamesWithReports
      .filter((game) => game.appId) // Ensure appId exists
      .map((game) => ({
        loc: `${baseUrl}/app/${game.appId}`,
        priority: '0.7',
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
  </url>`,
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
    const bullmqDisabled = process.argv.includes('--disable-bullmq')
    if (!bullmqDisabled) {
      // Start BullMQ workers
      initializeWorkers()

      // Create scheduled tasks
      await initScheduledTasks()
    } else {
      logger.info('BullMQ disabled via CLI flag. Skipping worker and scheduler initialization.')
    }

    // Enable sentry
    if (process.env.SENTRY_DSN) {
      Sentry.setupExpressErrorHandler(app)
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
