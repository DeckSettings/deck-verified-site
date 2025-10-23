import {
  redisCacheIsThereAnyDealResponse, redisLookupIsThereAnyDealResponse,
} from '../redis'
import logger from '../logger'
import config from '../config'
import type { GamePriceDeal, GamePriceSummary } from '../../../shared/src/game'
import { parseNumberOrNull, toIsoDateString } from '../helpers'

interface IsThereAnyDealPriceEntry {
  price_new?: number;
  price_old?: number;
  price_cut?: number;
  currency?: string;
  recorded?: string;
  urls?: {
    buy?: string;
  };
  shop?: {
    id?: string;
    name?: string;
  };
  voucher?: string | null;
}

interface IsThereAnyDealPriceResponse {
  data?: {
    list?: IsThereAnyDealPriceEntry[];
    plain?: string;
    game?: {
      id?: string;
      title?: string;
    };
  };
}

interface IsThereAnyDealLookupGame {
  id?: string;
  slug?: string;
  title?: string;
}

interface IsThereAnyDealLookupResponse {
  found?: boolean;
  game?: IsThereAnyDealLookupGame;
}

interface IsThereAnyDealOverviewDeal {
  shop?: {
    id?: number | string;
    name?: string;
  };
  price?: {
    amount?: number;
    amountInt?: number;
    currency?: string;
  };
  regular?: {
    amount?: number;
    amountInt?: number;
    currency?: string;
  };
  cut?: number;
  voucher?: string | null;
  flag?: string | null;
  drm?: unknown;
  platforms?: unknown;
  timestamp?: string;
  expiry?: string | null;
  url?: string;
}

interface IsThereAnyDealOverviewHistoricalLow {
  shop?: {
    id?: number | string;
    name?: string;
  };
  price?: {
    amount?: number;
    amountInt?: number;
    currency?: string;
  };
  regular?: {
    amount?: number;
    amountInt?: number;
    currency?: string;
  };
  cut?: number;
  timestamp?: string;
}

interface IsThereAnyDealOverviewPriceEntry {
  id?: string;
  current?: IsThereAnyDealOverviewDeal | null;
  lowest?: IsThereAnyDealOverviewHistoricalLow | null;
  bundled?: number;
  urls?: {
    game?: string;
  };
}

interface IsThereAnyDealOverviewResponse {
  prices?: IsThereAnyDealOverviewPriceEntry[];
  bundles?: unknown[];
}

interface IsThereAnyDealSearchEntry {
  title?: string;
  plain?: string;
  game_id?: string;
}

interface IsThereAnyDealSearchResponse {
  data?: {
    results?: IsThereAnyDealSearchEntry[];
  };
}

const sanitizeItadSearchKey = (value: string): string => value.trim().toLowerCase()


const isUuid = (value: string | null | undefined): boolean => {
  if (!value) {
    return false
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}

/**
 * Resolves an ITAD game record using a Steam app ID or game title by calling the lookup endpoint with caching.
 */
const lookupIsThereAnyDealGame = async (options: {
  appId?: string | null;
  title?: string | null;
}): Promise<IsThereAnyDealLookupGame | null> => {
  if (!config.isThereAnyDealApiKey) {
    logger.warn('IsThereAnyDeal API key not configured; skipping game lookup.')
    return null
  }

  const params = new URLSearchParams()
  params.set('key', config.isThereAnyDealApiKey)

  const candidateAppId = options.appId ?? null
  const parsedAppId = parseNumberOrNull(candidateAppId ?? null)
  if (parsedAppId !== null) {
    params.set('appid', parsedAppId.toString())
  }

  const candidateTitle = options.title && options.title.trim().length > 0
    ? options.title.trim()
    : null
  if (candidateTitle && parsedAppId === null) {
    params.set('title', candidateTitle)
  }

  if (!params.has('appid') && !params.has('title')) {
    logger.warn('lookupIsThereAnyDealGame called without valid lookup parameters.')
    return null
  }

  const cacheKeyParts: string[] = ['lookup']
  const appIdParam = params.get('appid')
  const titleParam = params.get('title')
  if (appIdParam) {
    cacheKeyParts.push(`appid:${appIdParam}`)
  }
  if (titleParam) {
    cacheKeyParts.push(`title:${sanitizeItadSearchKey(titleParam)}`)
  }
  const cacheKey = cacheKeyParts.join(':')

  const cachedData = await redisLookupIsThereAnyDealResponse(cacheKey)
  if (cachedData !== null) {
    const cached = cachedData as IsThereAnyDealLookupResponse
    if (!cached || cached.found === false) {
      return null
    }
    return cached.game ?? null
  }

  const url = `https://api.isthereanydeal.com/games/lookup/v1?${params.toString()}`
  try {
    logger.info(`Looking up IsThereAnyDeal game for key "${cacheKey}"...`)
    const response = await fetch(url)
    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`IsThereAnyDeal lookup request failed with status ${response.status}: ${errorBody}`)
      await redisCacheIsThereAnyDealResponse({ found: false }, cacheKey, 3600)
      return null
    }

    const data = await response.json() as IsThereAnyDealLookupResponse
    await redisCacheIsThereAnyDealResponse(data, cacheKey)
    if (!data?.found || !data.game) {
      return null
    }
    return data.game
  } catch (error) {
    logger.error(`Failed to lookup IsThereAnyDeal game for key "${cacheKey}":`, error)
  }

  await redisCacheIsThereAnyDealResponse({ found: false }, cacheKey, 3600)
  return null
}

