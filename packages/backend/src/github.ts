import logfmt from 'logfmt'
import YAML from 'yaml'
import config from './config'
import logger from './logger'
import type { GitHubIdentity, GitHubTokenResponse } from '../../shared/src/auth'
import {
  redisCacheAuthorGameReportCount, redisCacheGameReportTemplate,
  redisCacheGitHubIssueLabels,
  redisCacheGitHubProjectDetails,
  redisCacheHardwareInfo,
  redisCachePopularGameReports,
  redisCacheRecentGameReports,
  redisCacheReportBodySchema,
  redisLookupAuthorGameReportCount, redisLookupGameReportTemplate,
  redisLookupGitHubIssueLabels,
  redisLookupGitHubProjectDetails,
  redisLookupHardwareInfo,
  redisLookupPopularGameReports,
  redisLookupRecentGameReports,
  redisLookupReportBodySchema, searchGamesInRedis,
  storeGameInRedis,
} from './redis'
import {
  GameMetadata,
  GameReport, GameReportForm, GitHubIssueLabel,
  GithubIssuesSearchResult,
  GitHubProjectDetails, GitHubProjectGameDetails,
  GitHubReportIssueBodySchema, HardwareInfo,
} from '../../shared/src/game'
import { generateImageLinksFromAppId, isValidNumber, parseGameProjectBody, parseReportBody } from './helpers'
import type { GitHubIssueTemplate } from '../../shared/src/game'

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'

/**
 * Builds the GitHub OAuth authorize URL with PKCE support using repository configuration.
 */
export const buildGitHubAuthorizeUrl = ({ state, codeChallenge, redirectUri }: {
  state: string
  codeChallenge: string
  redirectUri: string
}): string => {
  const clientId = config.githubAppClientId
  if (!clientId) {
    throw new Error('GitHub App client ID is not configured.')
  }

  const url = new URL(GITHUB_AUTHORIZE_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  return url.toString()
}

/**
 * Exchanges the GitHub OAuth code for access and refresh tokens using PKCE verifier.
 */
export const exchangeGitHubCodeForTokens = async ({ code, redirectUri, codeVerifier }: {
  code: string
  redirectUri: string
  codeVerifier: string
}): Promise<GitHubTokenResponse> => {
  const clientId = config.githubAppClientId
  const clientSecret = config.githubAppClientSecret
  if (!clientId || !clientSecret) {
    throw new Error('GitHub App credentials are not configured.')
  }

  try {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      logger.error(`GitHub token exchange failed with ${response.status}: ${text}`)
      return { error: 'token_exchange_failed', error_description: text }
    }

    return await response.json() as GitHubTokenResponse
  } catch (error) {
    logger.error('GitHub token exchange network error:', error)
    return { error: 'token_exchange_failed', error_description: 'network_error' }
  }
}

/**
 * Refreshes a GitHub OAuth access token using the provided refresh token.
 */
export const refreshGitHubTokens = async ({ refreshToken }: {
  refreshToken: string
}): Promise<GitHubTokenResponse> => {
  const clientId = config.githubAppClientId
  const clientSecret = config.githubAppClientSecret
  if (!clientId || !clientSecret) {
    throw new Error('GitHub App credentials are not configured.')
  }

  try {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      logger.error(`GitHub token refresh failed with ${response.status}: ${text}`)
      return { error: 'token_refresh_failed', error_description: text }
    }

    return await response.json() as GitHubTokenResponse
  } catch (error) {
    logger.error('GitHub token refresh network error:', error)
    return { error: 'token_refresh_failed', error_description: 'network_error' }
  }
}

/**
 * Fetches the minimal GitHub identity information required to mint DV tokens.
 */
export const fetchGitHubUserIdentity = async (accessToken: string): Promise<GitHubIdentity> => {
  if (!accessToken) {
    throw new Error('missing_access_token_for_identity_lookup')
  }

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'DeckVerified API',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      logger.warn(`GitHub identity lookup failed with ${response.status}: ${text}`)
      throw new Error('github_identity_lookup_failed')
    }

    const body = await response.json() as Partial<GitHubIdentity>
    if (typeof body?.id !== 'number' || typeof body?.login !== 'string') {
      throw new Error('github_identity_lookup_invalid_response')
    }

    return { id: body.id, login: body.login }
  } catch (error) {
    logger.error('GitHub identity lookup error:', error)
    throw error
  }
}

