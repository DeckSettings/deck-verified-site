import config from '../../config'
import logger from '../../logger'
import { redisCacheExtData, redisLookupExtData } from '../../redis'
import type { HardwareInfo } from '../../../../shared/src/game'

export const redisCacheHardwareInfo = async (data: HardwareInfo[]): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching GitHub hardware info.')
  }
  const redisKey = `github:hardware_info`
  const cacheTime = config.defaultCacheTime
  try {
    await redisCacheExtData(JSON.stringify(data), redisKey, cacheTime)
    logger.info(`Cached GitHub hardware info for ${cacheTime} seconds with key ${redisKey}`)
  } catch (error) {
    logger.error(`Redis error while caching GitHub hardware info for key "${redisKey}":`, error)
  }
}

export const redisLookupHardwareInfo = async (): Promise<HardwareInfo[] | null> => {
  const redisKey = `github:hardware_info`
  try {
    const cachedData = await redisLookupExtData(redisKey)
    if (cachedData) {
      logger.info('Retrieved GitHub hardware info from Redis cache')
      return JSON.parse(cachedData) as HardwareInfo[]
    }
  } catch (error) {
    logger.error('Redis error while fetching cached GitHub hardware info:', error)
  }
  return null
}

export const fetchHardwareInfo = async (forceRefresh: boolean = false): Promise<HardwareInfo[]> => {
  if (!forceRefresh) {
    const cachedData = await redisLookupHardwareInfo()
    if (cachedData) {
      return cachedData
    }
  }
  const url = 'https://raw.githubusercontent.com/DeckSettings/game-reports-steamos/refs/heads/master/.github/scripts/config/hardware.json'
  try {
    logger.info('Fetching GitHub hardware info from URL')
    const response = await fetch(url)
    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`GitHub raw request failed when fetching hardware info with status ${response.status}: ${errorBody}`)
      throw new Error('Failed to fetch hardware info from GitHub repository. Non-success response received from GitHub')
    }

    const info = await response.json()
    if (info.devices) {
      await redisCacheHardwareInfo(info.devices)
    }
    return info.devices
  } catch (error) {
    logger.error('Error fetching or parsing hardware info:', error)
    throw error
  }
}
