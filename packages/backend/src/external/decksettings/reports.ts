import config from '../../config'
import logger from '../../logger'
import {
  redisCacheExtData,
  redisLookupExtData,
  searchGamesInRedis,
} from '../../redis'
import { fetchReportBodySchema } from './report_body_schema'
import { fetchHardwareInfo } from './hw_info'
import { fetchProjectsByAppIdOrGameName } from './projects'
import {
  generateImageLinksFromAppId,
  parseReportBody,
} from '../../helpers'
import type {
  GameReport,
  GameMetadata,
  GithubIssuesSearchResult,
  GithubIssuesSearchResultItems,
  GitHubIssueLabel,
} from '../../../../shared/src/game'

/**
 * Fetches reports from a GitHub repository using the issues API.
 * Note: This method is preferred when filtering by author to avoid issues with private users.
 */
export const fetchReportsWithIssuesApi = async (
  repoName: string = 'game-reports-steamos',
  filterState: 'open' | 'closed' | null = 'open',
  filterAuthor: string | null = null,
  filterLabels: string[] | null = null,
  sort: 'created' | 'updated' | 'comments' = 'updated',
  direction: 'asc' | 'desc' = 'desc',
  limit: number | null = null,
  excludeInvalid: boolean = true,
  excludeLabels: string[] | null = null,
  accessToken: string | null = null,
): Promise<GithubIssuesSearchResult | null> => {
  const repoOwner = 'DeckSettings'

  const params = new URLSearchParams({
    sort: sort,
    direction,
  })

  if (filterState) {
    params.set('state', filterState)
  }
  if (filterAuthor) {
    params.set('creator', filterAuthor)
  }
  if (filterLabels && filterLabels.length > 0) {
    params.set('labels', filterLabels.join(','))
  }

  let url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues?${params.toString()}`

  try {
    const headers: HeadersInit = {}
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    let allIssues: any[] = []
    if (limit !== null && limit <= 0) {
      // No need to fetch if limit is 0 or less.
    } else if (limit !== null) {
      // Fetch up to the limit.
      url += `&per_page=${limit}`
      const response = await fetch(url, { headers, cache: 'no-store' })
      if (!response.ok) {
        const errorBody = await response.text()
        logger.error(
          `GitHub API request failed with status ${response.status} when fetching reports with issues API: ${errorBody}`,
        )
        return null
      }
      allIssues = await response.json()
    } else {
      // limit is null, fetch all pages.
      let page = 1
      let fetchMore = true
      while (fetchMore) {
        const pagedUrl = `${url}&page=${page}&per_page=100`
        const response = await fetch(pagedUrl, { headers, cache: 'no-store' })

        if (!response.ok) {
          const errorBody = await response.text()
          logger.error(
            `GitHub API request failed with status ${response.status} on page ${page} with issues API: ${errorBody}`,
          )
          return null
        }

        const issues: any[] = await response.json()
        if (!Array.isArray(issues)) {
          logger.error(`GitHub API response is not an array when fetching with issues API`)
          return null
        }

        allIssues.push(...issues)

        if (issues.length < 100) {
          fetchMore = false
        } else {
          page++
        }
      }
    }

    // Filter out issues by label after the query as the issus api is not as good at this as the search api in fetchReportsWithSearchApi
    let filteredIssues = allIssues
    if (excludeLabels && excludeLabels.length > 0) {
      filteredIssues = filteredIssues.filter(
        (issue) => !issue.labels.some((label: GitHubIssueLabel) => excludeLabels.includes(label.name)),
      )
    }
    if (excludeInvalid) {
      filteredIssues = filteredIssues.filter(
        (issue) => !issue.labels.some((label: GitHubIssueLabel) => label.name === 'invalid:template-incomplete'),
      )
    }

    const mappedIssues: GithubIssuesSearchResultItems[] = filteredIssues.map((issue: any) => ({
      ...issue,
      score: 0,
    }))

    return {
      total_count: mappedIssues.length,
      incomplete_results: false,
      items: mappedIssues,
    }
  } catch (error) {
    logger.error(`Error fetching reports with issues API: ${error}`)
    return null
  }
}

/**
 * Fetches reports from a GitHub repository using the search API.
 * Note: This method supports more complex queries and sorting, however, it will fail for searching on private users.
 */
export const fetchReportsWithSearchApi = async (
  repoName: string = 'game-reports-steamos',
  filterState: 'open' | 'closed' | null = 'open',
  filterAuthor: string | null = null,
  filterLabels: string[] | null = null,
  sort: 'reactions-+1' | 'created' | 'updated' | 'comments' = 'updated',
  direction: 'asc' | 'desc' = 'desc',
  limit: number | null = null,
  excludeInvalid: boolean = true,
  excludeLabels: string[] | null = null,
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
  if (filterLabels && filterLabels.length > 0) {
    filterLabels
      .map((label) => label.trim())
      .filter((label) => label.length > 0)
      .forEach((label) => {
        const sanitizedLabel = label.replace(/"/g, '')
        const encodedLabel = encodeURIComponent(sanitizedLabel)
        query += `+label:%22${encodedLabel}%22`
      })
  }
  if (excludeLabels && excludeLabels.length > 0) {
    excludeLabels
      .map((label) => label.trim())
      .filter((label) => label.length > 0)
      .forEach((label) => {
        const sanitizedLabel = label.replace(/"/g, '')
        const encodedLabel = encodeURIComponent(sanitizedLabel)
        query += `+-label:%22${encodedLabel}%22`
      })
  }
  if (excludeInvalid) {
    query += '+-label:invalid:template-incomplete'
  }
  let url = `https://api.github.com/search/issues?q=${query}&sort=${encodedSort}&order=${direction}`

  try {
    const headers: HeadersInit = {}
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    if (limit !== null) {
      url += `&per_page=${limit}`
      const response = await fetch(url, {
        headers,
        cache: 'no-store',
      })

      if (!response.ok) {
        const errorBody = await response.text()
        logger.error(`GitHub API request failed with status ${response.status} when fetching reports using query '${query}': ${errorBody}`)
        return null
      }
      const result: GithubIssuesSearchResult = await response.json()
      return result
    }

    // Pagination logic for when limit is null
    let allItems: GithubIssuesSearchResultItems[] = []
    let page = 1
    let fetchedAll = false
    let total_count = 0
    let incomplete_results = false

    while (!fetchedAll) {
      const pagedUrl = `${url}&per_page=100&page=${page}`
      const response = await fetch(pagedUrl, { headers, cache: 'no-store' })

      if (!response.ok) {
        const errorBody = await response.text()
        logger.error(`GitHub API request failed with status ${response.status} on page ${page} for query '${query}': ${errorBody}`)
        return null
      }

      const result: GithubIssuesSearchResult = await response.json()
      total_count = result.total_count
      incomplete_results = result.incomplete_results

      if (result.items) {
        allItems.push(...result.items)
      }

      if (!result.items || result.items.length === 0 || allItems.length >= result.total_count || allItems.length >= 1000) {
        fetchedAll = true
      } else {
        page++
      }
    }

    if (total_count > 1000) {
      logger.warn(`Search query returned ${total_count} results, but GitHub API is limited to 1000 results.`)
      incomplete_results = true
    }

    return {
      total_count: total_count,
      incomplete_results: incomplete_results,
      items: allItems,
    }
  } catch (error) {
    logger.error(`Error fetching reports: ${error}`)
    return null
  }
}

