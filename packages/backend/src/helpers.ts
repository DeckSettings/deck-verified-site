import crypto from 'crypto'
import logger from './logger'
import {
  HardwareInfo,
  GameImages,
  GameReportData,
  GitHubReportIssueBodySchema,
  YouTubeOEmbedMetadata,
  ExternalGameReview,
  ExternalGameReviewReportData,
  SDGVideoReview,
  BloggerReportSummary,
  GameDetails,
  GameRatingsSummary,
} from '../../shared/src/game'
import {
  redisLookupSDGReview,
  redisCacheSDGReview,
  redisLookupReportsSummaryBlog,
  redisCacheReportsSummaryBlog,
  acquireRedisLock,
} from './redis'
import NodeCache from 'node-cache'
import config from './config'
import { fetchSteamDeckCompatibility, mapSteamDeckCompatibility } from './external/steam'
import { fetchProtonDbSummary, mapProtonDbSummary } from './external/protondb'

/**
 * Generates a cryptographically secure random state parameter for OAuth flows.
 */
export const generatePkceState = (): string => {
  return crypto.randomBytes(16).toString('hex')
}

/**
 * Generates a cryptographically secure PKCE code verifier using URL-safe base64 encoding.
 */
export const generatePkceCodeVerifier = (): string => {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * Derives a PKCE code challenge from a provided code verifier using SHA-256 hashing.
 */
export const generatePkceCodeChallenge = (verifier: string): string => {
  const hash = crypto.createHash('sha256').update(verifier).digest()
  return Buffer.from(hash).toString('base64url')
}

/**
 * Fetches and caches the Josh5 avatar image from GitHub.
 *
 * This function first checks if the avatar image is present in the in-memory cache.
 * If found, it serves the cached image. Otherwise, it fetches the image using native
 * fetch(), converts the response into a Buffer, caches it, and then returns the Buffer.
 */
const imageCache = new NodeCache({ stdTTL: 3600 })
export const fetchJosh5Avatar = async (): Promise<Buffer | null> => {
  const image_url = 'https://avatars.githubusercontent.com/u/8370197'
  logger.info(`Fetching image from GitHub`)
  try {
    // Check if image is in cache
    const cachedImage = imageCache.get<Buffer>('avatar_image')
    if (cachedImage) {
      logger.info(`Serving cached image`)
      return cachedImage
    }

    // Fetch image using native fetch()
    logger.info(`Fetching image from GitHub`)
    const response = await fetch(image_url)
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    // Cache the image in memory
    imageCache.set('avatar_image', buffer)

    // Return buffer
    return buffer
  } catch (error) {
    logger.error('Error fetching image:', error)
    return null
  }
}

/**
 * Extracts the value associated with a specific heading from a markdown-like text.
 * It searches for the heading and returns the first non-empty line below it.
 */
export const extractHeadingValue = async (
  lines: string[],
  heading: string,
): Promise<string | null> => {
  const headingToFind = `### ${heading}`.toLowerCase()
  const headingIndex = lines.findIndex((line) => line.trim().toLowerCase() === headingToFind)
  if (headingIndex === -1) return null

  const sectionLines: string[] = []
  for (let i = headingIndex + 1; i < lines.length; i++) {
    const currentLine = lines[i]?.trim()
    if (currentLine === undefined) {
      continue
    }
    if (currentLine.toLowerCase().startsWith('### ')) break
    sectionLines.push(currentLine)
  }

  const content = sectionLines.join('\n').trim()
  return content.length > 0 ? content : null
}

/**
 * Convert HTML to Markdown for game settings.
 * Replaces <strong> tags with bold formatting, converts <br> and <p> tags to newlines,
 * removes any remaining HTML tags, replaces HTML entities, and formats lines containing a colon
 * as bullet list items—unless the line is a header. Headers (e.g. lines entirely in bold ending with a colon)
 * remain unchanged.
 *
 * For example, an input of:
 *
 *    > <strong>Graphics Settings:</strong>
 *    > VSYNC: On
 *    > Frame rate limit: 45
 *
 * will be converted to:
 *
 *    > #### Graphics Settings:
 *    > - **VSYNC:** On
 *    > - **Frame rate limit:** 45
 *
 */
export const parseGameSettingsToMarkdown = (htmlString: string): string => {
  let parsedMarkdown = htmlString
  // Convert <strong>...</strong> to #### ...
  parsedMarkdown = parsedMarkdown.replace(/<strong>(.*?)<\/strong>/gi, '#### $1')
  // Replace <br> and <br/> with newlines.
  parsedMarkdown = parsedMarkdown.replace(/<br\s*\/?>/gi, '\n')
  // Replace <p> and </p> with newlines.
  parsedMarkdown = parsedMarkdown.replace(/<\/?p>/gi, '\n')
  // Remove any remaining HTML tags.
  let previousParsedMarkdown
  do {
    previousParsedMarkdown = parsedMarkdown
    parsedMarkdown = parsedMarkdown.replace(/<\/?[a-zA-Z][^>]*?>/g, '')
  } while (parsedMarkdown !== previousParsedMarkdown)
  // Decode basic entities
  parsedMarkdown = parsedMarkdown
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'')

  // Split the processed string into individual lines.
  const lines = parsedMarkdown
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)

  // Process each line to format key-value pairs as bullet list items,
  // except for lines that start with "###" or are header lines.
  const processedLines = lines.map(line => {
    // If the line starts with "###", return it unchanged.
    if (line.startsWith('###')) {
      return line
    }
    // If the line is a header in bold and ends with a colon, return it unchanged.
    if (/^\*\*.*\*\*:\s*$/.test(line)) {
      return line
    }
    // If the line contains a colon, format it as a bullet list item.
    if (line.includes(':')) {
      const parts = line.split(':')
      const key = parts[0].trim()
      const value = parts.slice(1).join(':').trim()
      // Ensure the key is bold.
      const formattedKey = (key.startsWith('**') && key.endsWith('**')) ? key : `**${key}:**`
      return value ? `- ${formattedKey} ${value}` : `- ${formattedKey}`
    }
    // Otherwise, return the line as-is.
    return line
  })

  return processedLines.join('\n')
}

