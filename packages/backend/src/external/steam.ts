import {
  SteamDeckCompatibilitySummary,
  SteamDeckCompatibilitySummaryDetail,
  SteamGame,
  SteamStoreAppDetails,
  SteamSuggestApp,
} from '../../../shared/src/game'
import { storeGameInRedis, redisCacheExtData, redisLookupExtData } from '../redis'
import logger from '../logger'
import { generateImageLinksFromAppId, parseAppIdNumber, toIsoDateString } from '../helpers'

interface AjaxCompatResponse {
  success: number;
  results?: {
    appid: number;
    resolved_category?: number;
    resolved_items?: { display_type?: number; loc_token?: string }[];
    steamos_resolved_category?: number;
    steamos_resolved_items?: { display_type?: number; loc_token?: string }[];
    steam_deck_blog_url?: string;
    search_id?: string | null;
  };
}

export interface MaxSteamAppIdCache {
  maxAppId: number
  name: string
  totalApps: number
  fetchedAt: string
}

export const IGNORE_GAME_NAME_REGEX: RegExp[] = [
  /^Proton\s\d+\.\d+\s*(\(\w+\))?$/,
  /^Steam Linux Runtime \d+\.\d+\s\(.*\)$/,
]
export const IGNORE_APP_IDS = [
  2180100, // Proton Hotfix
  1493710, // Proton Experimental
  1070560, // Steam Linux Runtime
  1070560, // "Steam Linux Runtime 1.0 (scout)"
  1391110, // "Steam Linux Runtime 2.0 (soldier)"
  1628350, // "Steam Linux Runtime 3.0 (sniper)"
  228980, // "Steamworks Common Redistributables"
]

