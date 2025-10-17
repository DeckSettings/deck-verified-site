import { ExternalGameReview, ExternalGameReviewReportData, SDHQReview } from '../../../shared/src/game'
import {
  acquireRedisLock,
  redisCacheExtData,
  redisLookupExtData,
} from '../redis'
import logger from '../logger'
import {
  calculatedBatteryLife, convertRatingToStars,
  convertWattageToNumber,
  extractNumbersFromString,
  extractYouTubeVideoIds,
  limitStringTo100Characters, numberValueFromString, parseGameSettingsToMarkdown,
} from '../helpers'
import { fetchHardwareInfo } from './decksettings/hw_info'

const SDHQ_REDIS_PREFIX = 'sdhq_review'

/**
 * Caches an object of SDHQ Game Review in Redis.
 * The cached data is stored for 2 days to improve search performance and reduce API calls.
 */
const redisCacheSDHQReview = async (
  data: SDHQReview[],
  appId: string,
  cacheTime: number = 60 * 60 * 24 * 2, // Default to 2 days
): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching SDHQ review.')
  }
  if (!appId) {
    throw new Error('An AppID is required to cache SDHQ review.')
  }
  const redisKey = `${SDHQ_REDIS_PREFIX}:${appId}`
  try {
    const cacheData = JSON.stringify(data)
    await redisCacheExtData(cacheData, redisKey, cacheTime)
    logger.info(`Cached SDHQ review for ${cacheTime} seconds with key ${redisKey}`)
  } catch (error) {
    logger.error(`Redis error while caching SDHQ review for key "${redisKey}":`, error)
  }
}

/**
 * Retrieves a cached object of SDHQ Game Review for a given App ID.
 */
const redisLookupSDHQReview = async (appId: string): Promise<SDHQReview[] | null> => {
  if (!appId) {
    throw new Error('An AppID is required to lookup SDHQ review.')
  }
  const redisKey = `${SDHQ_REDIS_PREFIX}:${appId}`
  try {
    const cachedData = await redisLookupExtData(redisKey)
    if (cachedData) {
      logger.info(`Retrieved SDHQ review for "${appId}" from Redis cache`)
      return JSON.parse(cachedData) as SDHQReview[]
    }
  } catch (error) {
    logger.error('Redis error while fetching cached SDHQ review:', error)
  }
  return null
}

/**
 * Fetches SDHQ review data for the given App ID.
 */
export const fetchSDHQReview = async (appId: string): Promise<SDHQReview[]> => {
  const cachedData = await redisLookupSDHQReview(appId)
  if (cachedData) {
    return cachedData
  }

  // Acquire short lock to dedupe background work
  const gotLock = await acquireRedisLock(`${SDHQ_REDIS_PREFIX}:${appId}`, 120)
  if (gotLock) {
    // Fire-and-forget background fetch. Avoid unhandled rejection noise.
    ;(async () => {
      try {
        const url = `https://steamdeckhq.com/wp-json/wp/v2/game-reviews/?meta_key=steam_app_id&meta_value=${appId}`
        logger.info(`(BG TASK) Fetching SDHQ review data for appId ${appId} from SDHQ API...`)
        const response = await fetch(url)

        // Check if response is ok (status 200)
        if (!response.ok) {
          const errorBody = await response.text()
          logger.error(`(BG TASK) SDHQ game review API request failed with status ${response.status}: ${errorBody}`)
          await redisCacheSDHQReview([], appId, 3600) // Cache error/negative response for 1 hour
          return
        }

        const data: SDHQReview[] = await response.json()

        if (Array.isArray(data) && data.length > 0) {
          // Cache results for normal TTL
          await redisCacheSDHQReview(data, appId)
          logger.info(`(BG TASK) Cached SDHQ review data for appId ${appId}.`)
        } else {
          logger.warn(`(BG TASK) No SDHQ game data found for appId ${appId}`)
          await redisCacheSDHQReview([], appId, 3600) // Cache negative result for 1 hour
        }
      } catch (error) {
        logger.error(`(BG TASK) Failed to fetch SDHQ game data for appId ${appId}:`, error)
        await redisCacheSDHQReview([], appId, 3600) // Cache negative result for 1 hour
      }
    })().catch(async (err) => {
      logger.error(`(BG TASK) SDHQ background task rejected for appId ${appId}:`, err)
      await redisCacheSDHQReview([], appId, 3600)
    })
  }

  // Return immediately on miss. The next request will likely hit the cache.
  return []
}

/**
 * Generates ExternalGameReview data based on SDHQ review data.
 *
 * It processes each review to generate a standardized ExternalGameReview object,
 * enriching the data with additional computed values and formatting, such as summary,
 * device assumptions, and additional notes. The goal here is to fill in the gaps.
 */