/**
 * Calculates the estimated battery life in minutes.
 *
 * Battery life in minutes is calculated as:
 * (Battery Size in Wh / Average Power Draw in W) * 60.
 */
export const calculatedBatteryLife = async (deviceInfo: HardwareInfo, averagePowerDraw: number): Promise<number> => {
  // Battery life in minutes = (Battery Size in Wh / Average Power Draw in W) * 60
  return Math.round((deviceInfo.battery_size_wh / averagePowerDraw) * 60)
}

/**
 * Converts a string into a numeric hash using a simple algorithm.
 */
export const numberValueFromString = (str: string): number => {
  let num = 0
  for (let i = 0; i < str.length; i++) {
    num = num * 31 + str.charCodeAt(i)
  }
  return num
}

/**
 * Converts a numeric rating (out of 5) into a string of star icons.
 */
export const convertRatingToStars = (rating: number): string => {
  const maxStars = 5
  const filledStars = '★'.repeat(rating)
  const emptyStars = '☆'.repeat(maxStars - rating)
  return filledStars + emptyStars
}

/**
 * Extract unique YouTube video IDs from HTML content.
 */
export const extractYouTubeVideoIds = (html?: string | null): string[] => {
  if (!html) {
    return []
  }

  const cleanedHtml = html.replace(/&amp;/gi, '&')
  const youtubeUrlRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)[^"'\s<>]+)/gi
  const ids = new Set<string>()

  let match: RegExpExecArray | null
  while ((match = youtubeUrlRegex.exec(cleanedHtml)) !== null) {
    const urlCandidate = match[0]

    try {
      const parsedUrl = new URL(urlCandidate)
      const host = parsedUrl.hostname.toLowerCase()
      let videoId = ''

      if (host.endsWith('youtu.be')) {
        videoId = parsedUrl.pathname.split('/').filter(Boolean)[0] || ''
      } else if (parsedUrl.searchParams.has('v')) {
        videoId = parsedUrl.searchParams.get('v') ?? ''
      } else {
        const segments = parsedUrl.pathname.split('/').filter(Boolean)
        videoId = segments.pop() ?? ''
      }

      if (videoId) {
        const sanitizedId = videoId.replace(/[^a-zA-Z0-9_-]/g, '')
        if (sanitizedId) {
          ids.add(sanitizedId)
        }
      }
    } catch (error) {
    }
  }

  return Array.from(ids)
}