/**
 * Performs a cached search against ITAD's legacy search API, returning the raw response shape.
 */
const fetchIsThereAnyDealSearch = async (query: string): Promise<IsThereAnyDealSearchResponse | null> => {
  if (!config.isThereAnyDealApiKey) {
    logger.warn('IsThereAnyDeal API key not configured; skipping price search.')
    return null
  }

  const normalizedQuery = sanitizeItadSearchKey(query)
  const cacheKey = `search:${normalizedQuery}`
  const cachedData = await redisLookupIsThereAnyDealResponse(cacheKey)
  if (cachedData !== null) {
    return cachedData as IsThereAnyDealSearchResponse
  }

  const url = `https://api.isthereanydeal.com/v02/search/search/?key=${encodeURIComponent(config.isThereAnyDealApiKey)}&q=${encodeURIComponent(query)}&limit=5`
  try {
    logger.info(`Fetching IsThereAnyDeal search results for "${query}"...`)
    const response = await fetch(url)
    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`IsThereAnyDeal search request failed with status ${response.status}: ${errorBody}`)
      await redisCacheIsThereAnyDealResponse({}, cacheKey, 3600)
      return null
    }

    const data = await response.json() as IsThereAnyDealSearchResponse
    await redisCacheIsThereAnyDealResponse(data, cacheKey)
    return data
  } catch (error) {
    logger.error(`Failed to fetch IsThereAnyDeal search results for "${query}":`, error)
  }

  await redisCacheIsThereAnyDealResponse({}, cacheKey, 3600)
  return null
}

/**
 * Fetches price overview data by POSTing the ITAD game UUID to the v2 overview endpoint, using Redis caching.
 */
const fetchIsThereAnyDealPrices = async (gameId: string | null): Promise<IsThereAnyDealPriceResponse | null> => {
  if (!config.isThereAnyDealApiKey) {
    logger.warn('IsThereAnyDeal API key not configured; skipping price lookup.')
    return null
  }

  const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
  if (!normalizedGameId) {
    logger.warn('fetchIsThereAnyDealPrices called without a gameId.')
    return null
  }

  if (!isUuid(normalizedGameId)) {
    logger.warn(`fetchIsThereAnyDealPrices received invalid gameId "${normalizedGameId}".`)
    return null
  }

  const cacheKey = `prices:id:${normalizedGameId}`

  const cachedData = await redisLookupIsThereAnyDealResponse(cacheKey)
  if (cachedData !== null) {
    return cachedData as IsThereAnyDealPriceResponse
  }

  const params = new URLSearchParams()
  params.set('key', config.isThereAnyDealApiKey)
  if (config.isThereAnyDealCountry) {
    params.set('country', config.isThereAnyDealCountry)
  }

  const url = `https://api.isthereanydeal.com/games/overview/v2?${params.toString()}`
  const requestBody = JSON.stringify([normalizedGameId])

  try {
    logger.info(`Fetching IsThereAnyDeal prices for key "${cacheKey}"...`)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: requestBody,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      logger.error(`IsThereAnyDeal prices request failed with status ${response.status}: ${errorBody}`)
      await redisCacheIsThereAnyDealResponse({}, cacheKey, 3600)
      return null
    }

    const overview = await response.json() as IsThereAnyDealOverviewResponse

    const list: IsThereAnyDealPriceEntry[] = []
    for (const priceEntry of overview.prices ?? []) {
      const current = priceEntry.current
      if (current) {
        list.push({
          price_new: typeof current.price?.amount === 'number' ? current.price.amount : undefined,
          price_old: typeof current.regular?.amount === 'number' ? current.regular.amount : undefined,
          price_cut: typeof current.cut === 'number' ? current.cut : undefined,
          currency: current.price?.currency,
          recorded: current.timestamp ?? undefined,
          urls: current.url ? { buy: current.url } : undefined,
          shop: current.shop
            ? {
              id: current.shop.id !== undefined ? String(current.shop.id) : undefined,
              name: current.shop.name,
            }
            : undefined,
          voucher: current.voucher ?? null,
        })
      }

      if (!current && priceEntry.lowest) {
        const lowest = priceEntry.lowest
        list.push({
          price_new: typeof lowest.price?.amount === 'number' ? lowest.price.amount : undefined,
          price_old: typeof lowest.regular?.amount === 'number' ? lowest.regular.amount : undefined,
          price_cut: typeof lowest.cut === 'number' ? lowest.cut : undefined,
          currency: lowest.price?.currency,
          recorded: lowest.timestamp ?? undefined,
          shop: lowest.shop
            ? {
              id: lowest.shop.id !== undefined ? String(lowest.shop.id) : undefined,
              name: lowest.shop.name,
            }
            : undefined,
          voucher: null,
        })
      }
    }

    const normalizedData: {
      list?: IsThereAnyDealPriceEntry[];
      game?: {
        id?: string;
      };
    } = {}

    if (list.length > 0) {
      normalizedData.list = list
    }
    normalizedData.game = {
      id: normalizedGameId,
    }

    const normalizedResponse: IsThereAnyDealPriceResponse = Object.keys(normalizedData).length > 0
      ? { data: normalizedData }
      : {}

    await redisCacheIsThereAnyDealResponse(normalizedResponse, cacheKey)
    return normalizedResponse
  } catch (error) {
    logger.error(`Failed to fetch IsThereAnyDeal prices for key "${cacheKey}":`, error)
  }

  await redisCacheIsThereAnyDealResponse({}, cacheKey, 3600)
  return null
}