const STEAM_STRINGS_MAP: Record<string, string> = {
  'SteamDeckVerified_TestResult_DefaultControllerConfigFullyFunctional': 'All functionality is accessible when using the default controller configuration',
  'SteamDeckVerified_TestResult_ControllerGlyphsMatchDeckDevice': 'This game shows Steam Deck controller icons',
  'SteamDeckVerified_TestResult_DefaultConfigurationIsPerformant': 'This game\'s default graphics configuration performs well on Steam Deck',
  'SteamDeckVerified_TestResult_InterfaceTextIsLegible': 'In-game interface text is legible on Steam Deck',
  'SteamDeckVerified_TestResult_DefaultControllerConfigNotFullyFunctional': 'Some functionality is not accessible when using the default controller configuration, requiring use of the touchscreen or virtual keyboard, or a community configuration',
  'SteamDeckVerified_TestResult_ControllerGlyphsDoNotMatchDeckDevice': 'This game sometimes shows mouse, keyboard, or non-Steam-Deck controller icons',
  'SteamDeckVerified_TestResult_DefaultConfigurationIsNotPerformant': 'This game requires manual configuration of graphics settings to perform well on Steam Deck',
  'SteamDeckVerified_TestResult_TextInputDoesNotAutomaticallyInvokesKeyboard': 'Entering some text requires manually invoking the on-screen keyboard',
  'SteamDeckVerified_TestResult_InterfaceTextIsNotLegible': 'Some in-game text is small and may be difficult to read',
  'SteamDeckVerified_TestResult_NativeResolutionNotSupported': 'This game doesn\'t support Steam Deck\'s native display resolution and may experience degraded performance',
  'SteamDeckVerified_TestResult_NativeResolutionNotDefault': 'This game supports Steam Deck\'s native display resolution but does not set it by default and may require you to configure the display resolution manually',
  'SteamDeckVerified_TestResult_DisplayOutputHasNonblockingIssues': 'This game has minor graphics/display issues on Steam Deck',
  'SteamDeckVerified_TestResult_AudioOutputHasNonblockingIssues': 'This game has minor audio issues on Steam Deck',
  'SteamDeckVerified_TestResult_DeviceCompatibilityWarningsShown': 'This game displays compatibility warnings when running on Steam Deck, but runs fine',
  'SteamDeckVerified_TestResult_LauncherInteractionIssues': 'This game\'s launcher/setup tool may require the touchscreen or virtual keyboard, or have difficult to read text',
  'SteamDeckVerified_TestResult_VideoPlaybackHasNonblockingIssues': 'Some in-game movie content may be missing or have playback issues',
  'SteamDeckVerified_TestResult_GameOrLauncherDoesntExitCleanly': 'This game does not exit cleanly and may require you to manually quit via the Steam overlay',
  'SteamDeckVerified_TestResult_AuxFunctionalityNotAccessible_MapEditor': 'Some auxiliary functionality is not accessible on Steam Deck: map editor',
  'SteamDeckVerified_TestResult_MultiWindowAppAutomaticallySetsFocus': 'This game uses multiple windows and may require you to focus the appropriate windows manually via the Steam overlay',
  'SteamDeckVerified_TestResult_DisplayOutputNotCorrectlyScaled': 'This game is incorrectly scaled on Steam Deck and may require you to configure the display resolution manually',
  'SteamDeckVerified_TestResult_ResumeFromSleepNotFunctional': 'This game may experience temporary issues after sleeping on Steam Deck',
  'SteamDeckVerified_TestResult_GamepadNotEnabledByDefault': 'This game requires manually enabling controller support using in-game settings',
  'SteamDeckVerified_TestResult_CloudSavesNotEnabledByDefault': 'This game requires manually enabling Steam Cloud support for saved games using in-game settings',
  'SteamDeckVerified_TestResult_NotFullyFunctionalWithoutExternalKeyboard': 'Parts of this game would benefit from using an external keyboard',
  'SteamDeckVerified_TestResult_NotFullyFunctionalWithoutExternalWebcam': 'This game requires certain external devices: Webcam',
  'SteamDeckVerified_TestResult_NotFullyFunctionalWithoutExternalUSBGuitar': 'This game requires certain external devices: USB Guitar',
  'SteamDeckVerified_TestResult_SteamOSDoesNotSupport': 'Valve is still working on adding support for this game on Steam Deck',
  'SteamDeckVerified_TestResult_SteamOSDoesNotSupport_VR': 'Steam Deck does not support VR games',
  'SteamDeckVerified_TestResult_SteamOSDoesNotSupport_Software': 'This is a Software title and is not supported on Steam Deck',
  'SteamDeckVerified_TestResult_SteamOSDoesNotSupport_Retired': 'This game has been retired or is no longer in a playable state and is not supported on Steam Deck',
  'SteamDeckVerified_TestResult_UnsupportedAntiCheat_Other': 'This game is unsupported on Steam Deck due to use of an unsupported anti-cheat or multiplayer service',
  'SteamDeckVerified_TestResult_UnsupportedAntiCheatConfiguration': 'This game\'s anti-cheat is not configured to support Steam Deck',
  'SteamDeckVerified_TestResult_UnsupportedGraphicsPerformance': 'This game\'s graphics settings cannot be configured to run well on Steam Deck',
  'SteamDeckVerified_TestResult_SteamOSDoesNotSupport_OperatingSystem': 'This game requires an operating system that is not currently supported on Steam Deck',
  'SteamDeckVerified_TestResult_FirstTimeSetupRequiresActiveInternetConnection': 'This game\'s first-time setup requires an active Internet connection',
  'SteamDeckVerified_TestResult_SingleplayerGameplayRequiresActiveInternetConnection': 'Singleplayer gameplay requires an active Internet connection',
  'SteamDeckVerified_TestResult_CrossPlatformCloudSavesNotSupported': 'This game does not support cross-platform saved games',
  'SteamDeckVerified_TestResult_ExternalControllersNotSupportedPrimaryPlayer': 'This game does not default to external Bluetooth/USB controllers on Deck, and may require manually switching the active controller via the Quick Access Menu',
  'SteamDeckVerified_TestResult_ExternalControllersNotSupportedLocalMultiplayer': 'This game does not support external Bluetooth/USB controllers on Deck for local multiplayer',
  'SteamDeckVerified_TestResult_SimultaneousInputGyroTrackpadFriendly': 'This game supports using the gyro/trackpad in mouse mode for camera controls with gamepad controls for movement',
  'SteamDeckVerified_TestResult_HDRMustBeManuallyEnabled': 'This game supports HDR but it must be manually enabled using in-game settings',
  'SteamOS_TestResult_GameStartupFunctional': 'This game runs successfully on SteamOS',
  'SteamOS_TestResult_SteamOSDoesNotSupport': 'Valve is still working on adding support for this game on SteamOS',
  'SteamOS_TestResult_UnsupportedAntiCheatConfiguration': 'This game\'s anti-cheat is not configured to support SteamOS',
  'SteamOS_TestResult_UnsupportedAntiCheat_Other': 'This game is unsupported on SteamOS due to use of an unsupported anti-cheat or multiplayer service',
  'SteamOS_TestResult_SteamOSDoesNotSupport_Software': 'This is a Software title and is not supported on SteamOS',
  'SteamOS_TestResult_SteamOSDoesNotSupport_Retired': 'This game has been retired or is no longer in a playable state and is not supported on SteamOS',
  'SteamOS_TestResult_SteamOSDoesNotSupport_OperatingSystem': 'This game requires an operating system that is not currently supported on SteamOS',
  'SteamOS_TestResult_LauncherInteractionIssues': 'This game\'s launcher/setup tool may require a touchscreen or virtual keyboard, or have difficult to read text',
  'SteamOS_TestResult_TextInputDoesNotAutomaticallyInvokesKeyboard': 'Entering some text requires manually invoking the on-screen keyboard',
  'SteamOS_TestResult_DefaultControllerConfigNotFullyFunctional': 'Some functionality is not accessible when using the default controller configuration, requiring use of the touchscreen or virtual keyboard, or a community configuration',
  'SteamOS_TestResult_GameOrLauncherDoesntExitCleanly': 'This game does not exit cleanly and may require you to manually quit via the Steam overlay',
  'SteamOS_TestResult_VideoPlaybackHasNonblockingIssues': 'Some in-game movie content may be missing or have playback issues',
  'SteamOS_TestResult_DisplayOutputHasNonblockingIssues': 'This game has minor graphics/display issues on SteamOS',
  'SteamOS_TestResult_AudioOutputHasNonblockingIssues': 'This game has minor audio issues on SteamOS',
  'SteamOS_TestResult_AuxFunctionalityNotAccessible_MapEditor': 'Some auxilliary functionality is not accessible on SteamOS: map editor',
  'SteamOS_TestResult_MultiWindowAppAutomaticallySetsFocus': 'This game uses multiple windows and may require you to focus the appropriate windows manually via the Steam overlay',
  'SteamOS_TestResult_DisplayOutputNotCorrectlyScaled': 'This game is incorrectly scaled on SteamOS and may require you to configure the display resolution manually',
  'SteamOS_TestResult_ResumeFromSleepNotFunctional': 'This game may experience temporary issues after sleeping on SteamOS',
  'SteamOS_TestResult_GamepadNotEnabledByDefault': 'This game requires manually enabling controller support using in-game settings',
  'SteamOS_TestResult_CloudSavesNotEnabledByDefault': 'This game requires manually enabling Steam Cloud support for saved games using in-game settings',
  'SteamOS_TestResult_NotFullyFunctionalWithoutExternalKeyboard': 'Parts of this game would benefit from using an external keyboard',
  'SteamOS_TestResult_NotFullyFunctionalWithoutExternalWebcam': 'This game requires certain external devices: Webcam',
  'SteamOS_TestResult_NotFullyFunctionalWithoutExternalUSBGuitar': 'This game requires certain external devices: USB Guitar',
  'SteamOS_TestResult_FirstTimeSetupRequiresActiveInternetConnection': 'This game\'s first-time setup requires an active Internet connection',
  'SteamOS_TestResult_SingleplayerGameplayRequiresActiveInternetConnection': 'Singleplayer gameplay requires an active Internet connection',
  'SteamOS_TestResult_CrossPlatformCloudSavesNotSupported': 'This game does not support cross-platform saved games',
  'SteamOS_TestResult_ExternalControllersNotSupportedPrimaryPlayer': 'This game does not default to external Bluetooth/USB controllers on SteamOS, and may require manually switching the active controller via the Quick Access Menu',
  'SteamOS_TestResult_ExternalControllersNotSupportedLocalMultiplayer': 'This game does not support external Bluetooth/USB controllers on SteamOS for local multiplayer',
  'SteamOS_TestResult_SimultaneousInputGyroTrackpadFriendly': 'This game supports using the gyro/trackpad in mouse mode for camera controls with gamepad controls for movement',
  'SteamOS_TestResult_HDRMustBeManuallyEnabled': 'This game supports HDR but it must be manually enabled using in-game settings',
  'SteamDeckVerified_DescriptionHeader': 'Valve’s testing indicates this title is %1$s on Steam Deck. %2$s',
  'SteamDeckVerified_DescriptionHeader_WithAppName': 'Valve’s testing indicates that %1$s is %2$s on Steam Deck. %3$s',
  'SteamDeckVerified_DescriptionHeader_Verified': 'This game is fully functional on Steam Deck, and works great with the built-in controls and display.',
  'SteamDeckVerified_DescriptionHeader_Playable': 'This game is functional on Steam Deck, but might require extra effort to interact with or configure.',
  'SteamDeckVerified_DescriptionHeader_Unsupported': 'Some or all of this game currently doesn\'t function on Steam Deck.',
  'SteamDeckVerified_DescriptionHeader_Unknown': 'Valve is still learning about this title. We do not currently have further information regarding Steam Deck compatibility.',
  'SteamDeckVerified_DescriptionHeader_Unknown_WithAppName': 'Valve is still learning about %1$s. We do not currently have further information regarding Steam Deck compatibility.',
  'SteamDeckVerified_DescriptionHeader_DeveloperBlog': 'The developer has provided additional information regarding Steam Deck support for this game. Learn more on their Community Page by pressing',
  'SteamDeckVerified_DescriptionHeader_DeveloperBlog_Desktop': 'The developer has provided additional information regarding Steam Deck support for this game. Learn more on their Community Page.',
  'SteamDeckVerified_ViewDeveloperPost': 'View Developer Post',
  'SteamDeckVerified_Category_Verified': 'Verified',
  'SteamDeckVerified_Category_Playable': 'Playable',
  'SteamDeckVerified_Category_Unsupported': 'Unsupported',
  'SteamDeckVerified_Category_Unknown': 'Unknown',
  'SteamOSCompatibility_DescriptionHeader': 'Based on Steam Deck verification results, our testing indicates this title is %1$s on SteamOS. %2$s',
  'SteamOSCompatibility_DescriptionHeader_WithAppName': 'Based on Steam Deck verification results, our testing indicates that %1$s is %2$s with devices running SteamOS. %3$s',
  'SteamOSCompatibility_DescriptionHeader_Unknown': 'Valve is still learning about this title. We do not currently have further information regarding SteamOS compatibility.',
  'SteamOSCompatibility_DescriptionHeader_Unknown_WithAppName': 'Valve is still learning about %1$s. We do not currently have further information regarding SteamOS compatibility.',
  'SteamOSCompatibility_DescriptionHeader_Compatible': 'Your experience in terms of performance and input may vary depending on your hardware.',
  'SteamOSCompatibility_DescriptionHeader_Unsupported': 'Some or all of this game currently doesn\'t function on SteamOS.',
  'SteamOSCompatibility_Category_Compatible': 'Compatible',
  'SteamOSCompatibility_Category_Unsupported': 'Unsupported',
  'SteamOSCompatibility_Category_Unknown': 'Unknown',
}