/**
 * Extracts the first numeric value found in a string.
 */
export const extractNumbersFromString = (numberString: string | undefined): number | null => {
  if (!numberString) return null
  const match = numberString.match(/[\d.]+/)
  return match ? parseFloat(match[0]) : null
}

/**
 * Converts a wattage string to a numeric string representation.
 * Uses extractNumbersFromString to extract the numeric value.
 */
export const convertWattageToNumber = (wattage: string | undefined): string => {
  if (!wattage) return 'Unknown'
  const extracted = extractNumbersFromString(wattage)
  return extracted ? String(extracted) : 'Unknown'
}

/**
 * Checks if a given value is a valid number (non-NaN and greater than zero).
 */
export const isValidNumber = (value: unknown): value is number => {
  return (
    typeof value === 'number' &&
    !isNaN(value) &&
    value > 0
  )
}

/**
 * Limits a string to 100 characters total.
 * If the string exceeds 100 characters, it is truncated to 97 characters and "..." is appended,
 * ensuring the final string length is exactly 100 characters.
 */
export const limitStringTo100Characters = (input: string): string => {
  if (input.length <= 100) {
    return input
  }
  return input.substring(0, 97) + '...'
}

/**
 * Attempts to coerce various input formats (numbers, raw strings, "app/123", etc.) into a numeric Steam app ID.
 * Returns null when the value cannot be parsed into a finite number.
 */
export const parseAppIdNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null
  }
  const stringValue = typeof value === 'number' ? value.toString() : value
  if (!stringValue) {
    return null
  }
  const numericPart = stringValue.includes('/') ? stringValue.split('/')[1] : stringValue
  const parsed = Number(numericPart)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Normalizes common date representations into an ISO-8601 string, handling ISO-like strings and epoch values in
 * seconds or milliseconds. Returns null when the input cannot be interpreted as a valid timestamp.
 */
export const toIsoDateString = (value: unknown): string | null => {
  if (!value && value !== 0) {
    return null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }
    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
    return trimmed
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const epochMs = value > 1e12 ? value : value * 1000
    const parsed = new Date(epochMs)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
  }
  return null
}

/**
 * Generates game image URLs from a given app ID.
 */
export const generateImageLinksFromAppId = async (appId: string): Promise<GameImages> => {
  return {
    poster: `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/library_600x900.jpg`,
    hero: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`,
    background: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/page_bg_generated_v6b.jpg`,
    banner: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
  }
}

/**
 * Parses the body of a GitHub issue report based on a provided schema.
 * Extracts specific heading values from the markdown content.
 */
