import logger from './logger'
import type {
  HardwareInfo,
  GameImages,
  GameReportData,
  GitHubReportIssueBodySchema,
  SteamGame,
  SteamStoreAppDetails,
  SteamSuggestApp
} from '../../shared/src/game'
import {
  redisCacheSteamAppDetails,
  redisCacheSteamSearchSuggestions,
  redisLookupSteamAppDetails,
  redisLookupSteamSearchSuggestions, storeGameInRedis
} from './redis'

/**
 * Extracts the value associated with a specific heading from a markdown-like text.
 * It searches for the heading and returns the first non-empty line below it.
 *
 * @param lines - Array of strings representing lines of the markdown text.
 * @param heading - The heading to search for.
 * @returns The extracted value or null if the heading is not found.
 */
export const extractHeadingValue = async (
  lines: string[],
  heading: string
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

const calculatedBatteryLife = async (deviceInfo: HardwareInfo, averagePowerDraw: number): Promise<number> => {
  // Battery life in minutes = (Battery Size in Wh / Average Power Draw in W) * 60
  return Math.round((deviceInfo.battery_size_wh / averagePowerDraw) * 60)
}

/**
 * Parses the body of a GitHub issue report based on a provided schema.
 * Extracts specific heading values from the markdown content.
 */
export const parseReportBody = async (
  markdown: string,
  schema: GitHubReportIssueBodySchema,
  hardwareInfo: HardwareInfo[]
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
    if (data.average_battery_power_draw && data.average_battery_power_draw > 0) {
      // Match device info from hardwareInfo
      const matchedDevice = hardwareInfo.find(
        (device) => device.name === data.device
      )
      if (matchedDevice) {
        data.calculated_battery_life_minutes = await calculatedBatteryLife(matchedDevice, data.average_battery_power_draw)
      } else {
        logger.warn(`No matching device found in the hardwareInfo list for: ${data.device}`)
      }
    }

    // Check for required fields and log warnings for missing ones
    for (const requiredField of schema.required) {
      const snakeCaseField = requiredField
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^\w_]/g, '')
      if (!(snakeCaseField in data)) {
        logger.warn(`Missing required field: ${requiredField}`)
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
        await storeGameInRedis(appDetails.name, appId, gameImages.banner, gameImages.poster)
      }

      return appDetails
    } else {
      logger.error(`No game data found for appId ${appId}`)
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
  searchTerm: string
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
        name: item.name
      }))

    await redisCacheSteamSearchSuggestions(games, encodedSearchTerm)
    return { suggestions: games, fromCache: false }
  } catch (error) {
    logger.error('Error fetching Steam game suggestions:', error)
    await redisCacheSteamSearchSuggestions([], encodedSearchTerm, 3600) // Cache error response for 1 hour
    return { suggestions: [], fromCache: false }
  }
}

export const generateImageLinksFromAppId = async (appId: string): Promise<GameImages> => {
  return {
    poster: `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/library_600x900.jpg`,
    hero: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`,
    background: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/page_bg_generated_v6b.jpg`,
    banner: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`
  }
}