export const STEAM_DECK_VERIFIED_TEST_RESULT_MAP: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  for (const k of Object.keys(STEAM_STRINGS_MAP)) {
    out[`#${k}`] = STEAM_STRINGS_MAP[k]
  }
  return out
})()


const STEAM_REDIS_PREFIX = 'steam'

export const redisCacheSteamStoreDetails = async (
  data: unknown,
  key: string,
  cacheTime: number = 60 * 60 * 24 * 2, // Default to 2 days
): Promise<void> => {
  if (data === undefined || data === null) {
    throw new Error('Data is required for caching Steam app details.')
  }
  if (!key) {
    throw new Error('A lookup key is required to cache Steam data.')
  }
  const redisKey = `${STEAM_REDIS_PREFIX}:app_details:${key}`
  try {
    await redisCacheExtData(JSON.stringify(data), redisKey, cacheTime)
    logger.info(`Cached Steam app details for ${cacheTime} seconds with key ${redisKey}`)
  } catch (error) {
    logger.error(`Redis error while caching Steam app details for key "${redisKey}":`, error)
  }
}

export const redisLookupSteamStoreDetails = async (key: string): Promise<unknown | null> => {
  if (!key) {
    throw new Error('A lookup key is required to lookup Steam data.')
  }
  const redisKey = `${STEAM_REDIS_PREFIX}:app_details:${key}`
  try {
    const cachedData = await redisLookupExtData(redisKey)
    if (cachedData) {
      logger.info(`Retrieved Steam app details for "${key}" from Redis cache`)
      return JSON.parse(cachedData)
    }
  } catch (error) {
    logger.error('Redis error while fetching cached Steam app details:', error)
  }
  return null
}

