const logger = require('./logger.cjs')
const {
  redisLookupSteamAppDetails,
  redisCacheSteamAppDetails,
  redisLookupSteamSearchSuggestions,
  redisCacheSteamSearchSuggestions
} = require('./redis.cjs')

/**
 * Extracts the value associated with a specific heading from a markdown-like text.
 * It searches for the heading and returns the first non-empty line below it.
 *
 * @param {string[]} lines - Array of strings representing lines of the markdown text.
 * @param {string} heading - The heading to search for.
 * @returns {Promise<string|null>} - The extracted value or null if the heading is not found.
 */
const extractHeadingValue = async (lines, heading) => {
  const headingToFind = `### ${heading}`.toLowerCase()
  const headingIndex = lines.findIndex(line => line.trim().toLowerCase() === headingToFind)
  if (headingIndex === -1) return null

  const sectionLines = []
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
 * Parses the body of a GitHub issue report based on a provided schema.
 * Extracts specific heading values from the markdown content.
 *
 * @param {string} markdown - The markdown content of the GitHub issue report.
 * @param {Object} schema - Schema defining the headings to extract.
 * @returns {Promise<Object>} - Object containing extracted game report data.
 * @throws {Error} - Throws if there is an error during parsing.
 */
const parseReportBody = async (markdown, schema) => {
  try {
    const data = {}
    const normalizedMarkdown = markdown.replace(/\r\n/g, '\n')
    const lines = normalizedMarkdown.split('\n')

    for (const heading in schema.properties) {
      const valueType = schema.properties[heading].type
      const snakeCaseHeading = heading
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^\w_]/g, '')
      let value = await extractHeadingValue(lines, heading)
      // Set any '_No response_' to null
      if (value === '_No response_') {
        value = null
      }
      // Convert to number if specified in schema
      if (valueType === 'number' && value !== null) {
        const parsedValue = parseFloat(value.replace(/,/g, ''))
        value = isNaN(parsedValue) ? null : parsedValue
      }
      data[snakeCaseHeading] = value
    }
    return data
  } catch (error) {
    logger.error('Error fetching or parsing schema:', error)
    throw error
  }
}

/**
 * Parses the body of a GitHub project to extract metadata for game assets.
 *
 * @param {string} markdown - The markdown content of the GitHub project.
 * @returns {Promise<Object>} - Object containing extracted game data.
 * @throws {Error} - Throws if there is an error during parsing.
 */
const parseGameProjectBody = async (markdown) => {
  try {
    const data = {}
    const normalizedMarkdown = markdown.replace(/\r\n/g, '\n')
    const lines = normalizedMarkdown.split('\n')
    for (const heading of ['Poster', 'Hero', 'Banner']) {
      data[heading] = await extractHeadingValue(lines, heading)
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
 * @returns {Promise<Object|null>} - Object containing the game's data or null if not found.
 * @throws {Error} - Throws if there is an error during the API call.
 */
const fetchSteamGameDetails = async (appId) => {
  const cachedData = await redisLookupSteamAppDetails(appId)
  if (cachedData) {
    return cachedData
  }

  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}`
  try {
    logger.info(`Fetching game data for appId ${appId} from Steam API...`)
    const response = await fetch(url)
    const data = await response.json()
    if (data && data[appId]?.success) {
      const appDetails = data[appId].data
      // Cache results, then return them
      await redisCacheSteamAppDetails(appDetails, appId)
      return appDetails
    } else {
      logger.error(`No game data found for appId ${appId}`)
      return null
    }
  } catch (error) {
    logger.error(`Failed to fetch game data for appId ${appId}:`, error)
    throw error
  }
}

/**
 * Fetches a list of game suggestions from Steam based on a search term.
 * If cached results are available, they are returned immediately. Otherwise,
 * results are fetched from the Steam API and cached in Redis.
 *
 * @param {string} searchTerm - The search term to use for fetching game suggestions.
 * @returns {Promise<Object[]>} - Array of game objects containing appId and name.
 * @throws {Error} - Returns an empty array if there is an error during fetching.
 */
const fetchSteamGameSuggestions = async (searchTerm) => {
  const encodedSearchTerm = encodeURIComponent(searchTerm)
  const cachedData = await redisLookupSteamSearchSuggestions(encodedSearchTerm)
  if (cachedData) {
    return cachedData
  }

  // Fetch game suggestions from Steam store
  const url = `https://store.steampowered.com/search/suggest?f=json&cc=US&use_store_query=1&category1=998&ndl=1&term=${encodedSearchTerm}`
  try {
    logger.info(`Fetching game suggestions for "${searchTerm}" from Steam API...`)
    const response = await fetch(url)
    // Check if response is ok (status 200)
    if (!response.ok) {
      logger.error(`Steam API request failed with status: ${response.status}`)
      return []
    }
    // Load JSON
    const data = await response.json()
    // Ensure data is an array before filtering
    if (!Array.isArray(data)) {
      logger.error(`Unexpected response format for "${searchTerm}":`, data)
      return []
    }
    // Filter for games only
    const games = data
      .filter(item => item.type === 'game')
      .map(item => ({
        appId: item.id,
        name: item.name
      }))
    // Cache results, then return them
    await redisCacheSteamSearchSuggestions(games, encodedSearchTerm)
    return games
  } catch (error) {
    logger.error('Error fetching Steam game suggestions:', error)
    return []
  }
}

module.exports = {
  extractHeadingValue,
  parseReportBody,
  parseGameProjectBody,
  fetchSteamGameDetails,
  fetchSteamGameSuggestions
}
