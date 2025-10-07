import {
  SteamDeckCompatibilitySummary,
  SteamDeckCompatibilitySummaryDetail,
  SteamGame,
  SteamStoreAppDetails,
  SteamSuggestApp,
} from '../../../shared/src/game'
import {
  redisCacheSteamStoreDetails,
  redisCacheSteamSearchSuggestions,
  redisLookupSteamStoreDetails,
  redisLookupSteamSearchSuggestions,
  storeGameInRedis,
} from '../redis'
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
    console.log(data)

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