/**
 * Converts raw ITAD deal entries into the shared GamePriceDeal format, pruning empty rows and sorting by current price.
 */
const buildGamePriceDeals = (entries: IsThereAnyDealPriceEntry[] | undefined): GamePriceDeal[] => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return []
  }

  return entries
    .map((entry, index): GamePriceDeal | null => {
      const priceNew = typeof entry.price_new === 'number' ? entry.price_new : null
      const priceOld = typeof entry.price_old === 'number' ? entry.price_old : null
      const priceCut = typeof entry.price_cut === 'number' ? entry.price_cut : null
      const currency = typeof entry.currency === 'string' ? entry.currency : null
      const url = entry.urls?.buy ? String(entry.urls.buy) : null
      const recordedAt = toIsoDateString(entry?.recorded)
      //const recordedAt = entry.recorded
      const voucher = typeof entry.voucher === 'string' && entry.voucher.trim().length > 0
        ? entry.voucher.trim()
        : null
      const shopId = entry.shop?.id || `shop-${index}`
      const shopName = entry.shop?.name || entry.shop?.id || 'Unknown'

      if (priceNew === null && priceOld === null && !url) {
        return null
      }

      return {
        shopId,
        shopName,
        priceNew,
        priceOld,
        priceCut,
        currency,
        url,
        recordedAt,
        voucher,
      }
    })
    .filter((deal): deal is GamePriceDeal => Boolean(deal))
    .sort((a, b) => {
      if (a.priceNew === null && b.priceNew === null) return 0
      if (a.priceNew === null) return 1
      if (b.priceNew === null) return -1
      return a.priceNew - b.priceNew
    })
}

/**
 * Produces a GamePriceSummary using either a Steam app ID or game name by resolving the ITAD game ID via lookup.
 */
export const generateIsThereAnyDealPriceSummary = async (options: {
  appId?: string | null;
  gameName?: string | null;
}): Promise<GamePriceSummary | null> => {
  const appId = options.appId?.toString().trim() || null
  const name = options.gameName?.trim() || null

  if (!appId && !name) {
    logger.warn('generateIsThereAnyDealPriceSummary called without appId or gameName.')
    return null
  }

  if (!config.isThereAnyDealApiKey) {
    logger.warn('IsThereAnyDeal API key not configured; skipping price summary generation.')
    return null
  }

  const resolvedAppId = parseNumberOrNull(appId)

  const lookupResult = await lookupIsThereAnyDealGame({
    appId,
    title: name,
  })

  if (!lookupResult) {
    logger.info('IsThereAnyDeal lookup did not return a game record.')
    return null
  }

  const resolvedGameId = lookupResult.id?.trim() ?? null
  if (!resolvedGameId || !isUuid(resolvedGameId)) {
    logger.warn('IsThereAnyDeal lookup returned an invalid game identifier.')
    return null
  }

  const priceResponse = await fetchIsThereAnyDealPrices(resolvedGameId)
  if (!priceResponse || Object.keys(priceResponse).length === 0) {
    return null
  }

  const deals = buildGamePriceDeals(priceResponse.data?.list)
  const bestDeal = deals.length > 0 ? deals[0] : null

  const summary: GamePriceSummary = {
    appId: resolvedAppId ?? null,
    gameName: lookupResult.title || priceResponse.data?.game?.title || options.gameName || null,
    itadSlug: lookupResult.slug ?? null,
    lastChecked: new Date().toISOString(),
    deals,
    bestDeal,
  }

  return summary
}
