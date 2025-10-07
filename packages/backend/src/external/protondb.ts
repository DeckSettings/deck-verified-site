import { ProtonDBSummary } from '../../../shared/src/game'
import logger from '../logger'
import { redisCacheProtonDbSummary, redisLookupProtonDbSummary } from '../redis'

interface ProtonDbApiSummary {
  tier?: string;
  score?: number;
  confidence?: string;
  total?: number;
  trendingTier?: string;
  trend?: string;
  bestReportedTier?: string;
}

/**
 * Retrieves ProtonDB summary data for a Steam app ID, leveraging Redis caching and gracefully handling 404s.
 */
export const fetchProtonDbSummary = async (appId: string): Promise<ProtonDbApiSummary | null> => {
  const cachedData = await redisLookupProtonDbSummary(appId)
  if (cachedData !== null) {
    return cachedData as ProtonDbApiSummary | null
  }

  const url = `https://www.protondb.com/api/v1/reports/summaries/${appId}.json`
  try {
    logger.info(`Fetching ProtonDB summary for appId ${appId}...`)
    const response = await fetch(url)
    if (!response.ok) {
      if (response.status === 404) {
        logger.info(`ProtonDB summary not found for appId ${appId}.`)
        await redisCacheProtonDbSummary(null, appId, 3600)
        return null
      }
      const errorBody = await response.text()
      logger.error(`ProtonDB summary request failed with status ${response.status}: ${errorBody}`)
      await redisCacheProtonDbSummary(null, appId, 3600)
      return null
    }

    const data = await response.json() as ProtonDbApiSummary
    await redisCacheProtonDbSummary(data, appId)
    return data
  } catch (error) {
    logger.error(`Failed to fetch ProtonDB summary for appId ${appId}:`, error)
  }

  await redisCacheProtonDbSummary(null, appId, 3600)
  return null
}

/**
 * Maps the ProtonDB API summary into the shared ProtonDBSummary contract, normalising optional fields to null.
 */
export const mapProtonDbSummary = (summary: ProtonDbApiSummary | null): ProtonDBSummary | null => {
  if (!summary) {
    return null
  }

  return {
    tier: summary.tier ?? null,
    score: typeof summary.score === 'number' ? summary.score : null,
    confidence: summary.confidence ?? null,
    totalReports: typeof summary.total === 'number' ? summary.total : null,
    trendingTier: summary.trendingTier || summary.bestReportedTier || null,
  }
}