/**
 * Parses provided GitHub issues data to extract and structure relevant
 * information into the GameReport format. It also processes the issue body using a schema
 * to populate the `data` field of each GameReport.
 */
const parseGameReport = async (reports: GithubIssuesSearchResult): Promise<GameReport[]> => {
  const [schema, hardwareInfo] = await Promise.all([
    fetchReportBodySchema(null, false),
    fetchHardwareInfo(null, false),
  ])
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
        comments: report.comments || 0,
      }
    }),
  )
}

/* REDIS HELPERS */

const redisCacheRecentGameReports = async (
  data: GameReport[],
  count: number = 5,
  sort: 'updated' | 'created' = 'updated',
): Promise<void> => {
  if (!data || !Array.isArray(data)) {
    throw new Error('Data is required for caching GitHub recent game reports.')
  }
  const validatedSort = sort === 'created' ? 'created' : 'updated'
  const redisKey = `github:game_reports:recent:${count}:${validatedSort}`
  const cacheTime = config.defaultCacheTime
  try {
    await redisCacheExtData(JSON.stringify(data), redisKey, cacheTime)
    logger.info(`Cached GitHub recent game reports for ${cacheTime} seconds with key ${redisKey}`)
  } catch (error) {
    logger.error(`Redis error while caching recent game reports for key "${redisKey}":`, error)
  }
}