/**
 * Fetches reports from a GitHub repository using the search API.
 * Filters and sorts issues based on specified criteria.
 */
export const fetchReports = async (
  repoName: string = 'game-reports-steamos',
  filterState: 'open' | 'closed' | null = 'open',
  filterAuthor: string | null = null,
  sort: 'reactions-+1' | 'created' | 'updated' | 'comments' = 'updated',
  direction: 'asc' | 'desc' = 'desc',
  limit: number | null = null,
  excludeInvalid: boolean = true,
  accessToken: string | null = null,
): Promise<GithubIssuesSearchResult | null> => {
  const repoOwner = 'DeckSettings'
  const encodedSort = encodeURIComponent(sort)
  let query = `repo:${repoOwner}/${repoName}+is:issue`
  if (filterState) {
    query += `+state:${filterState}`
  }
  if (filterAuthor) {
    query += `+author:${filterAuthor}`
  }
  if (excludeInvalid) {
    query += '+-label:invalid:template-incomplete'
  }
  let url = `https://api.github.com/search/issues?q=${query}&sort=${encodedSort}&order=${direction}`
  if (limit !== null) {
    url += `&per_page=${limit}`
  }

  try {
    const headers: HeadersInit = {}
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const response = await fetch(url, {
      headers,
      cache: 'no-store',
    })

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
 * Updates the Redis cache with the latest game data from GitHub org packages.
 */
export const updateGameIndex = async (): Promise<void> => {
  try {
    const authToken = config.defaultGithubAuthToken

    const projects = await fetchProject('', authToken)
    if (projects) {
      for (const project of projects) {
        const parsedProject = await parseProjectDetails(project)
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

/**
 * Parses the provided GitHub project data to extract and structure relevant information
 * into the GitHubProjectDetails format.
 */
const parseProjectDetails = async (project: GitHubProjectDetails): Promise<GitHubProjectGameDetails> => {
  const reportBodySchema = await fetchReportBodySchema()
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
    // Check if the issue has the "invalid:template-incomplete" label
    const hasInvalidLabel = issue.labels.some(
      (label: GitHubIssueLabel) => label.name === 'invalid:template-incomplete',
    )
    if (hasInvalidLabel) {
      continue
    }
    // Check if the issue is closed (currently commented out because we are filtering at the GitHub API results)
    // if (issue.closed) {
    //   continue
    // }
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
      labels: issue.labels.map((label: GitHubIssueLabel) => ({
        name: label.name,
        color: label.color,
        description: label.description || '',
      })),
      user: {
        login: issue.user.login,
        avatar_url: issue.user.avatar_url,
        report_count: await fetchAuthorReportCount(issue.user.login),
      },
      created_at: issue.created_at,
      updated_at: issue.updated_at,
    })
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
 * Parses the provided GitHub issues data to extract and structure relevant
 * information into the GameReport format. It also processes the issue body using a schema
 * to populate the `data` field of each GameReport.
 */
const parseGameReport = async (reports: GithubIssuesSearchResult): Promise<GameReport[]> => {
  const [schema, hardwareInfo] = await Promise.all([fetchReportBodySchema(), fetchHardwareInfo()])
  const hasMissingMetadata = (m: Partial<GameMetadata>): boolean =>
    m.banner == null ||
    m.poster == null ||
    m.hero == null ||
    m.background == null

  return Promise.all(
    reports.items.map(async (report) => {
      const parsedIssueData = await parseReportBody(report.body, schema, hardwareInfo)
      let metadata: Partial<GameMetadata> = {
        banner: null,
        poster: null,
        hero: null,
        background: null,
      }
      if (parsedIssueData.game_name) {
        const games = await searchGamesInRedis(null, null, parsedIssueData.game_name)
        if (games.length > 0) {
          const redisResult = games[0]
          metadata = {
            banner: metadata.banner ?? redisResult.banner,
            poster: metadata.poster ?? redisResult.poster,
            hero: metadata.hero,
            background: metadata.background,
          }
        }
      }
      if (parsedIssueData.app_id) {
        if (hasMissingMetadata(metadata)) {
          const games = await searchGamesInRedis(null, parsedIssueData.app_id.toString(), null)
          if (games.length > 0) {
            const redisResult = games[0]
            metadata = {
              banner: metadata.banner ?? redisResult.banner,
              poster: metadata.poster ?? redisResult.poster,
              hero: metadata.hero,
              background: metadata.background,
            }
          }
        }
        // Generate metadata from AppId links as a fallback if still missing
        if (hasMissingMetadata(metadata)) {
          const fallbackImages = await generateImageLinksFromAppId(String(parsedIssueData.app_id))
          metadata = {
            banner: metadata.banner ?? fallbackImages.banner,
            poster: metadata.poster ?? fallbackImages.poster,
            hero: metadata.hero ?? fallbackImages.hero,
            background: metadata.background ?? fallbackImages.background,
          }
        }
      }
      return {
        id: report.id,
        number: report.number,
        title: report.title,
        html_url: report.html_url,
        data: parsedIssueData,
        metadata: metadata as GameMetadata,
        reactions: {
          reactions_thumbs_up: report.reactions['+1'] || 0,
          reactions_thumbs_down: report.reactions['-1'] || 0,
        },
        labels: report.labels.map((label: GitHubIssueLabel) => ({
          name: label.name,
          color: label.color,
          description: label.description || '',
        })),
        user: {
          login: report.user.login,
          avatar_url: report.user.avatar_url,
          report_count: null,
        },
        created_at: report.created_at,
        updated_at: report.updated_at,
      }
    }),
  )
}

/**
 * Retrieves the most recent game reports from Redis if available.
 * If not cached, it fetches the reports from GitHub, parses the data into GameReport format,
 * and caches the results in Redis for future use.
 */
export const fetchRecentReports = async (count: number = 5): Promise<GameReport[]> => {
  try {
    const cachedData = await redisLookupRecentGameReports(count)
    if (cachedData) {
      logger.info('Serving recent reports from Redis cache')
      return cachedData
    }

    const reports = await fetchReports(undefined, 'open', null, 'updated', 'desc', count)
    if (reports && reports?.items?.length > 0) {
      const returnData = await parseGameReport(reports)
      // Store the transformed data in the Redis cache
      await redisCacheRecentGameReports(returnData, count)
      return returnData
    }

    logger.info('No reports found.')
    return []
  } catch (error) {
    logger.error('Error fetching popular reports:', error)

    // Cache an empty response for a short period of time
    await redisCacheRecentGameReports([], count)
    return []
  }
}

/**
 * Retrieves the most popular game reports (sorted by the highest number of
 * thumbs-up reactions) from Redis if available. If not cached, it fetches the reports
 * from GitHub, parses the data into GameReport format, and caches the results in Redis
 * for future use.
 */
export const fetchPopularReports = async (count: number = 5): Promise<GameReport[]> => {
  try {
    const cachedData = await redisLookupPopularGameReports(count)
    if (cachedData) {
      logger.info('Serving popular reports from Redis cache')
      return cachedData
    }

    const reports = await fetchReports(undefined, 'open', null, 'reactions-+1', 'desc', count)
    if (reports && reports?.items?.length > 0) {
      const returnData = await parseGameReport(reports)
      // Store the transformed data in the Redis cache
      await redisCachePopularGameReports(returnData, count)
      return returnData
    }

    logger.info('No reports found.')
    return []
  } catch (error) {
    logger.error('Error fetching popular reports:', error)

    // Cache an empty response for a short period of time
    await redisCachePopularGameReports([], count)
    return []
  }
}

/**
 * Retrieves a count of game reports for a given author.
 */
export const fetchAuthorReportCount = async (author: string): Promise<number> => {
  try {
    const cachedData = await redisLookupAuthorGameReportCount(author)
    if (cachedData) {
      logger.info('Serving count of author reports from Redis cache')
      return cachedData
    }

    const reports = await fetchReports(undefined, 'open', author, 'updated', 'desc')
    if (reports && reports?.items?.length > 0) {
      // Store the transformed data in the Redis cache
      await redisCacheAuthorGameReportCount(reports.items.length, author)
      return reports.items.length
    }

    logger.info('No reports found.')
    return 0
  } catch (error) {
    logger.error('Error fetching count of author reports:', error)

    // Cache an empty response for a short period of time
    await redisCacheAuthorGameReportCount(0, author)
    return 0
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
      const parsedProject = await parseProjectDetails(project)
      try {
        await redisCacheGitHubProjectDetails(parsedProject, appId, gameName)
      } catch (error) {
        logger.error('Error storing project details in Redis:', error)
      }
      return parsedProject
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
  authToken: string | null = null,
): Promise<GitHubProjectDetails[] | null> => {
  if (!authToken && config.defaultGithubAuthToken) {
    authToken = config.defaultGithubAuthToken
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
                      number
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
                      closed
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
        'Content-Type': 'application/json',
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
            searchTerm: searchTerm,
          },
        }),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        logger.error(`GitHub GraphQL API request failed with status ${response.status}: ${errorBody}`)
        return null
      }

      const responseData = await response.json()

      if (responseData.errors) {
        responseData.errors.forEach((error: { message: string }) =>
          logger.error(`GitHub GraphQL API Error: ${error.message}`),
        )
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
    logger.error('Error fetching organization packages:', error)
    return null
  }
}

/**
 * Fetches the report body schema from GitHub or Redis cache.
 * If the schema is available in Redis, it returns the cached version.
 * Otherwise, it fetches the schema from a remote GitHub URL, caches it, and returns it.
 */
export const fetchReportBodySchema = async (): Promise<GitHubReportIssueBodySchema> => {
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
  if (!authToken && config.defaultGithubAuthToken) {
    authToken = config.defaultGithubAuthToken
  }

  logger.info('Fetching labels from GitHub API')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (authToken) {
    headers['Authorization'] = `bearer ${authToken}`
  }

  const response = await fetch('https://api.github.com/repos/DeckSettings/game-reports-steamos/labels', {
    method: 'GET',
    headers,
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

/**
 * Fetches the hardware details list from GitHub or Redis cache.
 * If the list is available in Redis, it returns the cached version.
 * Otherwise, it fetches the list from a remote GitHub URL, caches it, and returns it.
 */
export const fetchHardwareInfo = async (): Promise<HardwareInfo[]> => {
  const cachedData = await redisLookupHardwareInfo()
  if (cachedData) {
    return cachedData
  }

  const hardwareInfoUrl = 'https://raw.githubusercontent.com/DeckSettings/game-reports-steamos/refs/heads/master/.github/scripts/config/hardware.json'

  try {
    logger.info('Fetching GitHub hardware info from URL')
    const response = await fetch(hardwareInfoUrl)
    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`GitHub raw request failed when fetching hardware info with status ${response.status}: ${errorBody}`)
      throw new Error('Failed to hardware info from GitHub repository. Non-success response received from GitHub')
    }

    const info = await response.json()
    if (info.devices) {
      await redisCacheHardwareInfo(info.devices)
    }
    return info.devices
  } catch (error) {
    logger.error('Error fetching or parsing hardware info:', error)
    throw error // Re-throw the error to be handled by the caller
  }
}

/**
 * Fetches the game report template from GitHub or Redis cache.
 * This will also parse the YAML and return an object
 */
export const fetchGameReportTemplate = async (): Promise<GitHubIssueTemplate> => {
  const cachedData = await redisLookupGameReportTemplate()
  if (cachedData) {
    return cachedData
  }

  const gameReportTemplate = 'https://raw.githubusercontent.com/DeckSettings/game-reports-steamos/refs/heads/master/.github/ISSUE_TEMPLATE/GAME-REPORT.yml'

  try {
    logger.info('Fetching GitHub game report template from URL')
    const response = await fetch(gameReportTemplate)
    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`GitHub raw request failed when fetching game report template with status ${response.status}: ${errorBody}`)
      throw new Error('Failed to game report template from GitHub repository. Non-success response received from GitHub')
    }

    // Parse the response text as YAML
    const responseText = await response.text()
    const info = YAML.parse(responseText)
    if (info) {
      await redisCacheGameReportTemplate(info)
    }
    return info
  } catch (error) {
    logger.error('Error fetching or parsing game report template:', error)
    throw error // Re-throw the error to be handled by the caller
  }
}
