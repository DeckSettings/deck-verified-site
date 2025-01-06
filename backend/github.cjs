const logfmt = require('logfmt')
const { parseGameProjectBody, parseReportBody } = require('./helpers.cjs')
const logger = require('./logger.cjs')
const {
  storeGameInRedis,
  redisLookupGitHubIssueLabels,
  redisCacheGitHubIssueLabels,
  redisLookupReportBodySchema,
  redisCacheReportBodySchema,
  redisLookupGitHubProjectDetails,
  redisCacheGitHubProjectDetails
} = require('./redis.cjs')

// Configure default GitHub auth token
const defaultGithubAuthToken = process.env.GH_TOKEN || null

/**
 * Fetches reports from a GitHub repository using the search API.
 * Filters and sorts issues based on specified criteria.
 *
 * @param {string} repoOwner - GitHub repository owner.
 * @param {string} repoName - GitHub repository name.
 * @param {string} [state='open'] - Issue state (open, closed, or all).
 * @param {string} [sort='updated'] - Sort criteria (created, updated, comments).
 * @param {string} [direction='desc'] - Sort direction (asc or desc).
 * @param {number|null} [limit=null] - Limit number of results. Null for no limit.
 * @returns {Promise<Array|*>} - Returns the list of issues or an empty array if the fetch fails.
 */
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
    logger.error(`GitHub API request failed with status ${response.status}: ${errorBody}`)
    return []
  }
  return await response.json()
}

/**
 * Updates the Redis cache with the latest game data from GitHub org projects.
 *
 * @returns {Promise<void>} - Resolves when the update process completes.
 */
const updateGameIndex = async () => {
  try {
    let authToken = defaultGithubAuthToken || null

    const projects = await fetchProject('', authToken)
    if (projects) {
      for (const project of projects) {
        logger.info(`Storing project ${project.gameName} with appId ${project.appId} in RedisSearch`)
        try {
          await storeGameInRedis(project.gameName, project.appId, project.metadata.banner)
        } catch (error) {
          logger.error('Error storing game in Redis:', error)
        }
        try {
          await redisCacheGitHubProjectDetails(project, project.appId, project.gameName)
        } catch (error) {
          logger.error('Error storing project details in Redis:', error)
        }
      }
    }
  } catch (error) {
    logger.error('Error updating game index:', error)
  }
}

/**
 * Fetches project details by app ID or game name.
 * If cached data is available in Redis, returns it immediately.
 * Otherwise, fetches the data from GitHub, caches it, and returns the result.
 *
 * @param {string|number} appId - The App ID to search for.
 * @param {string} gameName - The game name to search for if App ID is not available.
 * @param {string|null} [authToken=null] - GitHub auth token for API access.
 * @returns {Promise<Object>} - Returns the project object or null if not found.
 */
const fetchProjectsByAppIdOrGameName = async (appId, gameName, authToken = null) => {
  const cachedData = await redisLookupGitHubProjectDetails(appId, gameName)
  if (cachedData) {
    return cachedData
  }
  const searchTerm = appId ? `appid="${appId}"` : `name="${decodeURIComponent(gameName)}"`
  const projects = await fetchProject(searchTerm, authToken)
  if (projects && projects.length > 0) {
    if (projects.length > 1) {
      // If there were more than one, then something is wrong with the query or data stored in GitHub.
      logger.warning(`GitHub returned more than one project result for "${searchTerm}"`)
    }
    const project = projects[0]
    try {
      await redisCacheGitHubProjectDetails(project, appId, gameName)
    } catch (error) {
      logger.error('Error storing project details in Redis:', error)
    }
    return project
  }
  logger.error(`No GitHub projects found for "${searchTerm}"`)
  // Cache an empty response for a short period of time
  await redisCacheGitHubProjectDetails({}, appId, gameName)
  return {}
}

/**
 * Fetches GitHub project data using GraphQL queries based on a search term.
 *
 * @param {string} searchTerm - Search term to filter projects (by app ID or game name).
 * @param {string|null} [authToken=null] - GitHub auth token for API access.
 * @returns {Promise<Array|*>} - List of project objects or an empty array if no results are found.
 */