export const parseReportBody = async (
  markdown: string,
  schema: GitHubReportIssueBodySchema,
  hardwareInfo: HardwareInfo[],
): Promise<GameReportData> => {
  try {
    const data: Partial<GameReportData> = {}
    const normalizedMarkdown = markdown.replace(/\r\n/g, '\n')
    const lines = normalizedMarkdown.split('\n')

    for (const heading in schema.properties) {
      const valueType = schema.properties[heading]?.type
      const snakeCaseHeading = heading
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^\w_]/g, '')

      let value: string | number | null = await extractHeadingValue(lines, heading)

      // Set "_No response_" to null
      if (value === '_No response_') {
        value = null
      }

      // Convert to number if required by schema
      if (valueType === 'number' && value !== null) {
        const parsedValue = parseFloat(value.replace(/,/g, ''))
        value = isNaN(parsedValue) ? null : parsedValue
      }

      // @ts-expect-error: The key is dynamically generated and TypeScript cannot infer its type
      data[snakeCaseHeading] = value
    }

    // Calculate additional calculated_battery_life_minutes field
    if (data.average_battery_power_draw && isValidNumber(Number(data.average_battery_power_draw)) && Number(data.average_battery_power_draw) > 0) {
      // Match device info from hardwareInfo
      const matchedDevice = hardwareInfo.find(
        (device) => device.name === data.device,
      )
      if (matchedDevice) {
        data.calculated_battery_life_minutes = await calculatedBatteryLife(matchedDevice, Number(data.average_battery_power_draw))
      } else {
        logger.warn(`No matching device found in the hardwareInfo list for: ${data.device}`)
      }
    }

    // Check for required fields and log warnings for missing ones
    if (schema.required) {
      for (const requiredField of schema.required) {
        const snakeCaseField = requiredField
          .toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[^\w_]/g, '')
        if (!(snakeCaseField in data)) {
          logger.warn(`Missing required field: ${requiredField}`)
        }
      }
    }

    return data as GameReportData
  } catch (error) {
    logger.error('Error fetching or parsing schema:', error)
    throw error
  }
}

/**
 * Parses the body of a GitHub project to extract metadata for game assets.
 *
 * @param markdown - The markdown content of the GitHub project.
 * @returns Object containing extracted game data.
 * @throws Throws if there is an error during parsing.
 */
export const parseGameProjectBody = async (markdown: string | null): Promise<Record<string, string | null>> => {
  try {
    if (!markdown) {
      return {
        poster: null,
        hero: null,
        banner: null,
        background: null,
      }
    }

    const data: Record<string, string | null> = {}
    const normalizedMarkdown = markdown.replace(/\r\n/g, '\n')
    const lines = normalizedMarkdown.split('\n')

    for (const heading of ['Poster', 'Hero', 'Banner', 'Background']) {
      const key = heading.toLowerCase()
      const value = await extractHeadingValue(lines, heading)
      data[key] = value === '_No response_' ? null : value
    }

    return data
  } catch (error) {
    logger.error('Error fetching or parsing schema:', error)
    throw error
  }
}

/**
 * Fetches basic YouTube video metadata using the oEmbed endpoint.
 * Note: The oEmbed response does not include the video description.
 */
