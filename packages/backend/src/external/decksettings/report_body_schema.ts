import config from '../../config'
import logger from '../../logger'
import { redisCacheExtData, redisLookupExtData } from '../../redis'
import type { GitHubReportIssueBodySchema } from '../../../../shared/src/game'

const redisCacheReportBodySchema = async (data: GitHubReportIssueBodySchema): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching GitHub report body schema.')
  }
  const redisKey = 'github:game_reports_body_schema'
  const cacheTime = config.defaultCacheTime
  try {
    await redisCacheExtData(JSON.stringify(data), redisKey, cacheTime)
    logger.info(`Cached GitHub report body schema for ${cacheTime} seconds with key ${redisKey}`)
  } catch (error) {
    logger.error(`Redis error while caching GitHub report body schema for key "${redisKey}":`, error)
  }
}

const redisLookupReportBodySchema = async (): Promise<GitHubReportIssueBodySchema | null> => {
  const redisKey = 'github:game_reports_body_schema'
  try {
    const cachedData = await redisLookupExtData(redisKey)
    if (cachedData) {
      logger.info('Retrieved GitHub report body schema from Redis cache')
      return JSON.parse(cachedData) as GitHubReportIssueBodySchema
    }
  } catch (error) {
    logger.error('Redis error while fetching cached GitHub report body schema:', error)
  }
  return null
}

export const fetchReportBodySchema = async (forceRefresh: boolean = false): Promise<GitHubReportIssueBodySchema> => {
  if (!forceRefresh) {
    const cachedData = await redisLookupReportBodySchema()
    if (cachedData) {
      return cachedData
    }
  }
  const schemaUrl = 'https://raw.githubusercontent.com/DeckSettings/game-reports-steamos/refs/heads/master/.github/scripts/config/game-report-validation.json'
  try {
    logger.info('Fetching GitHub report body schema from URL')
    const response = await fetch(schemaUrl)
    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`GitHub raw request failed when fetching report body schema with status ${response.status}: ${errorBody}`)
      throw new Error('Failed to fetch report body schema from GitHub repository. Non-success response received from GitHub')
    }

    const schema = await response.json()
    if (schema) {
      await redisCacheReportBodySchema(schema)
    }
    return schema as GitHubReportIssueBodySchema
  } catch (error) {
    logger.error('Error fetching or parsing schema:', error)
    throw error
  }
}