const redisLookupRecentGameReports = async (
  count: number = 5,
  sort: 'updated' | 'created' = 'updated',
): Promise<GameReport[] | null> => {
  const validatedSort = sort === 'created' ? 'created' : 'updated'
  const redisKey = `github:game_reports:recent:${count}:${validatedSort}`
  try {
    const cachedData = await redisLookupExtData(redisKey)
    if (cachedData) {
      logger.info('Retrieved GitHub recent game reports from Redis cache')
      return JSON.parse(cachedData) as GameReport[]
    }
  } catch (error) {
    logger.error('Redis error while fetching cached recent game reports:', error)
  }
  return null
}

const redisCachePopularGameReports = async (data: GameReport[], count: number = 5): Promise<void> => {
  if (!data || !Array.isArray(data)) {
    throw new Error('Data is required for caching GitHub popular game reports.')
  }
  const redisKey = `github:game_reports:popular:${count}`
  const cacheTime = config.defaultCacheTime
  try {
    await redisCacheExtData(JSON.stringify(data), redisKey, cacheTime)
    logger.info(`Cached GitHub popular game reports for ${cacheTime} seconds with key ${redisKey}`)
  } catch (error) {
    logger.error(`Redis error while caching popular game reports for key "${redisKey}":`, error)
  }
}

const redisLookupPopularGameReports = async (count: number = 5): Promise<GameReport[] | null> => {
  const redisKey = `github:game_reports:popular:${count}`
  try {
    const cachedData = await redisLookupExtData(redisKey)
    if (cachedData) {
      logger.info('Retrieved GitHub popular game reports from Redis cache')
      return JSON.parse(cachedData) as GameReport[]
    }
  } catch (error) {
    logger.error('Redis error while fetching cached popular game reports:', error)
  }
  return null
}

const redisCacheAuthorGameReportCount = async (count: number, author: string): Promise<void> => {
  if (!count && count !== 0) {
    throw new Error('A number is required for caching GitHub author game report count.')
  }
  if (!author) {
    throw new Error('Missing required param: author.')
  }
  const redisKey = `github:game_reports:author_count:${author}`
  const cacheTime = 60 * 60 * 4 // 4 hours
  try {
    const cacheData = Number(count).toString()
    await redisCacheExtData(cacheData, redisKey, cacheTime)
    logger.info(`Cached GitHub author game reports count for ${cacheTime} seconds with key ${redisKey}`)
  } catch (error) {
    logger.error(`Redis error while caching GitHub author game reports count for key "${redisKey}":`, error)
  }
}

const redisLookupAuthorGameReportCount = async (author: string): Promise<number | null> => {
  if (!author) {
    throw new Error('Missing required param: author.')
  }
  const redisKey = `github:game_reports:author_count:${author}`
  try {
    const cachedData = await redisLookupExtData(redisKey)
    if (cachedData) {
      logger.info('Retrieved GitHub author game reports from Redis cache')
      return Number(cachedData)
    }
  } catch (error) {
    logger.error('Redis error while fetching cached author game reports:', error)
  }
  return null
}

/* FETCH WRAPPERS */

/**
 * Retrieves the most recent game reports from Redis if available.
 */