export const fetchYouTubeOEmbedMetadata = async (videoId: string): Promise<YouTubeOEmbedMetadata | null> => {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`

  try {
    const response = await fetch(oembedUrl)
    if (!response.ok) {
      console.error(`YouTube oEmbed request failed with status ${response.status}`)
      return null
    }
    const data = await response.json()
    return data as YouTubeOEmbedMetadata
  } catch (error) {
    console.error('Error fetching YouTube oEmbed metadata:', error)
    return null
  }
}

/**
 * Generates a numeric ID based on a YouTube video URL.
 * It extracts the video ID from the URL and sums its character codes.
 */
const generateYoutubeNumericId = (videoURL: string): number => {
  // Match typical YouTube URL patterns, e.g. https://youtu.be/VIDEO_ID or https://www.youtube.com/watch?v=VIDEO_ID
  const match = videoURL.match(/(?:youtu\.be\/|v=)([^?&]+)/)
  if (!match) {
    // If extraction fails, fallback to 0 (or consider throwing an error)
    return 0
  }
  const videoId = match[1]
  let numericId = 0
  for (let i = 0; i < videoId.length; i++) {
    numericId += videoId.charCodeAt(i)
  }
  return numericId
}

/**
 * Aggregates ProtonDB and Steam Deck compatibility data into a single snapshot for UI consumption.
 * Returns null when no identifiers are supplied or when neither source yields usable data.
 */
export const generateGameRatingsSummary = async (
  appId: string,
  gameName?: string | null,
): Promise<GameRatingsSummary | null> => {
  const normalizedAppId = appId?.toString().trim()
  if (!normalizedAppId) {
    logger.warn('generateGameRatingsSummary called without appId.')
    return null
  }

  const [protonSummaryRaw, steamCompatibilitySummaryRaw] = await Promise.all([
    fetchProtonDbSummary(normalizedAppId),
    fetchSteamDeckCompatibility(normalizedAppId),
  ])

  const protonSummary = mapProtonDbSummary(protonSummaryRaw)
  const steamDeckCompatibilitySummary = mapSteamDeckCompatibility(steamCompatibilitySummaryRaw)

  if (!protonSummary && !steamDeckCompatibilitySummary) {
    return {
      appId: parseAppIdNumber(normalizedAppId),
      gameName: (steamCompatibilitySummaryRaw as any)?.name || gameName || null,
      lastChecked: new Date().toISOString(),
      protonDb: null,
      steamDeckCompatibility: null,
    }
  }

  return {
    appId: parseAppIdNumber(normalizedAppId) ?? parseAppIdNumber((steamCompatibilitySummaryRaw as any)?.steam_appid),
    gameName: (steamCompatibilitySummaryRaw as any)?.name || gameName || null,
    lastChecked: new Date().toISOString(),
    protonDb: protonSummary,
    steamDeckCompatibility: steamDeckCompatibilitySummary,
  }
}

/**
 * Fetches SDGC video review data for the given App ID.
 */
export const fetchSDGReview = async (appId: string): Promise<SDGVideoReview[]> => {
  const cachedData = await redisLookupSDGReview(appId)
  if (cachedData) {
    return cachedData
  }

  const url = `http://sdgc.steamdeckgaming.net:4444/SDGVideo?AppId=${appId}`
  try {
    logger.info(`Fetching SDG review data for appId ${appId} from SDG API...`)
    const response = await fetch(url)

    // Check if response is ok (status 200)
    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`SDG API request failed with status ${response.status}: ${errorBody}`)
      await redisCacheSDGReview([], appId, 3600) // Cache error response for 1 hour
      return []
    }

    const data: SDGVideoReview[] = await response.json()

    if (data.length > 0) {
      // Cache results, then return them
      await redisCacheSDGReview(data, appId)
      return data
    } else {
      logger.warn(`No video data found for appId ${appId}`)
      await redisCacheSDGReview([], appId, 3600) // Cache error response for 1 hour
      return []
    }
  } catch (error) {
    logger.error(`Failed to fetch video data for appId ${appId}:`, error)
  }

  await redisCacheSDGReview([], appId, 3600) // Cache error response for 1 hour
  return []
}


/**
 * Transforms raw SDG video review data into ExternalGameReview objects.
 *
 * This function parses the SDGVideoReview object to generate a standardized ExternalGameReview
 * object with additional computed values and formatting, such as summary, device assumptions, and
 * additional notes. The goal here is to fill in the gaps.
 */
export const generateSDGReviewData = async (appId: string): Promise<ExternalGameReview[]> => {
  const rawVideos: SDGVideoReview[] = await fetchSDGReview(appId)
  if (!rawVideos || rawVideos.length === 0) {
    return []
  }

  // Map each raw video into an ExternalGameReview.
  return rawVideos.map(video => {
    const id = generateYoutubeNumericId(video.videoURL)

    const summary = limitStringTo100Characters(video.title)
    const assumedDevice = 'Steam Deck LCD (256GB/512GB)'

    const reportData: ExternalGameReviewReportData = {
      summary: summary,
      additional_notes: video.videoURL,
      device: assumedDevice,
    }

    return {
      id: id,
      title: video.title,
      html_url: video.videoURL,
      data: reportData,
      source: {
        name: 'Steam Deck Gaming',
        avatar_url: 'https://static.wixstatic.com/media/97c54f_3a8d6d3db72d40c284188e457febb911~mv2.png',
        report_count: rawVideos.length,
      },
      created_at: video.puiblishDateTime,
      updated_at: video.puiblishDateTime,
    }
  })
}