/* Suggestions cache */

export const redisCacheSteamSearchSuggestions = async (
  data: any[],
  searchTerm: string,
  cacheTime: number = 60 * 60 * 24 * 2, // Default to 2 days
): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching a Steam suggestion list.')
  }
  if (!searchTerm) {
    throw new Error('A search term is required to cache a Steam suggestion list.')
  }
  const redisKey = `${STEAM_REDIS_PREFIX}:game_suggestions:${searchTerm}`
  try {
    await redisCacheExtData(JSON.stringify(data), redisKey, cacheTime)
    logger.info(`Cached Steam suggestion list for ${cacheTime} seconds with key ${redisKey}`)
  } catch (error) {
    logger.error(`Redis error while caching Steam suggestion list for key "${redisKey}":`, error)
  }
}

export const redisLookupSteamSearchSuggestions = async (
  searchTerm: string,
): Promise<any[] | null> => {
  if (!searchTerm) {
    throw new Error('A search term is required.')
  }
  const redisKey = `${STEAM_REDIS_PREFIX}:game_suggestions:${searchTerm}`
  try {
    const cachedData = await redisLookupExtData(redisKey)
    if (cachedData) {
      logger.info(`Retrieved Steam suggestion list for search term "${searchTerm}" from Redis cache`)
      return JSON.parse(cachedData) as any[]
    }
  } catch (error) {
    logger.error('Redis error while fetching cached suggestions:', error)
  }
  return null
}

