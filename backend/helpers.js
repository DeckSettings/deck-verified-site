const cheerio = require('cheerio')
const { redisClient } = require('./redis')
const logger = require('./logger')

const cacheTime = process.env.CACHE_TIME || 600 // Default 10 Minutes

const storeGameInRedis = async (gameName, appId = null, banner = null) => {
  if (!gameName) {
    throw new Error('Game name is required.')
  }

  const gameId = appId ? `game:${appId}` : `game:${encodeURIComponent(gameName.toLowerCase())}`
  const searchString = appId ? `${appId}_${gameName.toLowerCase()}` : `${gameName.toLowerCase()}`
  // Comment with backslash the characters ,.<>{}[]"':;!@#$%^&*()-+=~ and whitespace
  const escapedSearchString = searchString.toLowerCase().trim().replace(/[,.<>{}\[\]"':;!@#$%^&*()\-+=\~\s]/g, '\\$&')

  try {
    await redisClient.hSet(gameId, {
      appsearch: escapedSearchString, // Add string used for searches
      appname: gameName,  // Use gameName for the appname
      appid: appId ? String(appId) : '',   // Store appid, use empty string if null
      appbanner: banner ? String(banner) : ''   // Store poster, use empty string if null
    })
    logger.info(`Stored game: ${gameName} (appid: ${appId ?? 'null'}, banner: ${banner ?? 'null'})`)
  } catch (error) {
    logger.error('Failed to store game in Redis:', error)
  }
}

const searchGamesInRedis = async (searchTerm) => {
  if (!searchTerm) {
    throw new Error('Search term is required.')
  }

  try {
    // Construct the search query to match either appname or appid
    logger.info(`Searching cached games list for '${searchTerm}'`)
    // Comment with backslash the characters ,.<>{}[]"':;!@#$%^&*()-+=~ and whitespace
    const escapedSearchTerm = searchTerm.toLowerCase().trim().replace(/[,.<>{}\[\]"':;!@#$%^&*()\-+=\~\s]/g, '\\$&')

    const query = `@appsearch:*${escapedSearchTerm}*`
    const results = await redisClient.ft.search(
      'games_idx',
      query,
      {
        LIMIT: { from: 0, size: 10 }
      }
    )

    if (results.total === 0) {
      logger.info('No games found.')
      return []
    }

    return results.documents.map(doc => ({
      name: doc.value.appname,
      appId: doc.value.appid !== '' ? doc.value.appid : null,
      banner: doc.value.appbanner !== '' ? doc.value.appbanner : null
    }))
  } catch (error) {
    logger.error('Error during search:', error)
    return []
  }
}

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

const parseReportBody = async (markdown) => {
  const schemaUrl = 'https://raw.githubusercontent.com/DeckSettings/deck-settings-db/refs/heads/master/.github/scripts/config/game-report-validation.json'
  const redisKey = 'issue_game_report_schema:' + schemaUrl

  try {
    let schema = await redisClient.get(redisKey)
    if (schema) {
      logger.info('Schema found in Redis cache')
      schema = JSON.parse(schema)
    } else {
      logger.info('Schema not found in Redis cache, fetching from URL')
      const response = await fetch(schemaUrl)
      schema = await response.json()
      await redisClient.set(redisKey, JSON.stringify(schema), { EX: cacheTime })
    }

    const data = {}
    const normalizedMarkdown = markdown.replace(/\r\n/g, '\n')
    const lines = normalizedMarkdown.split('\n')

    for (const heading in schema.properties) {
      data[heading] = await extractHeadingValue(lines, heading)
    }

    return data
  } catch (error) {
    logger.error('Error fetching or parsing schema:', error)
    throw error // Re-throw the error to be handled by the caller
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
    throw error // Re-throw the error to be handled by the caller
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
  const url = `https://store.steampowered.com/search/suggest?f=games&cc=US&use_store_query=1&term=${encodedSearchTerm}`
  try {
    logger.info(`Fetching game suggestions for "${searchTerm}" from Steam API...`)
    const response = await fetch(url)
    const html = await response.text()
    const $ = cheerio.load(html)

    const games = $('a.match').map((_, game) => {
      const appId = $(game).attr('data-ds-appid')
      const name = $(game).find('.match_name').text().trim()
      const img = $(game).find('.match_img img').attr('src')

      return {
        appId,
        name,
        img
      }
    }).get()

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
  cacheTime,
  storeGameInRedis,
  searchGamesInRedis,
  extractHeadingValue,
  parseReportBody,
  parseGameProjectBody,
  fetchSteamGameDetails,
  fetchSteamGameSuggestions
}