export const generateSDHQReviewData = async (appId: string): Promise<ExternalGameReview[]> => {
  const rawReviews: SDHQReview[] = await fetchSDHQReview(appId)
  return await Promise.all(
    rawReviews.map(async review => {
      // Use optional chaining and fallback to null if sections are missing.
      const optimizedSettings = review.acf?.optimized_and_recommended_settings || null
      const steamos = optimizedSettings?.steamos_settings || null
      const ratingCategories = review.acf?.sdhq_rating_categories || null

      // Build additional notes line by line.
      let additionalNotes: string = ''
      let performanceRating = 'Unrated'
      if (ratingCategories) {
        const notes: string[] = []
        if (ratingCategories.performance !== undefined) {
          performanceRating = `${convertRatingToStars(ratingCategories.performance)} (${ratingCategories.performance}/5)`
          notes.push(`- **Performance:** ${performanceRating})`)
        }
        if (ratingCategories.visuals !== undefined) {
          notes.push(`- **Visuals:** ${convertRatingToStars(ratingCategories.visuals)} (${ratingCategories.visuals}/5)`)
        }
        if (ratingCategories.stability !== undefined) {
          notes.push(`- **Stability:** ${convertRatingToStars(ratingCategories.stability)} (${ratingCategories.stability}/5)`)
        }
        if (ratingCategories.controls !== undefined) {
          notes.push(`- **Controls:** ${convertRatingToStars(ratingCategories.controls)} (${ratingCategories.controls}/5)`)
        }
        if (ratingCategories.battery !== undefined) {
          notes.push(`- **Battery:** ${convertRatingToStars(ratingCategories.battery)} (${ratingCategories.battery}/5)`)
        }

        additionalNotes = '#### SDHQ\'s Build Score Breakdown\n'
        if (ratingCategories.score_breakdown) {
          additionalNotes += `\n\n${ratingCategories.score_breakdown}\n`
        }
        if (notes.length > 0) {
          additionalNotes += notes.join('\n')
        }
      }

      const youtubeVideoIds = extractYouTubeVideoIds(review.content?.rendered)
      if (youtubeVideoIds.length > 0) {
        const youtubeSection = `\n${youtubeVideoIds
          .map(id => `https://youtu.be/${id}`)
          .join('\n')}`
        additionalNotes = additionalNotes
          ? `${additionalNotes}\n\n${youtubeSection}`
          : youtubeSection
      }

      const summary = limitStringTo100Characters(
        review.excerpt.rendered
          ? review.excerpt.rendered.replace(/<[^>]+>/g, '')
          : review.title.rendered,
      )
      const assumedDevice = 'Valve Steam Deck LCD (256GB/512GB)'
      const averagePowerDraw = convertWattageToNumber(optimizedSettings?.projected_battery_usage_and_temperature?.wattage)
      const hardwareInfo = await fetchHardwareInfo()
      const matchedDevice = hardwareInfo.find(
        (device) => device.name === assumedDevice,
      )
      const calcBatteryLifeMinutes = matchedDevice ? await calculatedBatteryLife(matchedDevice, Number(averagePowerDraw)) : null
      const gameDisplaySettings = optimizedSettings?.game_settings ? parseGameSettingsToMarkdown(optimizedSettings.game_settings) : ''

      // Build the report data. If any field is missing, assign null.
      const reportData: ExternalGameReviewReportData = {
        summary: summary,
        game_name: review.title.rendered,
        app_id: Number(appId),
        average_battery_power_draw: averagePowerDraw,
        calculated_battery_life_minutes: calcBatteryLifeMinutes,
        device: assumedDevice,
        steam_play_compatibility_tool_used: 'Glorious Eggroll Proton (GE)',
        compatibility_tool_version: optimizedSettings?.proton_version || 'default',
        game_resolution: 'Default',
        custom_launch_options: null,
        frame_limit: extractNumbersFromString(steamos?.fps_cap),
        disable_frame_limit: 'Off',
        enable_vrr: 'Off',
        allow_tearing: 'Off',
        half_rate_shading: steamos?.half_rate_shading ? 'On' : 'Off',
        tdp_limit: extractNumbersFromString(steamos?.tdp_limit),
        manual_gpu_clock: extractNumbersFromString(steamos?.gpu_clock_frequency),
        scaling_mode: 'Auto',
        scaling_filter: steamos?.scaling_filter || 'Linear',
        game_display_settings: gameDisplaySettings,
        game_graphics_settings: '',
        additional_notes: additionalNotes,
        performance_rating: performanceRating,
      }

      return {
        id: numberValueFromString('SDHQ') + Number(review.id),
        title: review.title.rendered || '',
        html_url: review.link,
        data: reportData,
        source: {
          name: 'SDHQ',
          avatar_url: 'https://steamdeckhq.com/wp-content/uploads/2022/06/sdhq-holographic-logo.svg',
          report_count: rawReviews.length,
        },
        created_at: review.date || '',
        updated_at: review.modified || '',
      }
    }),
  )
}
