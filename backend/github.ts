import logfmt from 'logfmt'
//import { parseGameProjectBody, parseReportBody } from './helpers'
import logger from './logger'
import {
  storeGameInRedis,
  redisLookupGitHubIssueLabels,
  redisCacheGitHubIssueLabels,
  redisLookupReportBodySchema,
  redisCacheReportBodySchema,
  redisLookupGitHubProjectDetails,
  redisCacheGitHubProjectDetails
} from './redis'
import type {
  GitHubIssueLabel,
  GithubIssuesSearchResult,
  GitHubProjectDetails,
  GitHubReportIssueBodySchema
} from './types/game'
import { parseGameProjectBody, parseReportBody } from './helpers'

// Configure default GitHub auth token
const defaultGithubAuthToken: string | null = process.env.GH_TOKEN || null

/**
 * Fetches reports from a GitHub repository using the search API.
 * Filters and sorts issues based on specified criteria.
 */
export const fetchReports = async (
  repoOwner: string = 'DeckSettings',
  repoName: string = 'game-reports-steamos',
  state: 'open' | 'closed' | 'all' = 'open',
  sort: 'reactions-+1' | 'created' | 'updated' | 'comments' = 'updated',
  direction: 'asc' | 'desc' = 'desc',
  limit: number | null = null
): Promise<GithubIssuesSearchResult | null> => {
  const encodedSort = encodeURIComponent(sort)
  let url = `https://api.github.com/search/issues?q=repo:${repoOwner}/${repoName}+state:${state}+is:issue&sort=${encodedSort}&order=${direction}`
  if (limit !== null) {
    url += `&per_page=${limit}`
  }

  try {
    const response = await fetch(url)
    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`GitHub API request failed with status ${response.status}: ${errorBody}`)
      return null
    }
    return await response.json()
  } catch (error) {
    logger.error(`Error fetching reports: ${error}`)
    return null
  }
}

/**
 * Updates the Redis cache with the latest game data from GitHub org projects.
 */
export const updateGameIndex = async (): Promise<void> => {
  try {
    const authToken = defaultGithubAuthToken || null

    const projects = await fetchProject('', authToken)
    if (projects) {
      for (const project of projects) {
        logger.info(`Storing project ${project.gameName} with appId ${project.appId} in RedisSearch`)
        try {
          await storeGameInRedis(project.gameName, String(project.appId), project.metadata.banner || '')
        } catch (error) {
          logger.error('Error storing game in Redis:', error)
        }
        try {
          await redisCacheGitHubProjectDetails(project, String(project.appId), project.gameName)
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
 */
export const fetchProjectsByAppIdOrGameName = async (
  appId: string | null,
  gameName: string | null,
  authToken: string | null = null
): Promise<GitHubProjectDetails | Record<string, never>> => {
  if (!appId && !gameName) {
    throw new Error('Either appId or gameName must be provided.')
  }

  const cachedData = await redisLookupGitHubProjectDetails(appId, gameName)
  if (cachedData) {
    logger.info(`Using cached results for GitHub project search by appId:'${appId}', gameName:'${gameName}'`)
    return cachedData
  }

  const searchTerm = appId ? `appid="${appId}"` : `name="${decodeURIComponent(gameName!)}"`
  const projects = await fetchProject(searchTerm, authToken)

  if (projects && projects.length > 0) {
    if (projects.length > 1) {
      logger.warn(`GitHub returned more than one project result for "${searchTerm}"`)
    }

    const project = projects[0]
    if (project) {
      try {
        await redisCacheGitHubProjectDetails(project, appId, gameName)
      } catch (error) {
        logger.error('Error storing project details in Redis:', error)
      }
      return project
    }
  }

  logger.error(`No GitHub projects found for "${searchTerm}"`)

  // Cache an empty response for a short period of time
  await redisCacheGitHubProjectDetails({}, appId, gameName)
  return {}
}

/**
 * Fetches GitHub project data using GraphQL queries based on a search term.
 */
export const fetchProject = async (
  searchTerm: string,
  authToken: string | null = null
): Promise<GitHubProjectDetails[] | null> => {
  if (!authToken && defaultGithubAuthToken) {
    authToken = defaultGithubAuthToken
  }

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
    let endCursor: string | null = null
    const discoveredProjects: any[] = []
    const returnProjects: GitHubProjectDetails[] = []

    while (hasNextPage) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      if (authToken) {
        headers['Authorization'] = `bearer ${authToken}`
      }

      const response: Response = await fetch('https://api.github.com/graphql', {
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

      if (responseData.errors) {
        responseData.errors.forEach((error: { message: string }) =>
          logger.error(`GitHub GraphQL API Error: ${error.message}`)
        )
      }

      if (!responseData.data?.node || !responseData.data?.node.projectsV2) {
        logger.info('No project data returned from org node.')
        return null
      }

      discoveredProjects.push(...responseData.data.node.projectsV2.nodes)

      const schema = await fetchReportBodySchema()

      for (const project of discoveredProjects) {
        const parsedTitle = logfmt.parse(project.title)

        const projectData: GitHubProjectDetails = {
          gameName: parsedTitle.name ? String(parsedTitle.name) : '',
          appId: parsedTitle.appid ? Number(parsedTitle.appid) : null,
          projectNumber: project.number,
          shortDescription: project.shortDescription,
          readme: project.readme,
          metadata: {
            poster: '',
            hero: '',
            banner: '',
            background: ''
          },
          issues: []
        }

        const rawMetadata = await parseGameProjectBody(project.readme)
        projectData.metadata = {
          poster: rawMetadata.poster ?? null,
          hero: rawMetadata.hero ?? null,
          banner: rawMetadata.banner ?? null,
          background: rawMetadata.background ?? null
        }

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
                reactions_thumbs_up: node.content.reactions_thumbs_up.totalCount,
                reactions_thumbs_down: node.content.reactions_thumbs_down.totalCount
              },
              labels: node.content.labels.nodes,
              user: node.content.author,
              created_at: node.content.createdAt,
              updated_at: node.content.updatedAt
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
 */
const fetchReportBodySchema = async (): Promise<GitHubReportIssueBodySchema> => {
  const cachedData = await redisLookupReportBodySchema()
  if (cachedData) {
    return cachedData
  }

  const schemaUrl = 'https://raw.githubusercontent.com/DeckSettings/game-reports-steamos/refs/heads/master/.github/scripts/config/game-report-validation.json'

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
 */
export const fetchIssueLabels = async (authToken: string | null = null): Promise<GitHubIssueLabel[]> => {
  const cachedData = await redisLookupGitHubIssueLabels()
  if (cachedData) {
    return cachedData as GitHubIssueLabel[]
  }

  // Use default API auth token if none provided
  if (!authToken && defaultGithubAuthToken) {
    authToken = defaultGithubAuthToken
  }

  logger.info('Fetching labels from GitHub API')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (authToken) {
    headers['Authorization'] = `bearer ${authToken}`
  }

  const response = await fetch('https://api.github.com/repos/DeckSettings/game-reports-steamos/labels', {
    method: 'GET',
    headers
  })

  if (!response.ok) {
    const errorBody = await response.text()
    logger.error(`GitHub API request failed with status ${response.status}: ${errorBody}`)
    throw new Error('Failed to fetch labels from GitHub API. Non-success response received from GitHub')
  }

  const data: GitHubIssueLabel[] = await response.json()

  if (data) {
    await redisCacheGitHubIssueLabels(data)
  }

  return data
}
