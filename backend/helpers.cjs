const { redisClient } = require('./redis.cjs')
const logger = require('./logger.cjs')

const extractHeadingValue = async (lines, heading) => {
  let value = null
  const headingToFind = `### ${heading}`.toLowerCase()
  const headingIndex = lines.findIndex(
    (line) => line.trim().toLowerCase() === headingToFind
  )
  if (headingIndex === -1) {
    return null
  }

  for (let i = headingIndex + 1; i < lines.length; i++) {
    const currentLine = lines[i].trim()

    if (currentLine.toLowerCase().startsWith('### ')) {
      value = null
      break
    }
    if (!currentLine) {
      continue
    }
    value = currentLine
    break
  }

  if (value === undefined) {
    value = null
  }
  return value
}

const parseReportBody = async (markdown, schema) => {
  try {
    const data = {}
    const normalizedMarkdown = markdown.replace(/\r\n/g, '\n')
    const lines = normalizedMarkdown.split('\n')

    for (const heading in schema.properties) {
      data[heading] = await extractHeadingValue(lines, heading)
    }
    return data
  } catch (error) {
    logger.error('Error fetching or parsing schema:', error)
    throw error
  }
}

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

const fetchSteamGameDetails = async (appId) => {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}`
  try {
    logger.info(`Fetching game data for appId ${appId} from Steam API...`)
    const response = await fetch(url)
    const data = await response.json()
    if (data && data[appId]?.success) {
      return data[appId].data
    } else {
      logger.error(`No game data found for appId ${appId}`)
      return null
    }
  } catch (error) {
    logger.error(`Failed to fetch game data for appId ${appId}:`, error)
    throw error
  }
}

const fetchSteamGameSuggestions = async (searchTerm) => {
  const encodedSearchTerm = encodeURIComponent(searchTerm)
  const redisKey = `steam_game_suggestions:${encodedSearchTerm}`

  try {
    // Attempt to fetch from Redis cache
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      logger.info(`Serving game suggestions for "${searchTerm}" from Redis cache`)
      return JSON.parse(cachedData)
    }
  } catch (error) {
    logger.error('Redis error while fetching cached suggestions:', error)
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
    // Cache results in Redis for 30 days
    const monthCacheTime = 60 * 60 * 24 * 30
    await redisClient.set(redisKey, JSON.stringify(games), { EX: monthCacheTime })
    logger.info(`Steam game suggestions for "${searchTerm}" cached for 30 days`)
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
