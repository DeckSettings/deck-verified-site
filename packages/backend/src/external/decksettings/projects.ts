import logfmt from 'logfmt'
import config from '../../config'
import logger, { logMetric } from '../../logger'
import {
  redisCacheExtData,
  redisLookupExtData,
  storeGameInRedis,
} from '../../redis'
import { fetchReportBodySchema } from './report_body_schema'
import { fetchHardwareInfo } from './hw_info'
import { parseGameProjectBody, parseReportBody, isValidNumber } from '../../helpers'
import type {
  GitHubProjectDetails,
  GitHubProjectGameDetails,
  GitHubIssueLabel,
  GitHubReportIssueBodySchema,
} from '../../../../shared/src/game'
import { fetchAuthorReportCount } from './reports'

/**
 * Caches GitHub project details in Redis.
 */
const redisCacheGitHubProjectDetails = async (
  data: GitHubProjectGameDetails | Record<string, never>,
  appId: string | null = null,
  gameName: string | null = null,
): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching GitHub project details.')
  }
  if (!appId && !gameName) {
    throw new Error('Either an AppID or Game Name is required.')
  }

  const redisKey = appId
    ? `github:project_details:appid:${appId}`
    : `github:project_details:name:${gameName}`

  const cacheTime = 60 * 60 * 24 * 14 // 14 days
  try {
    await redisCacheExtData(JSON.stringify(data), redisKey, cacheTime)
    logger.info(`Cached GitHub project details for ${cacheTime} seconds with key ${redisKey}`)
  } catch (error) {
    logger.error(`Redis error while caching GitHub project details for key "${redisKey}":`, error)
  }
}

/**
 * Looks up GitHub project details from Redis by AppID or Game Name.
 */
const redisLookupGitHubProjectDetails = async (
  appId: string | null = null,
  gameName: string | null = null,
): Promise<GitHubProjectGameDetails | null> => {
  if (!appId && !gameName) {
    throw new Error('Either an AppID or Game Name is required.')
  }

  const redisKey = appId
    ? `github:project_details:appid:${appId}`
    : `github:project_details:name:${gameName}`

  try {
    const cachedData = await redisLookupExtData(redisKey)
    if (cachedData) {
      logger.info(`Retrieved GitHub project for AppID "${appId}" or Game Name "${gameName}" from Redis cache`)
      return JSON.parse(cachedData) as GitHubProjectGameDetails
    }
  } catch (error) {
    logger.error('Redis error while fetching cached GitHub project details:', error)
  }
  return null
}

/**
 * Parses the provided GitHub project data to extract and structure relevant information
 * into the GitHubProjectGameDetails format.
 */
export const parseProjectDetails = async (
  project: GitHubProjectDetails,
  authToken: string | null = null,
): Promise<GitHubProjectGameDetails> => {
  const reportBodySchema: GitHubReportIssueBodySchema = await fetchReportBodySchema()
  const hardwareInfo = await fetchHardwareInfo()

  const parsedTitle = logfmt.parse(project.title)

  const projectDetails: GitHubProjectGameDetails = {
    projectNumber: project.number,
    gameName: parsedTitle.name ? String(parsedTitle.name) : '',
    appId: isValidNumber(Number(parsedTitle.appid)) ? Number(parsedTitle.appid) : null,
    shortDescription: project.shortDescription,
    readme: project.readme,
    metadata: {
      poster: '',
      hero: '',
      banner: '',
      background: '',
    },
    reports: [],
  }

  const rawMetadata = await parseGameProjectBody(project.readme)
  projectDetails.metadata = {
    poster: rawMetadata.poster,
    hero: rawMetadata.hero,
    banner: rawMetadata.banner,
    background: rawMetadata.background,
  }

  for (const issue of project.issues) {
    // Skip issues missing body
    if (!issue?.body) continue

    // Skip issues with an invalid template label
    const hasInvalidLabel = issue.labels.some((label: GitHubIssueLabel) => label.name === 'invalid:template-incomplete')
    if (hasInvalidLabel) continue

    // Check if the issue is closed (currently commented out because we are filtering at the GitHub API results)
    // if (issue.closed) {
    //   continue
    // }

    try {
      const parsedIssueData = await parseReportBody(issue.body, reportBodySchema, hardwareInfo)
      projectDetails.reports.push({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        html_url: issue.html_url,
        data: parsedIssueData,
        metadata: projectDetails.metadata,
        reactions: {
          reactions_thumbs_up: issue.reactions['+1'] || 0,
          reactions_thumbs_down: issue.reactions['-1'] || 0,
        },
        comments: issue.comments,
        labels: issue.labels.map((label: GitHubIssueLabel) => ({
          name: label.name,
          color: label.color,
          description: label.description || '',
        })),
        user: {
          login: issue.user.login,
          avatar_url: issue.user.avatar_url,
          report_count: await fetchAuthorReportCount(issue.user.login, authToken),
        },
        created_at: issue.created_at,
        updated_at: issue.updated_at,
      })
    } catch (err) {
      logger.error('Failed to parse report body for project issue:', err)
      continue
    }
  }
  projectDetails.reports.sort((a, b) => {
    const thumbsDiff = (b.reactions?.reactions_thumbs_up ?? 0) - (a.reactions?.reactions_thumbs_up ?? 0)
    if (thumbsDiff !== 0) {
      return thumbsDiff
    }
    const getDate = (report: typeof a): number => {
      const updated = report.updated_at ? new Date(report.updated_at).getTime() : null
      const created = report.created_at ? new Date(report.created_at).getTime() : null
      return updated ?? created ?? 0
    }
    return getDate(b) - getDate(a)
  })
  return projectDetails
}