const fetchProject = async (searchTerm, authToken = null) => {
  if (!authToken && defaultGithubAuthToken) {
    authToken = defaultGithubAuthToken
  }

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
        logger.error(`GitHub GraphQL API request failed with status ${response.status}: ${errorBody}`)
        return null
      }

      const responseData = await response.json()

      // Check for rate limit and log if it is
      if (responseData.errors) {
        for (const error of responseData.errors) {
          logger.error(`GitHub GraphQL API Error: ${error.message}`)
        }
      }

      if (!responseData.data?.node || !responseData.data?.node.projectsV2) {
        logger.info('No project data returned from org node.')
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
          metadata: {
            poster: '',
            hero: '',
            banner: ''
          },
          issues: []
        }

        // Parse Game data from project readme
        projectData.metadata = Object.fromEntries(
          Object.entries(await parseGameProjectBody(project.readme)).map(([key, value]) => [key.toLowerCase(), value])
        )

        // Parse issues list
        const schema = await fetchReportBodySchema()
        for (const node of project.items.nodes) {
          if (node.content.__typename === 'Issue' && node.content.body) {
            const parsedIssueData = await parseReportBody(node.content.body, schema)
            projectData.issues.push({
              id: node.content.databaseId,
              title: node.content.title,
              html_url: node.content.url,
              body: node.content.body,
              parsed_data: parsedIssueData,
              reactions: {
                'reactions_thumbs_up': node.content.reactions_thumbs_up.totalCount,
                'reactions_thumbs_down': node.content.reactions_thumbs_down.totalCount
              },
              labels: node.content.labels.nodes,
              user: node.content.author,
              created_at: node.content.createdAt,
              updated_at: node.content.updatedAt,
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
    logger.error('Error fetching organization projects:', error)
    return null
  }
}

/**
 * Fetches the report body schema from GitHub or Redis cache.
 * If the schema is available in Redis, it returns the cached version.
 * Otherwise, it fetches the schema from a remote GitHub URL, caches it, and returns it.
 *
 * @returns {Promise<Object>} - Returns the report body schema as an object.
 * @throws {Error} - Throws an error if fetching or parsing the schema fails.
 */
const fetchReportBodySchema = async () => {
  const cachedData = await redisLookupReportBodySchema()
  if (cachedData) {
    return cachedData
  }

  const schemaUrl = 'https://raw.githubusercontent.com/DeckSettings/deck-settings-db/refs/heads/master/.github/scripts/config/game-report-validation.json'

  try {
    logger.info('Fetching GitHub report body schema from URL')
    const response = await fetch(schemaUrl)
    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`GitHub raw request failed when fetching report body schema with status ${response.status}: ${errorBody}`)
      throw new Error('Failed to report body schema from GitHub repository. Non-success response received from GitHub')
    }

    const schema = await response.json()
    if (schema) {
      await redisCacheReportBodySchema(schema)
    }
    return schema
  } catch (error) {
    logger.error('Error fetching or parsing schema:', error)
    throw error // Re-throw the error to be handled by the caller
  }
}

/**
 * Fetches GitHub issue labels from the repository, utilizing Redis caching to reduce API calls.
 * If the labels are cached in Redis, the cached data is returned. Otherwise, the labels are
 * fetched from the GitHub API, cached in Redis, and returned.
 *
 * @param {string|null} [authToken=null] - GitHub authentication token. If not provided, the default token is used.
 * @returns {Promise<Array>} - Returns an array of issue labels from the GitHub repository.
 * @throws {Error} - Throws an error if the GitHub API request fails.
 */
const fetchIssueLabels = async (authToken = null) => {
  const cachedData = await redisLookupGitHubIssueLabels()
  if (cachedData) {
    return cachedData
  }

  // Use default API auth token if none provided
  if (!authToken && defaultGithubAuthToken) {
    authToken = defaultGithubAuthToken
  }

  logger.info('Fetching labels from GitHub API')
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
    logger.error(`GitHub API request failed with status ${response.status}: ${errorBody}`)
    throw new Error('Failed to fetch labels from GitHub API. Non-success response received from GitHub')
  }
  const data = await response.json()
  if (data) {
    await redisCacheGitHubIssueLabels(data)
  }
  return data
}

/**
 * Retrieves the organization ID from GitHub based on the provided organization name.
 * Uses the GitHub GraphQL API to query for the organization ID.
 *
 * @param {string} orgName - The name of the GitHub organization.
 * @param {string} authToken - GitHub authentication token required for API access.
 * @returns {Promise<string>} - Returns the organization ID as a string.
 * @throws {Error} - Throws an error if the API request fails or if the organization is not found.
 */
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
      logger.error(`GitHub GraphQL API request failed with status ${response.status}: ${errorBody}`)
      throw new Error('Failed to fetch organization ID')
    }

    const responseData = await response.json()
    return responseData.data.organization.id
  } catch (error) {
    logger.error('Error fetching organization ID:', error)
    throw error
  }
}

module.exports = {
  fetchReports,
  fetchProject,
  updateGameIndex,
  fetchProjectsByAppIdOrGameName,
  fetchIssueLabels,
  getOrgId
}