export const redisCacheMaxSteamAppId = async (
  data: MaxSteamAppIdCache,
  cacheTime: number = 60 * 60 * 24 * 2, // 2 days
): Promise<void> => {
  if (!data) {
    throw new Error('Data is required for caching max Steam app id.')
  }
  const redisKey = `${STEAM_REDIS_PREFIX}:max_app_id`
  try {
    await redisCacheExtData(JSON.stringify(data), redisKey, cacheTime)
    logger.info(`Cached max Steam AppId for ${cacheTime} seconds with key ${redisKey}`)
  } catch (error) {
    logger.error(`Redis error while caching max Steam AppId for key "${redisKey}":`, error)
  }
}

export const redisLookupMaxSteamAppId = async (): Promise<MaxSteamAppIdCache | null> => {
  const redisKey = `${STEAM_REDIS_PREFIX}:max_app_id`
  try {
    const cachedData = await redisLookupExtData(redisKey)
    if (cachedData) {
      logger.info('Retrieved cached max Steam AppId from Redis')
      return JSON.parse(cachedData) as MaxSteamAppIdCache
    }
  } catch (error) {
    logger.error('Redis error while fetching cached max Steam AppId:', error)
  }
  return null
}


/**
 * Fetches detailed information for a game from the Steam API by its App ID.
 *
 * @param {string} appId - The Steam App ID of the game to fetch.
 * @returns {Promise<Object>} - Object containing the game's data or null if not found.
 * @throws {Error} - Throws if there is an error during the API call.
 */
