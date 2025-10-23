import crypto from 'crypto'
import logger from './logger'
import {
  HardwareInfo,
  GameImages,
  GameReportData,
  GitHubReportIssueBodySchema,
  YouTubeOEmbedMetadata,
  GameRatingsSummary,
} from '../../shared/src/game'
import type { UserNotification } from '../../shared/src/notifications'
import NodeCache from 'node-cache'
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

export interface GeneralCommentNotificationInput {
  issueNumber: number | null
  commentBody: string
  commentUrl: string
}

export const buildGeneralCommentNotification = (input: GeneralCommentNotificationInput): UserNotification => {
  const reference = Number.isFinite(input.issueNumber)
    ? `report #${input.issueNumber}`
    : 'your report'
  const commentBody = (input.commentBody ?? '').replace(/\s+/g, ' ').trim()
  const summary = truncateStringToLength(
    commentBody,
    160,
  ) || 'Someone commented on your report.'

  return {
    icon: 'comment',
    title: `New comment on ${reference}`,
    body: summary,
    link: input.commentUrl,
    linkTooltip: 'Open comment on GitHub',
  }
}

export interface GeneralCommentWebhookPayload {
  type: 'general'
  issueNumber: number | null
  issueAuthorId: string
  commentId: string
  commentBody: string
  commentUserId: string
  commentUrl: string
  commentCreatedAt: string | null
}

export const sanitizeGeneralCommentWebhookPayload = (input: unknown): GeneralCommentWebhookPayload | null => {
  if (!input || typeof input !== 'object') {
    return null
  }

  const raw = input as Record<string, any>

  const issueAuthorNumeric = parseNumberOrNull(raw.issueAuthorId)
  const commentNumeric = parseNumberOrNull(raw.commentId)
  const commentUserNumeric = parseNumberOrNull(raw.commentUserId)
  const commentUrl = typeof raw.commentUrl === 'string' ? raw.commentUrl.trim() : ''
  const commentBody = typeof raw.commentBody === 'string' ? raw.commentBody : ''
  const commentCreatedAt = typeof raw.commentCreatedAt === 'string'
    ? raw.commentCreatedAt.trim() || null
    : null
  const issueNumber = parseNumberOrNull(raw.issueNumber)

  if (issueAuthorNumeric === null || commentNumeric === null || commentUserNumeric === null || !commentUrl) {
    return null
  }

  const issueAuthorId = issueAuthorNumeric.toString()
  const commentId = commentNumeric.toString()
  const commentUserId = commentUserNumeric.toString()

  return {
    type: 'general',
    issueNumber,
    issueAuthorId,
    commentId,
    commentBody,
    commentUserId,
    commentUrl,
    commentCreatedAt,
  }
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
 * Truncates a string to a specified maximum length.
 *
 * If the provided `input` exceeds `limit` characters, the string is truncated and an ellipsis ("...")
 * is appended. The function ensures that the total length of the returned string does not exceed `limit`.
 *
 * Behavior notes:
 * - If `limit` is omitted, it defaults to 100.
 * - If `limit` is less than or equal to 0, an empty string is returned.
 * - If `limit` is less than or equal to 3, the function will return the first `limit` characters
 *   without appending an ellipsis (since there isn't room for it).
 *
 * @param input - The input string to truncate.
 * @param limit - Maximum allowed length of the output string (including the ellipsis when applied).
 */
export const truncateStringToLength = (input: string, limit = 100): string => {
  if (!input) return ''
  if (limit <= 0) return ''
  if (input.length <= limit) return input
  if (limit <= 3) return input.slice(0, limit)
  const safeLimit = limit - 3
  return `${input.slice(0, safeLimit)}...`
}

/**
 * Attempts to coerce various input formats (numbers, raw strings, "app/123", etc.) into a finite number.
 * Returns null when the value cannot be parsed.
 */
export const parseNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }
    const candidate = trimmed.includes('/')
      ? trimmed.slice(trimmed.lastIndexOf('/') + 1)
      : trimmed
    const parsed = Number(candidate)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
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
      // Match device info from hardwareInfo using a compact predicate that strips manufacturer prefixes
      const manufacturers = ['Valve', 'ASUS', 'Lenovo']
      const stripManufacturerPrefixOnce = (s: string) => {
        const trimmed = (s || '').trim().toLowerCase()
        for (const m of manufacturers) {
          const prefix = m.toLowerCase() + ' '
          if (trimmed.startsWith(prefix)) {
            return trimmed.substring(prefix.length).trim()
          }
        }
        return trimmed
      }
      const reportedDeviceLower = String(data.device || '').trim().toLowerCase()
      const matchedDevice = hardwareInfo.find((device) => {
        const deviceNameLower = (device.name || '').trim().toLowerCase()
        // Direct case-insensitive compare
        if (deviceNameLower === reportedDeviceLower) return true
        // The reported device doesn't have a manufacturer prefix (e.g. hardware: "Lenovo Legion Go", reported: "Legion Go")
        if (stripManufacturerPrefixOnce(deviceNameLower) === reportedDeviceLower) return true
        return false
      })

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
      appId: parseNumberOrNull(normalizedAppId),
      gameName: (steamCompatibilitySummaryRaw as any)?.name || gameName || null,
      lastChecked: new Date().toISOString(),
      protonDb: null,
      steamDeckCompatibility: null,
    }
  }

  return {
    appId: parseNumberOrNull(normalizedAppId) ?? parseNumberOrNull((steamCompatibilitySummaryRaw as any)?.steam_appid),
    gameName: (steamCompatibilitySummaryRaw as any)?.name || gameName || null,
    lastChecked: new Date().toISOString(),
    protonDb: protonSummary,
    steamDeckCompatibility: steamDeckCompatibilitySummary,
  }
}