export const fetchRecentReports = async (
  count: number = 5,
  sort: 'updated' | 'created' = 'updated',
  authToken: string | null = null,
  forceRefresh: boolean = false,
): Promise<GameReport[]> => {
  const validatedSort = sort === 'created' ? 'created' : 'updated'
  try {
    if (!forceRefresh) {
      const cachedData = await redisLookupRecentGameReports(count, validatedSort)
      if (cachedData) {
        logger.info('Serving recent reports from Redis cache')
        return cachedData
      }
    }

    const reports = await fetchReportsWithSearchApi(
      undefined,
      'open',
      null,
      null,
      validatedSort,
      'desc',
      count,
      true,
      ['community:duplicate-report'],
      authToken,
    )
    if (reports && reports?.items?.length > 0) {
      const returnData = await parseGameReport(reports)
      await redisCacheRecentGameReports(returnData, count, validatedSort)
      // Refresh the first 5 games in the background
      returnData.slice(0, 5).forEach((report) => {
        if (report.data.app_id || report.data.game_name) {
          // Fire-and-forget background fetch. Avoid unhandled rejection noise.
          ;(async () => {
            try {
              logger.info(
                `(BG TASK) Refreshing game data in background for app_id: ${report.data.app_id}, game_name: ${report.data.game_name}`,
              )
              await fetchProjectsByAppIdOrGameName(
                report.data.app_id ? String(report.data.app_id) : null,
                report.data.game_name,
                authToken,
                true,
              )
              logger.info(
                `(BG TASK) Refreshed game data in background for app_id: ${report.data.app_id}, game_name: ${report.data.game_name}`,
              )
            } catch (err) {
              logger.error(
                `(BG TASK) Background refresh failed for game with app_id ${report.data.app_id} or game_name ${report.data.game_name}: ${err}`,
              )
            }
          })().catch((err) => {
            logger.error(
              `(BG TASK) Background refresh task rejected for game with app_id ${report.data.app_id} or game_name ${report.data.game_name}: ${err}`,
            )
          })
        }
      })
      return returnData
    }

    logger.info('No reports found.')
    return []
  } catch (error) {
    logger.error('Error fetching recent reports:', error)
    await redisCacheRecentGameReports([], count, validatedSort)
    return []
  }
}

/**
 * Retrieves the most popular game reports (sorted by the highest number of
 * thumbs-up reactions) from Redis if available.
 */
export const fetchPopularReports = async (
  count: number = 5,
  authToken: string | null = null,
  forceRefresh: boolean = false,
): Promise<GameReport[]> => {
  try {
    if (!forceRefresh) {
      const cachedData = await redisLookupPopularGameReports(count)
      if (cachedData) {
        logger.info('Serving popular reports from Redis cache')
        return cachedData
      }
    }

    const reports = await fetchReportsWithSearchApi(
      undefined,
      'open',
      null,
      null,
      'reactions-+1',
      'desc',
      count,
      true,
      null,
      authToken,
    )
    if (reports && reports?.items?.length > 0) {
      const returnData = await parseGameReport(reports)
      await redisCachePopularGameReports(returnData, count)
      return returnData
    }

    logger.info('No reports found.')
    return []
  } catch (error) {
    logger.error('Error fetching popular reports:', error)
    await redisCachePopularGameReports([], count)
    return []
  }
}

/**
 * Retrieves a count of game reports for a given author.
 */
export const fetchAuthorReportCount = async (
  author: string,
  authToken: string | null = null,
): Promise<number> => {
  try {
    const cachedData = await redisLookupAuthorGameReportCount(author)
    if (cachedData) {
      logger.info('Serving count of author reports from Redis cache')
      return cachedData
    }

    const reports = await fetchReportsWithIssuesApi(
      undefined,
      'open',
      author,
      null,
      'updated',
      'desc',
      null,
      true,
      null,
      authToken,
    )
    if (reports && reports?.items?.length > 0) {
      await redisCacheAuthorGameReportCount(reports.items.length, author)
      return reports.items.length
    }

    logger.info('No reports found.')
    return 0
  } catch (error) {
    logger.error('Error fetching count of author reports:', error)
    await redisCacheAuthorGameReportCount(0, author)
    return 0
  }
}
