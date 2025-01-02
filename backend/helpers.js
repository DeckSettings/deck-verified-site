const { redisClient } = require('./redis')

const cacheTime = process.env.CACHE_TIME || 600 // Default 10 Minutes

const storeGameInRedis = async (gameName, appId = null, appPoster = null) => {
  if (!gameName) {
    throw new Error('Game name is required.')
  }

  const gameId = appId ? `game:${appId}` : `game:${encodeURIComponent(gameName.toLowerCase())}`
  const searchString = appId ? `${appId}_${encodeURIComponent(gameName.toLowerCase())}` : `${encodeURIComponent(gameName.toLowerCase())}`

  try {
    await redisClient.hSet(gameId, {
      appsearch: searchString, // Add string used for searches
      appname: gameName,  // Use gameName for the appname
      appid: appId ? String(appId) : '',   // Store appid, use empty string if null
      appposter: appPoster ? String(appPoster) : ''   // Store poster, use empty string if null
    })
    console.log(`Stored game: ${gameName} (appid: ${appId ?? 'null'}, poster: ${appPoster ?? 'null'})`)
  } catch (error) {
    console.error('Failed to store game in Redis:', error)
  }
}

const searchGamesInRedis = async (searchTerm) => {
  if (!searchTerm) {
    throw new Error('Search term is required.')
  }

  try {
    // Construct the search query to match either appname or appid
    console.log(`Searching cached games list for '${searchTerm}'`)

    const results = await redisClient.ft.search(
      'games_idx',
      `@appsearch:*${encodeURIComponent(searchTerm.toLowerCase())}*`,
      {
        LIMIT: { from: 0, size: 10 }
      }
    )

    if (results.total === 0) {
      console.log('No games found.')
      return []
    }

    return results.documents.map(doc => ({
      name: doc.value.appname,
      appId: doc.value.appid !== '' ? doc.value.appid : null,
      poster: doc.value.appposter !== '' ? doc.value.appposter : null
    }))
  } catch (error) {
    console.error('Error during search:', error)
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
      console.log('Schema found in Redis cache')
      schema = JSON.parse(schema)
    } else {
      console.log('Schema not found in Redis cache, fetching from URL')
      const response = await fetch(schemaUrl)
      schema = await response.json()
      await redisClient.set(redisKey, JSON.stringify(schema), { EX: cacheTime }) // Cache for 1 hour
    }

    const data = {}
    const normalizedMarkdown = markdown.replace(/\r\n/g, '\n')
    const lines = normalizedMarkdown.split('\n')

    for (const heading in schema.properties) {
      data[heading] = await extractHeadingValue(lines, heading)
    }

    return data
  } catch (error) {
    console.error('Error fetching or parsing schema:', error)
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
    console.error('Error fetching or parsing schema:', error)
    throw error // Re-throw the error to be handled by the caller
  }
}


module.exports = {
  cacheTime,
  storeGameInRedis,
  searchGamesInRedis,
  extractHeadingValue,
  parseReportBody,
  parseGameProjectBody
}
