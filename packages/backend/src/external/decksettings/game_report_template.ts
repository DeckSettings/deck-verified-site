import YAML from 'yaml'
import config from '../../config'
import logger from '../../logger'
import { redisCacheExtData, redisLookupExtData } from '../../redis'
import type { GitHubIssueTemplate } from '../../../../shared/src/game'

const redisCacheGameReportTemplate = async (data: GitHubIssueTemplate): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching GitHub game report template.')
  }
  const redisKey = `github:game_report_template`
  const cacheTime = config.defaultCacheTime
  try {
    await redisCacheExtData(JSON.stringify(data), redisKey, cacheTime)
    logger.info(`Cached GitHub game report template for ${cacheTime} seconds with key ${redisKey}`)
  } catch (error) {
    logger.error(`Redis error while caching GitHub game report template for key "${redisKey}":`, error)
  }
}

const redisLookupGameReportTemplate = async (): Promise<GitHubIssueTemplate | null> => {
  const redisKey = `github:game_report_template`
  try {
    const cachedData = await redisLookupExtData(redisKey)
    if (cachedData) {
      logger.info('Retrieved GitHub game report template from Redis cache')
      return JSON.parse(cachedData) as GitHubIssueTemplate
    }
  } catch (error) {
    logger.error('Redis error while fetching cached GitHub game report template:', error)
  }
  return null
}

export const fetchGameReportTemplate = async (forceRefresh: boolean = false): Promise<GitHubIssueTemplate> => {
  if (!forceRefresh) {
    const cachedData = await redisLookupGameReportTemplate()
    if (cachedData) {
      return cachedData
    }
  }
  const url = 'https://raw.githubusercontent.com/DeckSettings/game-reports-steamos/refs/heads/master/.github/ISSUE_TEMPLATE/GAME-REPORT.yml'
  try {
    logger.info('Fetching GitHub game report template from URL')
    const response = await fetch(url)
    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`GitHub raw request failed when fetching game report template with status ${response.status}: ${errorBody}`)
      throw new Error('Failed to fetch game report template from GitHub repository. Non-success response received from GitHub')
    }
    const responseText = await response.text()
    const info = YAML.parse(responseText) as GitHubIssueTemplate
    if (info) {
      await redisCacheGameReportTemplate(info)
    }
    return info
  } catch (error) {
    logger.error('Error fetching or parsing game report template:', error)
    throw error
  }
}