/**
 * Fetches Blog summary of reviews
 * - On cache hit: returns string immediately.
 * - On cache miss: returns null immediately, then warms cache in background (deduped by a short Redis lock).
 */
export const fetchBlogReviewSummary = async (gameDetails: Partial<GameDetails>): Promise<string | null> => {
  // Generate a cache key. Prefer App ID if available.
  const baseKey = gameDetails.appId
    ? String(gameDetails.appId)
    : String(gameDetails.gameName || '')

  if (!baseKey) {
    logger.warn('fetchBlogReviewSummary called without appId or gameName.')
    return null
  }

  // Create a content hash to refresh when data changes (reports/external_reviews length or latest updated_at)
  const hashBasis = {
    appId: gameDetails.appId ?? null,
    reportsLen: gameDetails.reports?.length ?? 0,
    extLen: gameDetails.external_reviews?.length ?? 0,
    latestReportUpdatedAt: gameDetails.reports
      ?.map((r: any) => r.updated_at)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] ?? null,
  }
  // Tiny, deterministic hash
  const hash = (() => {
    try {
      const str = JSON.stringify(hashBasis, Object.keys(hashBasis).sort())
      let h = 0
      for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
      return (h >>> 0).toString(16)
    } catch {
      return 'na'
    }
  })()

  // Fetch cache data
  const key = `${baseKey} - ${hash}`
  const cachedData = await redisLookupReportsSummaryBlog(key)
  if (cachedData) {
    return cachedData.reports_summary
  }

  // Ensure we have configured a blogger API key
  if (!config.bloggerApiKey) {
    logger.error('BLOGGER_API_KEY is not set; skipping blogger summary call.')
    return null
  }

  // Acquire short lock to dedupe background work
  const gotLock = await acquireRedisLock(`reports_summary_blog:${key}`, 60)
  if (gotLock) {
    // Fire-and-forget background fetch. Avoid unhandled rejection noise.
    ;(async () => {
      try {
        logger.info(`(BG TASK) Fetching Reports Summary Blog for ${key} from DeckVerified blogger API...`)
        const response: Response = await fetch('https://blogger.deckverified.games', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': config.bloggerApiKey!,
          },
          body: JSON.stringify(gameDetails),
        })

        // Check if response is ok (status 200)
        if (!response.ok) {
          const errorBody = await response.text()
          logger.error(`(BG TASK) Blogger worker responded ${response.status}: ${errorBody}`)
          await redisCacheReportsSummaryBlog({ reports_summary: null }, key, 86400) // Cache error response for 1 day
          return
        }

        const responseData: BloggerReportSummary = await response.json()
        // IMPORTANT: treat explicit null as a valid result and cache it for max TTL
        if (responseData.reports_summary === null) {
          await redisCacheReportsSummaryBlog({ reports_summary: null }, key)
          logger.info(`(BG TASK) Cached blogger summary (null) for ${key}.`)
          return
        }

        const reportsSummary = responseData.reports_summary?.trim() ?? ''
        if (!reportsSummary) {
          // Empty string is unexpected -> treat as error/negative for 1 day
          logger.warn('(BG TASK) Blogger worker returned empty summary string.')
          await redisCacheReportsSummaryBlog({ reports_summary: null }, key, 86400) // Cache error response for 1 day
          return
        }

        // Returned a summary. Cache for full length
        await redisCacheReportsSummaryBlog({ reports_summary: reportsSummary }, key)
        logger.info(`(BG TASK) Cached blogger summary for ${key}.`)
      } catch (error) {
        logger.error(`(BG TASK) Failed to fetch Reports Summary Blog for ${key}:`, error)
        await redisCacheReportsSummaryBlog({ reports_summary: null }, key, 86400) // Cache error response for 1 day
      }
    })().catch(async () => {
      // Background task itself rejected: negative cache 1 day
      await redisCacheReportsSummaryBlog({ reports_summary: null }, key, 86400) // Cache error response for 1 day
    })
  }

  // Return immediately on miss. The next request will likely hit the cache.
  return null
}