export const fetchSteamStoreGameDetails = async (appId: string): Promise<SteamStoreAppDetails | Record<string, never>> => {
  const cacheKey = `appdetails:${appId}`
  const cachedData = await redisLookupSteamStoreDetails(cacheKey)
  if (cachedData) {
    return cachedData as SteamStoreAppDetails
  }

  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}`
  try {
    logger.info(`Fetching game data for appId ${appId} from Steam API...`)
    const response = await fetch(url)

    // Check if response is ok (status 200)
    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`Steam app details API request failed with status ${response.status}: ${errorBody}`)
      await redisCacheSteamStoreDetails({}, cacheKey, 3600) // Cache error response for 1 hour
      return {}
    }
    const data = await response.json()
    if (data && data[appId]?.success) {
      const appDetails: SteamStoreAppDetails = data[appId].data

      // Cache results, then return them
      await redisCacheSteamStoreDetails(appDetails, cacheKey)

      // Also cache in search results
      if (appDetails.name) {
        const gameImages = await generateImageLinksFromAppId(appId)
        await storeGameInRedis({
          gameName: appDetails.name,
          appId: String(appId),
          banner: gameImages.banner || null,
          poster: gameImages.poster || null,
        })
      }

      return appDetails
    } else {
      logger.warn(`No game data found for appId ${appId}`)
      await redisCacheSteamStoreDetails({}, cacheKey, 3600) // Cache error response for 1 hour
      return {}
    }
  } catch (error) {
    logger.error(`Failed to fetch game data for appId ${appId}:`, error)
  }

  await redisCacheSteamStoreDetails({}, cacheKey, 3600) // Cache error response for 1 hour
  return {}
}

/**
 * Fetches a list of game suggestions from Steam based on a search term.
 * If cached results are available, they are returned immediately. Otherwise,
 * results are fetched from the Steam API and cached in Redis.
 */
export const fetchSteamGameSuggestions = async (
  searchTerm: string,
): Promise<{ suggestions: SteamGame[]; fromCache: boolean }> => {
  const encodedSearchTerm = encodeURIComponent(searchTerm)
  const cachedData = await redisLookupSteamSearchSuggestions(encodedSearchTerm)

  if (cachedData) {
    logger.info(`Using cached results for Steam suggest API with search term: '${searchTerm}'`)
    return { suggestions: cachedData as SteamGame[], fromCache: true }
  }

  const url = `https://store.steampowered.com/search/suggest?f=json&cc=US&use_store_query=1&category1=998&ndl=1&term=${encodedSearchTerm}`

  try {
    logger.info(`Fetching game suggestions for "${searchTerm}" from Steam API...`)
    const response = await fetch(url)

    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`Steam suggest API request failed with status ${response.status}: ${errorBody}`)
      await redisCacheSteamSearchSuggestions([], encodedSearchTerm, 3600) // Cache error response for 1 hour
      return { suggestions: [], fromCache: false }
    }

    const data = await response.json()

    if (!Array.isArray(data)) {
      logger.error(`Unexpected response format for "${searchTerm}":`, data)
      await redisCacheSteamSearchSuggestions([], encodedSearchTerm, 3600) // Cache error response for 1 hour
      return { suggestions: [], fromCache: false }
    }

    const games: SteamGame[] = data
      .filter((item: SteamSuggestApp) => item.type === 'game')
      .map((item: SteamSuggestApp) => ({
        appId: item.id,
        name: item.name,
      }))

    await redisCacheSteamSearchSuggestions(games, encodedSearchTerm)
    return { suggestions: games, fromCache: false }
  } catch (error) {
    logger.error('Error fetching Steam game suggestions:', error)
    await redisCacheSteamSearchSuggestions([], encodedSearchTerm, 3600) // Cache error response for 1 hour
    return { suggestions: [], fromCache: false }
  }
}

/**
 * Fetch Steam Deck & SteamOS compatibility for a given appId.
 *
 * @param appId Steam appid (string or number)
 * @param opts  Optional params: language, region, cookie, ttl, logger
 * @returns AjaxCompatResponse['results'] or {} on hard failure
 */
export const fetchSteamDeckCompatibility = async (
  appId: string,
): Promise<AjaxCompatResponse['results'] | Record<string, never>> => {
  const cacheKey = `appcompatibilityreport:${appId}`
  const cachedData = await redisLookupSteamStoreDetails(cacheKey)
  if (cachedData) {
    return cachedData as AjaxCompatResponse['results']
  }

  // Fetch from Valve
  const url = `https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=${encodeURIComponent(
    appId,
  )}&l=en&cc=US`
  try {
    logger.info(`Fetching Deck compatibility for appId ${appId}...`)
    const response = await fetch(url)
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      logger.error(`Deck compat request failed [${response.status}]: ${body?.slice(0, 500)}`)
      // Cache a negative result briefly to avoid hammering
      await redisCacheSteamStoreDetails({}, cacheKey, 3600)
      return {}
    }

    // This endpoint typically returns JSON with a "results" object.
    // In rare cases it might return a JSON wrapper with an HTML fragment.
    const data = (await response.json()) as AjaxCompatResponse

    if (!data?.success || !data.results) {
      logger.warn(`No results for appId ${appId} (success=${data?.success})`)
      await redisCacheSteamStoreDetails({}, cacheKey, 3600)
      return {}
    }

    // Cache & return
    await redisCacheSteamStoreDetails(data.results, cacheKey)
    return data.results
  } catch (err) {
    logger.error(`Failed to fetch Deck compat for appId ${appId}: ${String(err)}`)
    await redisCacheSteamStoreDetails({}, cacheKey, 3600)
    return {}
  }
}

