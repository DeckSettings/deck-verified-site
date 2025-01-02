const express = require('express')
const { connectToRedis, redisClient } = require('./redis')
const { updateGameIndex, fetchReports, fetchProject, fetchIssueLabels } = require('./github')
const { generalLimiter } = require('./rateLimiter')
const { storeGameInRedis, searchGamesInRedis, cacheTime } = require('./helpers')

const app = express()

// Apply a rate limiter to all routes
app.use(generalLimiter)


// Routes
app.get('/deck-verified/api/v1/recent_reports', async (req, res) => {
  const redisKey = 'issues_top_recent'
  try {
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      console.log('Serving from Redis cache')
      return res.json(JSON.parse(cachedData))
    }

    const reports = await fetchReports(
      undefined,
      undefined,
      'open',
      'updated',
      'desc',
      5
    )
    if (reports && reports.items.length > 0) {
      await redisClient.set(redisKey, JSON.stringify(reports.items), { EX: cacheTime }) // Cache for 1 hour
      console.log('Data fetched from GitHub and cached in Redis')

      res.json(reports.items)
    } else {
      console.log('No reports found.')
      res.status(204).json([]) // 204 No Content
    }
  } catch (error) {
    console.error('Error fetching recent reports:', error)
    res.status(500).json({ error: 'Failed to fetch recent reports' })
  }
})

app.get('/deck-verified/api/v1/popular_reports', async (req, res) => {
  const redisKey = 'issues_top_popular'
  try {
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      console.log('Serving from Redis cache')
      return res.json(JSON.parse(cachedData))
    }

    const reports = await fetchReports(
      undefined,
      undefined,
      'open',
      'reactions-+1',
      'desc',
      5
    )
    if (reports && reports.items.length > 0) {
      await redisClient.set(redisKey, JSON.stringify(reports.items), { EX: cacheTime }) // Cache for 1 hour
      console.log('Data fetched from GitHub and cached in Redis')

      res.json(reports.items)
    } else {
      console.log('No reports found.')
      res.status(204).json([]) // 204 No Content
    }
  } catch (error) {
    console.error('Error fetching popular reports:', error)
    res.status(500).json({ error: 'Failed to fetch popular reports' })
  }
})

app.get('/deck-verified/api/v1/search_games_by_project', async (req, res) => {
  const appId = req.query['appid']
  let gameName = req.query['game_name']

  // Construct the search term based on the provided parameters
  let searchTerm = ''
  if (appId) {
    searchTerm = `appid="${appId}"`
  } else if (gameName) {
    searchTerm = `name="${decodeURIComponent(gameName)}"`
  } else {
    return res.status(400).json({ error: 'Missing search parameters' })
  }

  const redisKey = `project_search:${searchTerm}`
  try {
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      console.log('Serving from Redis cache')
      return res.json(JSON.parse(cachedData))
    }

    const projects = await fetchProject(searchTerm, null)
    if (projects) {
      await redisClient.set(redisKey, JSON.stringify(projects), { EX: cacheTime }) // Cache for 1 hour
      console.log('Data fetched from GitHub and cached in Redis')

      // Store any game results in our search cache
      for (const project of projects) {
        console.log(`Storing project ${project.gameName} with appId ${project.appId} in RedisSearch`)
        try {
          await storeGameInRedis(project.gameName, project.appId)
        } catch (error) {
          console.error('Error storing game in Redis:', error)
        }
      }

      res.json(projects)
    } else {
      console.log('No projects found.')
      res.status(204).json([])
    }
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: 'Failed to fetch projects' })
  }
})

app.get('/deck-verified/api/v1/search_games', async (req, res) => {
  let searchString = req.query['search']

  if (!searchString) {
    return res.status(400).json({ error: 'Missing search parameter' })
  }

  try {
    searchString = decodeURIComponent(searchString)
  } catch (error) {
    return res.status(400).json({ error: `Invalid game_name parameter: ${error}` })
  }

  try {
    const games = await searchGamesInRedis(searchString)
    if (games.length > 0) {
      res.json(games)
    } else {
      console.log('No games found.')
      res.status(204).json([])
    }
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: 'Failed to search games' })
  }
})

app.get('/deck-verified/api/v1/issue_labels', async (req, res) => {
  const redisKey = `issue_labels`
  try {
    const cachedData = await redisClient.get(redisKey)
    if (cachedData) {
      console.log('Serving from Redis cache')
      return res.json(JSON.parse(cachedData))
    }

    const labels = await fetchIssueLabels()
    await redisClient.set(redisKey, JSON.stringify(labels), { EX: cacheTime }) // Cache for 1 hour
    console.log('Data fetched from GitHub and cached in Redis')

    res.json(labels)
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: 'Failed to fetch labels' })
  }
})


const startServer = async () => {
  try {
    await connectToRedis()

    // Continue with the rest of the script after Redis is connected
    console.log('Redis connected. Proceeding with the rest of the script...')

    // Run scheduled tasks
    // Call updateGameIndex on start
    await updateGameIndex()
    // Schedule updateGameIndex to run every "cacheTime" minutes
    setInterval(updateGameIndex, cacheTime * 1000)

    // Server
    const port = 9022
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`)
    })
  } catch (error) {
    console.error('Error starting the server:', error)
    process.exit(1)
  }
}

startServer()
