const express = require('express')
const redis = require('redis')
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args))
var logfmt = require('logfmt')

const app = express()

// Config
const cacheTime = process.env.CACHE_TIME || 600 // 10 Minutes

// Connection to Redis
const redisHost = process.env.REDIS_HOST || '127.0.0.1'
const redisPort = process.env.REDIS_PORT || 6379
const redisPassword = process.env.REDIS_PASSWORD || null
const redisClient = redis.createClient({
  socket: {
    host: redisHost,
    port: redisPort
  },
  password: redisPassword
})
const createRedisSearchIndex = async () => {
  try {
    // Check if the index already exists
    const indexExists = await redisClient.ft.info('games_idx').catch(() => null)

    if (!indexExists) {
      console.log('Creating RedisSearch index...')

      // Create the index with a game name (TEXT) and appid (NUMERIC)
      await redisClient.ft.create(
        'games_idx',
        {
          appsearch: { type: 'TEXT', SORTABLE: true }, // Searchable index
          appname: { type: 'TEXT', SORTABLE: true }, // Full game name
          appid: { type: 'TEXT', SORTABLE: true }   // App ID
        },
        {
          ON: 'HASH',
          PREFIX: 'game:'
        }
      )
      console.log('RedisSearch index created.')
    }
  } catch (error) {
    console.error('Error creating RedisSearch index:', error)
  }
}
const connectRedis = async () => {
  let retries = 5
  while (retries) {
    try {
      await redisClient.connect()
      console.log('Connected to Redis!')
      await createRedisSearchIndex()
      break
    } catch (err) {
      console.error('Redis connection error:', err)
      retries -= 1
      console.log(`Retrying... attempts left: ${retries}`)
      await new Promise(resolve => setTimeout(resolve, 5000))  // Wait 5 seconds before retry
    }
  }
}

redisClient.on('connect', () => {
  console.log('Connected to Redis!')
})
redisClient.on('error', (err) => {
  console.error('Redis connection error:', err)
})
connectRedis()

// Configure default GitHub auth token
const defaultGithubAuthToken = process.env.GH_TOKEN || null

// Helper functions
const storeGameInRedis = async (gameName, appid = null) => {
  if (!gameName) {
    throw new Error('Game name is required.')
  }

  const gameId = appid ? `game:${appid}` : `game:${encodeURIComponent(gameName.toLowerCase())}`
  const searchString = appid ? `${appid}_${encodeURIComponent(gameName.toLowerCase())}` : `${encodeURIComponent(gameName.toLowerCase())}`

  try {
    await redisClient.hSet(gameId, {
      appsearch: searchString, // Add string used for searches
      appname: gameName,  // Use gameName for the appname
      appid: appid ? String(appid) : ''   // Store appid, use empty string if null
    })
    console.log(`Stored game: ${gameName} (appid: ${appid ?? 'null'})`)
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
      appId: doc.value.appid !== '-1' ? doc.value.appid : null
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

const fetchIssueLabels = async (authToken) => {
  console.log('Fetching labels from GitHub API')
  const headers = {
    'Content-Type': 'application/json'
  }
  if (authToken) {
    headers['Authorization'] = `bearer ${authToken}`
  }
  const response = await fetch('https://api.github.com/repos/DeckSettings/deck-settings-db/labels', {
    method: 'GET',
    headers: headers
  })
  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`GitHub API request failed with status ${response.status}: ${errorBody}`)
    throw new Error('Failed to fetch labels from GitHub API. Non-success response recieved from GitHub')
  }
  return await response.json()
}

const fetchReports = async (
  repoOwner = 'DeckSettings',
  repoName = 'deck-settings-db',
  state = 'open',
  sort = 'updated',
  direction = 'desc',
  limit = null
) => {
  let encodedSort = encodeURIComponent(sort)
  let url = `https://api.github.com/search/issues?q=repo:${repoOwner}/${repoName}+state:${state}+is:issue&sort=${encodedSort}&order=${direction}`
  if (limit !== null) {
    url += `&per_page=${limit}`
  }
  const response = await fetch(url)
  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`GitHub API request failed with status ${response.status}: ${errorBody}`)
    return []
  }
  return await response.json()
}

const getOrgId = async (orgName, authToken) => {
  const query = `
    query GetOrganizationId($orgLogin: String!) {
      organization(login: $orgLogin) {
        id
      }
    }
  `

  try {
    const headers = {
      'Content-Type': 'application/json'
    }
    if (authToken) {
      headers['Authorization'] = `bearer ${authToken}`
    }

    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        query: query,
        variables: {
          orgLogin: orgName
        }
      })
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`GitHub GraphQL API request failed with status ${response.status}: ${errorBody}`)
      throw new Error('Failed to fetch organization ID')
    }

    const responseData = await response.json()
    return responseData.data.organization.id
  } catch (error) {
    console.error('Error fetching organization ID:', error)
    throw error
  }
}

