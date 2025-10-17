import config from '../../config'
import logger from '../../logger'
import { redisCacheExtData, redisLookupExtData } from '../../redis'
import type { GitHubIssueLabel } from '../../../../shared/src/game'

const redisCacheGitHubIssueLabels = async (data: GitHubIssueLabel[]): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching GitHub issue labels.')
  }
  const redisKey = 'github:issue_labels'
  const cacheTime = config.defaultCacheTime
  try {
    await redisCacheExtData(JSON.stringify(data), redisKey, cacheTime)
    logger.info(`Cached GitHub issue labels for ${cacheTime} seconds with key ${redisKey}`)
  } catch (error) {
    logger.error(`Redis error while caching GitHub issue labels for key "${redisKey}":`, error)
  }
}

const redisLookupGitHubIssueLabels = async (): Promise<GitHubIssueLabel[] | null> => {
  try {
    const redisKey = 'github:issue_labels'
    const cachedData = await redisLookupExtData(redisKey)
    if (cachedData) {
      logger.info('Retrieved GitHub issue labels from Redis cache')
      return JSON.parse(cachedData) as GitHubIssueLabel[]
    }
  } catch (error) {
    logger.error('Redis error while fetching cached GitHub issue labels:', error)
  }
  return null
}

export const fetchRepoIssueLabels = async (authToken: string | null = null, forceRefresh: boolean = false): Promise<GitHubIssueLabel[]> => {
  if (!forceRefresh) {
    const cachedData = await redisLookupGitHubIssueLabels()
    if (cachedData) {
      return cachedData as GitHubIssueLabel[]
    }
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
    logger.error(`GitHub API request failed when fetching repo issue labels with status ${response.status}: ${errorBody}`)
    throw new Error('Failed to fetch labels from GitHub API. Non-success response received from GitHub')
  }
  const data: GitHubIssueLabel[] = await response.json()
  if (data) {
    await redisCacheGitHubIssueLabels(data)
  }
  return data
}