/**
 * Fetches GitHub project data using GraphQL queries based on a search term.
 */
export const fetchProject = async (
  searchTerm: string,
  authToken: string | null = null,
): Promise<GitHubProjectDetails[] | null> => {
  if (!authToken && config.defaultGithubAuthToken) {
    authToken = config.defaultGithubAuthToken
  }

  // GraphQL uses a points-based cost model. Increasing the results requested increases the points used.
  // We have 5k points per hour. Cost can be roughly calculated by (maxReportsPerGame * maxGamesPerRequest / 100).
  // As we increase in the number of games with reports, this will need to be refined.
  const maxReportsPerGame = 10  // This will set the max number of issues returned per request
  const maxGamesPerRequest = 10 // This will configure how many requests need to be made to fetch all games matching the search term

  const orgNodeId = 'O_kgDOC35waw'
  const query = `
    query fetchOrgProjects($orgId: ID!, $cursor: String, $searchTerm: String!) {
      rateLimit {
        limit
        cost
        remaining
        resetAt
      }
      node(id: $orgId) {
        ... on Organization {
          projectsV2(first: ${maxGamesPerRequest}, after: $cursor, query: $searchTerm) {
            nodes {
              id
              title
              number
              shortDescription
              readme
              url
              items(first: ${maxReportsPerGame}) {
                nodes {
                  content {
                    __typename
                    ... on Issue {
                      databaseId
                      number
                      title
                      url
                      body
                      labels(first: 10) {
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
                      closed
                      createdAt
                      updatedAt
                      comments {
                        totalCount
                      }
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
    let totalQueryCost = 0

    while (hasNextPage) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (authToken) {
        headers['Authorization'] = `bearer ${authToken}`
      }

      const response: Response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          variables: {
            orgId: orgNodeId,
            cursor: endCursor,
            searchTerm,
          },
        }),
      })

      // Attempt to record GitHub rate limit headers as a metric.
      try {
        const rlLimit = response.headers.get('x-ratelimit-limit')
        const rlRemaining = response.headers.get('x-ratelimit-remaining')
        const rlUsed = response.headers.get('x-ratelimit-used')
        const rlReset = response.headers.get('x-ratelimit-reset')
        const rlResource = response.headers.get('x-ratelimit-resource')

        const metricAdditional: Record<string, any> = {
          rate_limit: rlLimit,
          rate_limit_remaining: rlRemaining,
          rate_limit_used: rlUsed,
          rate_limit_reset: rlReset,
          rate_limit_resource: rlResource,
        }
        const headerMetricValue = `[${endCursor ?? '_'}] ${searchTerm || '_'}`

        // We do not have a user_id in this context.
        // To avoid logging metrics for another user's tokens, only record when the auth token is the default.
        if (authToken === config.defaultGithubAuthToken) {
          logMetric('github_rate_limit', headerMetricValue, metricAdditional)
        }
      } catch (e) {
        logger.error('Failed to log GitHub rate limit metric:', e)
      }

      if (!response.ok) {
        const errorBody = await response.text()
        logger.error(`GitHub GraphQL API request failed with status ${response.status}: ${errorBody}`)
        return null
      }

      const responseData = await response.json()

      // Attempt to record GitHub API rate limit request cost as a metric.
      try {
        if (responseData?.data?.rateLimit) {
          const rl = responseData.data.rateLimit
          const cost = typeof rl.cost === 'number' ? rl.cost : parseInt(String(rl.cost || '0'), 10) || 0
          totalQueryCost += cost // Accumulate cost for the whole fetchProject call
          const metricValue = `[${endCursor ?? '_'}] ${searchTerm || '_'}`
          logMetric('github_fetch_project_query_rate_limit_cost', metricValue, {
            rate_limit: rl.limit,
            rate_limit_remaining: rl.remaining,
            rate_limit_cost: cost,
            rate_limit_reset: rl.resetAt,
          })
        }
      } catch (e) {
        logger.error('Failed to log GraphQL rateLimit cost data:', e)
      }

      if (responseData.errors) {
        responseData.errors.forEach((error: {
          message: string
        }) => logger.error(`GitHub GraphQL API Error: ${error.message}`))
      }

      if (!responseData.data?.node || !responseData.data?.node.projectsV2) {
        logger.info('No project data returned from org node.')
        return null
      }

      discoveredProjects.push(...responseData.data.node.projectsV2.nodes)

      for (const project of discoveredProjects) {
        const projectData: GitHubProjectDetails = {
          title: project.title,
          number: project.number,
          shortDescription: project.shortDescription,
          readme: project.readme,
          metadata: {
            poster: '',
            hero: '',
            banner: '',
            background: '',
          },
          issues: [],
        }
        for (const node of project.items.nodes) {
          if (node.content.__typename === 'Issue' && node.content.body) {
            if (node.content.closed) {
              // Ignore any issues that are closed
              continue
            }
            projectData.issues.push({
              id: node.content.databaseId,
              number: node.content.number,
              title: node.content.title,
              html_url: node.content.url,
              body: node.content.body,
              reactions: {
                '+1': node.content.reactions_thumbs_up.totalCount,
                '-1': node.content.reactions_thumbs_down.totalCount,
              },
              labels: node.content.labels.nodes,
              user: node.content.author,
              closed: node.content.closed,
              created_at: node.content.createdAt,
              updated_at: node.content.updatedAt,
              comments: node.content.comments.totalCount,
            })
          }
        }
        returnProjects.push(projectData)
      }

      hasNextPage = responseData.data.node.projectsV2.pageInfo.hasNextPage
      endCursor = responseData.data.node.projectsV2.pageInfo.endCursor
    }

    // After paging loop completes, log total query cost metric for this fetchProject call
    try {
      const totalMetricValue = `[${endCursor ?? '_'}] ${searchTerm || '_'}`
      logMetric('github_fetch_project_query_rate_limit_total_cost', totalMetricValue, {
        total_rate_limit_cost: totalQueryCost,
      })
    } catch (e) {
      logger.error('Failed to log total GraphQL query cost metric:', e)
    }

    return returnProjects
  } catch (error) {
    logger.error('Error fetching organization packages:', error)
    return null
  }
}

/**
 * Fetches project details by app ID or game name.
 */
export const fetchProjectsByAppIdOrGameName = async (
  appId: string | null,
  gameName: string | null,
  authToken: string | null = null,
  forceRefresh: boolean = false,
): Promise<GitHubProjectGameDetails | Record<string, never>> => {
  if (!appId && !gameName) {
    throw new Error('Either appId or gameName must be provided.')
  }

  if (!forceRefresh) {
    const cachedData = await redisLookupGitHubProjectDetails(appId, gameName)
    if (cachedData) {
      logger.info(`Using cached results for GitHub project search by appId:'${appId}', gameName:'${gameName}'`)
      return cachedData
    }
  }

  const searchTerm = appId ? `appid="${appId}"` : `name="${decodeURIComponent(gameName!)}"`
  const projects = await fetchProject(searchTerm, authToken)

  if (projects && projects.length > 0) {
    if (projects.length > 1) {
      logger.warn(`GitHub returned more than one project result for "${searchTerm}"`)
    }

    const project = projects[0]
    if (project) {
      const parsedProject = await parseProjectDetails(project, authToken)
      try {
        await redisCacheGitHubProjectDetails(parsedProject, appId, gameName)
      } catch (error) {
        logger.error('Error storing project details in Redis:', error)
      }
      return parsedProject
    }
  }
  logger.warn(`No GitHub projects found for "${searchTerm}". Caching empty response.`)
  // Cache an empty response for a short period of time
  // TODO: Handle a rate limit by github with a longer cache of this data. I think setting this to 1 week is fine as the scheduled task will update it if a report is submitted anyway.
  await redisCacheGitHubProjectDetails({}, appId, gameName)
  return {}
}

/**
 * Updates the Redis cache with the latest game data from GitHub org packages.
 */
export const updateGameIndex = async (authToken: string | null): Promise<void> => {
  try {
    const projects = await fetchProject('', authToken)
    if (projects) {
      for (const project of projects) {
        const parsedProject = await parseProjectDetails(project, authToken)
        logger.info(`Storing project ${parsedProject.gameName} with appId ${parsedProject.appId} in RedisSearch`)
        try {
          await storeGameInRedis({
            gameName: parsedProject.gameName,
            appId: typeof parsedProject.appId === 'number' ? String(parsedProject.appId) : null,
            banner: parsedProject.metadata.banner || null,
            poster: parsedProject.metadata.poster || null,
            reportCount: parsedProject.reports.length,
          })
        } catch (error) {
          logger.error('Error storing game in Redis:', error)
        }
        try {
          let appId: string | null = String(parsedProject.appId)
          if (!parsedProject.appId) {
            appId = null
          }
          await redisCacheGitHubProjectDetails(parsedProject, appId, parsedProject.gameName)
        } catch (error) {
          logger.error('Error storing project details in Redis:', error)
        }
      }
    }
  } catch (error) {
    logger.error('Error updating game index:', error)
  }
}