const fetchProject = async (searchTerm, authToken) => {
  //const orgNodeId = await getOrgId('DeckSettings', authToken)
  const orgNodeId = 'O_kgDOC35waw'
  const query = `
    query fetchOrgProjects($orgId: ID!, $cursor: String, $searchTerm: String!) {
      node(id: $orgId) {
        ... on Organization {
          projectsV2(first: 100, after: $cursor, query: $searchTerm) {
            nodes {
              id
              title
              number
              shortDescription
              readme
              url
              items(first: 100) {
                nodes {
                  content {
                    __typename
                    ... on Issue {
                      databaseId
                      title
                      url
                      body
                      labels(first: 5) {
                        nodes {
                          id
                          name
                          color
                          description
                        }
                      }
                      reactions_thumbs_up: reactions(content: THUMBS_UP) {
                        totalCount
                      }
                      reactions_thumbs_down: reactions(content: THUMBS_DOWN) {
                        totalCount
                      }
                      author {
                        login
                        avatar_url: avatarUrl
                      }
                      createdAt
                      updatedAt
                    }
                    ... on PullRequest {
                      id
                      title
                      url
                    }
                  }
                }
              }
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
        }
      }
    }
  `

  try {
    let hasNextPage = true
    let endCursor = null
    let discoveredProjects = []
    let returnProjects = []

    while (hasNextPage) {
      const headers = {
        'Content-Type': 'application/json'
      }
      if (authToken) {
        headers['Authorization'] = `bearer ${authToken}`
      }

      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          query: query,
          variables: {
            orgId: orgNodeId,
            cursor: endCursor,
            searchTerm: searchTerm
          }
        })
      })

      if (!response.ok) {
        const errorBody = await response.text()
        console.error(`GitHub GraphQL API request failed with status ${response.status}: ${errorBody}`)
        return null
      }

      const responseData = await response.json()

      if (!responseData.data?.node || !responseData.data?.node.projectsV2) {
        console.log('No project data returned from org node.')
        return null // Return null to indicate no data
      }
      discoveredProjects = discoveredProjects.concat(responseData.data.node.projectsV2.nodes)

      for (const project of discoveredProjects) {
        const parsedTitle = logfmt.parse(project.title)

        const projectData = {
          gameName: parsedTitle.name ?? '',
          appId: parsedTitle.appid ? parseInt(parsedTitle.appid, 10) : null,
          projectNumber: project.number,
          shortDescription: project.shortDescription,
          readme: project.readme,
          metadata: {},
          issues: []
        }

        // Parse Game data from project readme
        projectData.metadata = Object.fromEntries(
          Object.entries(await parseGameProjectBody(project.readme)).map(([key, value]) => [key.toLowerCase(), value])
        )

        // Parse issues list
        for (const node of project.items.nodes) {
          if (node.content.__typename === 'Issue' && node.content.body) {
            const parsedIssueData = await parseReportBody(node.content.body)
            projectData.issues.push({
              id: node.content.databaseId,
              title: node.content.title,
              html_url: node.content.url,
              body: node.content.body,
              reactions: {
                'reactions_thumbs_up': node.content.reactions_thumbs_up.totalCount,
                'reactions_thumbs_down': node.content.reactions_thumbs_down.totalCount
              },
              labels: node.content.labels.nodes,
              user: node.content.author,
              created_at: node.content.createdAt,
              updated_at: node.content.updatedAt,
              ...parsedIssueData
            })
          }
        }
        returnProjects.push(projectData)
      }

      hasNextPage = responseData.data.node.projectsV2.pageInfo.hasNextPage
      endCursor = responseData.data.node.projectsV2.pageInfo.endCursor
    }

    return returnProjects
  } catch (error) {
    console.error('Error fetching organization projects:', error)
    return null
  }
}

const updateGameIndex = async () => {
  try {
    // Configure API auth token
    let authToken = null
    if (defaultGithubAuthToken) {
      authToken = defaultGithubAuthToken
    }

    const projects = await fetchProject('', authToken)
    if (projects) {
      for (const project of projects) {
        console.log(`Storing project ${project.gameName} with appId ${project.appId} in RedisSearch`)
        try {
          await storeGameInRedis(project.gameName, project.appId)
        } catch (error) {
          console.error('Error storing game in Redis:', error)
        }
      }
    }
  } catch (error) {
    console.error('Error updating game index:', error)
  }
}


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

    // Configure API auth token
    let authToken = null
    if (defaultGithubAuthToken) {
      authToken = defaultGithubAuthToken
    }

    const projects = await fetchProject(searchTerm, authToken)
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

    // Configure API auth token
    let authToken = null
    if (defaultGithubAuthToken) {
      authToken = defaultGithubAuthToken
    }

    const labels = await fetchIssueLabels(authToken)
    await redisClient.set(redisKey, JSON.stringify(labels), { EX: cacheTime }) // Cache for 1 hour
    console.log('Data fetched from GitHub and cached in Redis')

    res.json(labels)
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: 'Failed to fetch labels' })
  }
})

// Run scheduled tasks
// Call updateGameIndex on start
updateGameIndex()
// Schedule updateGameIndex to run every "cacheTime" minutes
setInterval(updateGameIndex, cacheTime * 60 * 1000)

// Server
const port = 9022
app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})