export const getMaxSteamAppId = async (): Promise<MaxSteamAppIdCache> => {
  // Try cache first
  const cached = await redisLookupMaxSteamAppId()
  if (cached) return cached

  const endpoint = 'https://api.steampowered.com/ISteamApps/GetAppList/v2/'
  const timeoutMs = 30_000
  // Abort after timeout
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(new Error('Request timed out')), timeoutMs)
  try {
    const resp = await fetch(endpoint, {
      method: 'GET',
      signal: ctrl.signal,
      // Browsers auto-handle compression; Node 18+ fetch does too.
      headers: { 'Accept': 'application/json' },
    })
    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      throw new Error(`GetAppList failed: ${resp.status} ${resp.statusText} ${body ? `- ${body.slice(0, 200)}` : ''}`)
    }
    const json = await resp.json()
    const apps = json?.applist?.apps
    if (!Array.isArray(apps) || apps.length === 0) {
      throw new Error('Unexpected response shape: missing applist.apps')
    }
    let maxId = 0
    let maxName = ''
    for (let i = 0; i < apps.length; i++) {
      const a = apps[i]
      // Be defensive about data shape
      const id = typeof a?.appid === 'number' ? a.appid : Number(a?.appid)
      if (Number.isFinite(id) && id > maxId) {
        maxId = id
        maxName = typeof a?.name === 'string' ? a.name : ''
      }
    }

    const payload: MaxSteamAppIdCache = {
      maxAppId: maxId,
      name: maxName,
      totalApps: apps.length,
      fetchedAt: new Date().toISOString(),
    }

    // Cache result for a week
    await redisCacheMaxSteamAppId(payload)

    return payload
  } finally {
    clearTimeout(t)
  }
}

/**
 * Normalises Steam store compatibility metadata into the shared summary model, extracting category
 * labels, detailed bullet points, and the last tested timestamp. Returns null when no compatibility block exists.
 */
export const mapSteamDeckCompatibility = (details?: AjaxCompatResponse['results'] | Record<string, never> | null): SteamDeckCompatibilitySummary | null => {
  const payload = (details as any) ?? {}
  const compatibility = payload?.steam_deck_compatibility ? payload.steam_deck_compatibility : payload

  // If there's nothing useful, bail out.
  if (!compatibility || (Object.keys(compatibility).length === 0)) {
    return null
  }

  // Determine the numeric compatibility/category code. Prefer the Deck category.
  const compatibilityCode: number | null = compatibility.resolved_category ?? null

  const rawItems: { display_type?: number; loc_token?: string }[] = []
  if (Array.isArray(compatibility.resolved_items)) {
    rawItems.push(...compatibility.resolved_items)
  }

  // Map raw items to the shared model: strip leading '#' from loc_token, lookup STEAM_STRINGS_MAP key (without '#'),
  // include steamos items and de-duplicate by the original loc_token.
  const mapped: SteamDeckCompatibilitySummaryDetail[] = []
  const seen = new Set<string>()
  if (Array.isArray(compatibility.steamos_resolved_items)) {
    rawItems.push(...compatibility.steamos_resolved_items)
  }
  for (const item of rawItems) {
    const rawCode = item?.loc_token
    if (!rawCode) continue
    if (seen.has(rawCode)) continue
    seen.add(rawCode)
    const stripped = rawCode.startsWith('#') ? rawCode.slice(1) : rawCode
    const human = (STEAM_STRINGS_MAP && STEAM_STRINGS_MAP[stripped]) ? STEAM_STRINGS_MAP[stripped] : stripped
    const code = typeof item.display_type === 'number' ? item.display_type : null
    mapped.push({
      code,
      description: human,
    })
  }

  return {
    compatibilityCode: typeof compatibilityCode === 'number' ? compatibilityCode : null,
    compatibilityItems: mapped,
  }
}
