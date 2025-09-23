import logger from './logger'
import {
  HardwareInfo,
  GameImages,
  GameReportData,
  GitHubReportIssueBodySchema,
  YouTubeOEmbedMetadata,
  SteamGame,
  SteamStoreAppDetails,
  SteamSuggestApp,
  SDHQReview,
  ExternalGameReview,
  ExternalGameReviewReportData,
  SDGVideoReview, BloggerReportSummary, GameDetails,
} from '../../shared/src/game'
import {
  storeGameInRedis,
  redisCacheSDHQReview,
  redisLookupSDHQReview,
  redisCacheSteamAppDetails,
  redisLookupSteamAppDetails,
  redisCacheSteamSearchSuggestions,
  redisLookupSteamSearchSuggestions,
  redisLookupSDGReview,
  redisCacheSDGReview, redisLookupReportsSummaryBlog, redisCacheReportsSummaryBlog, acquireRedisLock,
} from './redis'
import { fetchHardwareInfo } from './github'
import NodeCache from 'node-cache'
import config from './config'

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
const parseGameSettingsToMarkdown = (htmlString: string): string => {
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
const calculatedBatteryLife = async (deviceInfo: HardwareInfo, averagePowerDraw: number): Promise<number> => {
  // Battery life in minutes = (Battery Size in Wh / Average Power Draw in W) * 60
  return Math.round((deviceInfo.battery_size_wh / averagePowerDraw) * 60)
}

/**
 * Converts a string into a numeric hash using a simple algorithm.
 */
const numberValueFromString = (str: string): number => {
  let num = 0
  for (let i = 0; i < str.length; i++) {
    num = num * 31 + str.charCodeAt(i)
  }
  return num
}

/**
 * Converts a numeric rating (out of 5) into a string of star icons.
 */
const convertRatingToStars = (rating: number): string => {
  const maxStars = 5
  const filledStars = '★'.repeat(rating)
  const emptyStars = '☆'.repeat(maxStars - rating)
  return filledStars + emptyStars
}

/**
 * Extract unique YouTube video IDs from HTML content.
 */
const extractYouTubeVideoIds = (html?: string | null): string[] => {
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
const extractNumbersFromString = (numberString: string | undefined): number | null => {
  if (!numberString) return null
  const match = numberString.match(/[\d.]+/)
  return match ? parseFloat(match[0]) : null
}

/**
 * Converts a wattage string to a numeric string representation.
 * Uses extractNumbersFromString to extract the numeric value.
 */
const convertWattageToNumber = (wattage: string | undefined): string => {
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
function limitStringTo100Characters(input: string): string {
  if (input.length <= 100) {
    return input
  }
  return input.substring(0, 97) + '...'
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
export const parseGameProjectBody = async (markdown: string): Promise<Record<string, string | null>> => {
  try {
    const data: Record<string, string | null> = {}
    const normalizedMarkdown = markdown.replace(/\r\n/g, '\n')
    const lines = normalizedMarkdown.split('\n')
    for (const heading of ['Poster', 'Hero', 'Banner']) {
      data[heading.toLowerCase()] = await extractHeadingValue(lines, heading)
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
 * Fetches detailed information for a game from the Steam API by its App ID.
 *
 * @param {string} appId - The Steam App ID of the game to fetch.
 * @returns {Promise<Object>} - Object containing the game's data or null if not found.
 * @throws {Error} - Throws if there is an error during the API call.
 */
export const fetchSteamStoreGameDetails = async (appId: string): Promise<SteamStoreAppDetails | Record<string, never>> => {
  const cachedData = await redisLookupSteamAppDetails(appId)
  if (cachedData) {
    return cachedData
  }

  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}`
  try {
    logger.info(`Fetching game data for appId ${appId} from Steam API...`)
    const response = await fetch(url)

    // Check if response is ok (status 200)
    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`Steam app details API request failed with status ${response.status}: ${errorBody}`)
      await redisCacheSteamAppDetails({}, appId, 3600) // Cache error response for 1 hour
      return {}
    }

    const data = await response.json()

    if (data && data[appId]?.success) {
      const appDetails: SteamStoreAppDetails = data[appId].data

      // Cache results, then return them
      await redisCacheSteamAppDetails(appDetails, appId)

      // Also cache in search results
      if (appDetails.name) {
        const gameImages = await generateImageLinksFromAppId(appId)
        await storeGameInRedis({
          gameName: appDetails.name,
          appId: String(appId),
          banner: gameImages.banner || null,
          poster: gameImages.poster || null,
        })
      }

      return appDetails
    } else {
      logger.warn(`No game data found for appId ${appId}`)
      await redisCacheSteamAppDetails({}, appId, 3600) // Cache error response for 1 hour
      return {}
    }
  } catch (error) {
    logger.error(`Failed to fetch game data for appId ${appId}:`, error)
  }

  await redisCacheSteamAppDetails({}, appId, 3600) // Cache error response for 1 hour
  return {}
}


/**
 * Fetches a list of game suggestions from Steam based on a search term.
 * If cached results are available, they are returned immediately. Otherwise,
 * results are fetched from the Steam API and cached in Redis.
 */
export const fetchSteamGameSuggestions = async (
  searchTerm: string,
): Promise<{ suggestions: SteamGame[]; fromCache: boolean }> => {
  const encodedSearchTerm = encodeURIComponent(searchTerm)
  const cachedData = await redisLookupSteamSearchSuggestions(encodedSearchTerm)

  if (cachedData) {
    logger.info(`Using cached results for Steam suggest API with search term: '${searchTerm}'`)
    return { suggestions: cachedData as SteamGame[], fromCache: true }
  }

  const url = `https://store.steampowered.com/search/suggest?f=json&cc=US&use_store_query=1&category1=998&ndl=1&term=${encodedSearchTerm}`

  try {
    logger.info(`Fetching game suggestions for "${searchTerm}" from Steam API...`)
    const response = await fetch(url)

    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`Steam suggest API request failed with status ${response.status}: ${errorBody}`)
      await redisCacheSteamSearchSuggestions([], encodedSearchTerm, 3600) // Cache error response for 1 hour
      return { suggestions: [], fromCache: false }
    }

    const data = await response.json()

    if (!Array.isArray(data)) {
      logger.error(`Unexpected response format for "${searchTerm}":`, data)
      await redisCacheSteamSearchSuggestions([], encodedSearchTerm, 3600) // Cache error response for 1 hour
      return { suggestions: [], fromCache: false }
    }

    const games: SteamGame[] = data
      .filter((item: SteamSuggestApp) => item.type === 'game')
      .map((item: SteamSuggestApp) => ({
        appId: item.id,
        name: item.name,
      }))

    await redisCacheSteamSearchSuggestions(games, encodedSearchTerm)
    return { suggestions: games, fromCache: false }
  } catch (error) {
    logger.error('Error fetching Steam game suggestions:', error)
    await redisCacheSteamSearchSuggestions([], encodedSearchTerm, 3600) // Cache error response for 1 hour
    return { suggestions: [], fromCache: false }
  }
}

/**
 * Fetches SDHQ review data for the given App ID.
 */
export const fetchSDHQReview = async (appId: string): Promise<SDHQReview[]> => {
  const cachedData = await redisLookupSDHQReview(appId)
  if (cachedData) {
    return cachedData
  }

  const url = `https://steamdeckhq.com/wp-json/wp/v2/game-reviews/?meta_key=steam_app_id&meta_value=${appId}`
  try {
    logger.info(`Fetching SDHQ review data for appId ${appId} from SDHQ API...`)
    const response = await fetch(url)

    // Check if response is ok (status 200)
    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`SDHQ game review PI request failed with status ${response.status}: ${errorBody}`)
      await redisCacheSDHQReview([], appId, 3600) // Cache error response for 1 hour
      return []
    }

    const data: SDHQReview[] = await response.json()

    if (data.length > 0) {

      // Cache results, then return them
      await redisCacheSDHQReview(data, appId)

      return data
    } else {
      logger.warn(`No SDHQ game data found for appId ${appId}`)
      await redisCacheSDHQReview([], appId, 3600) // Cache error response for 1 hour
      return []
    }
  } catch (error) {
    logger.error(`Failed to fetch SDHQ game data for appId ${appId}:`, error)
  }

  await redisCacheSDHQReview([], appId, 3600) // Cache error response for 1 hour
  return []
}

/**
 * Generates ExternalGameReview data based on SDHQ review data.
 *
 * It processes each review to generate a standardized ExternalGameReview object,
 * enriching the data with additional computed values and formatting, such as summary,
 * device assumptions, and additional notes. The goal here is to fill in the gaps.
 */
export const generateSDHQReviewData = async (appId: string): Promise<ExternalGameReview[]> => {
  const rawReviews: SDHQReview[] = await fetchSDHQReview(appId)
  return await Promise.all(
    rawReviews.map(async review => {
      // Use optional chaining and fallback to null if sections are missing.
      const optimizedSettings = review.acf?.optimized_and_recommended_settings || null
      const steamos = optimizedSettings?.steamos_settings || null
      const ratingCategories = review.acf?.sdhq_rating_categories || null

      // Build additional notes line by line.
      let additionalNotes: string = ''
      let performanceRating = 'Unrated'
      if (ratingCategories) {
        const notes: string[] = []
        if (ratingCategories.performance !== undefined) {
          performanceRating = `${convertRatingToStars(ratingCategories.performance)} (${ratingCategories.performance}/5)`
          notes.push(`- **Performance:** ${performanceRating})`)
        }
        if (ratingCategories.visuals !== undefined) {
          notes.push(`- **Visuals:** ${convertRatingToStars(ratingCategories.visuals)} (${ratingCategories.visuals}/5)`)
        }
        if (ratingCategories.stability !== undefined) {
          notes.push(`- **Stability:** ${convertRatingToStars(ratingCategories.stability)} (${ratingCategories.stability}/5)`)
        }
        if (ratingCategories.controls !== undefined) {
          notes.push(`- **Controls:** ${convertRatingToStars(ratingCategories.controls)} (${ratingCategories.controls}/5)`)
        }
        if (ratingCategories.battery !== undefined) {
          notes.push(`- **Battery:** ${convertRatingToStars(ratingCategories.battery)} (${ratingCategories.battery}/5)`)
        }

        additionalNotes = '#### SDHQ\'s Build Score Breakdown\n'
        if (ratingCategories.score_breakdown) {
          additionalNotes += `\n\n${ratingCategories.score_breakdown}\n`
        }
        if (notes.length > 0) {
          additionalNotes += notes.join('\n')
        }
      }

      const youtubeVideoIds = extractYouTubeVideoIds(review.content?.rendered)
      if (youtubeVideoIds.length > 0) {
        const youtubeSection = `\n${youtubeVideoIds
          .map(id => `https://youtu.be/${id}`)
          .join('\n')}`
        additionalNotes = additionalNotes
          ? `${additionalNotes}\n\n${youtubeSection}`
          : youtubeSection
      }

      const summary = limitStringTo100Characters(
        review.excerpt.rendered
          ? review.excerpt.rendered.replace(/<[^>]+>/g, '')
          : review.title.rendered,
      )
      const assumedDevice = 'Steam Deck LCD (256GB/512GB)'
      const averagePowerDraw = convertWattageToNumber(optimizedSettings?.projected_battery_usage_and_temperature?.wattage)
      const hardwareInfo = await fetchHardwareInfo()
      const matchedDevice = hardwareInfo.find(
        (device) => device.name === assumedDevice,
      )
      const calcBatteryLifeMinutes = matchedDevice ? await calculatedBatteryLife(matchedDevice, Number(averagePowerDraw)) : null
      const gameDisplaySettings = optimizedSettings?.game_settings ? parseGameSettingsToMarkdown(optimizedSettings.game_settings) : ''

      // Build the report data. If any field is missing, assign null.
      const reportData: ExternalGameReviewReportData = {
        summary: summary,
        game_name: review.title.rendered,
        app_id: Number(appId),
        average_battery_power_draw: averagePowerDraw,
        calculated_battery_life_minutes: calcBatteryLifeMinutes,
        device: assumedDevice,
        steam_play_compatibility_tool_used: 'Glorious Eggroll Proton (GE)',
        compatibility_tool_version: optimizedSettings?.proton_version || 'default',
        game_resolution: 'Default',
        custom_launch_options: null,
        frame_limit: extractNumbersFromString(steamos?.fps_cap),
        disable_frame_limit: 'Off',
        enable_vrr: 'Off',
        allow_tearing: 'Off',
        half_rate_shading: steamos?.half_rate_shading ? 'On' : 'Off',
        tdp_limit: extractNumbersFromString(steamos?.tdp_limit),
        manual_gpu_clock: extractNumbersFromString(steamos?.gpu_clock_frequency),
        scaling_mode: 'Auto',
        scaling_filter: steamos?.scaling_filter || 'Linear',
        game_display_settings: gameDisplaySettings,
        game_graphics_settings: '',
        additional_notes: additionalNotes,
        performance_rating: performanceRating,
      }

      return {
        id: numberValueFromString('SDHQ') + Number(review.id),
        title: review.title.rendered || '',
        html_url: review.link,
        data: reportData,
        source: {
          name: 'SDHQ',
          avatar_url: 'https://steamdeckhq.com/wp-content/uploads/2022/06/sdhq-holographic-logo.svg',
          report_count: rawReviews.length,
        },
        created_at: review.date || '',
        updated_at: review.modified || '',
      }
    }),
  )
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
  // Generate cache key. Prefer App ID if available.
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
