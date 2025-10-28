import { fetchService as aliasFetchService } from '@app/api'
import { BACKEND_API_ORIGIN } from 'src/utils/env'

import type { FetchServiceResponse } from 'src/utils/api/types'
import type {
  GameReport,
  GameReportData,
  GameMetadata,
  GameReportReactions,
  GameSearchResult,
  GameDetails,
  GitHubIssueLabel,
  GitHubUser,
  GameReportForm,
  GameDetailsRequestMetricResult,
  GamePriceSummary,
  GameRatingsSummary,
  UserGameReport,
  GithubIssuesSearchResultItems,
} from '../../../shared/src/game'

export type { FetchServiceResponse } from 'src/utils/api/types'
export type {
  GameReport,
  GameReportData,
  GameMetadata,
  GameReportReactions,
  GameSearchResult,
  GameDetails,
  GitHubIssueLabel,
  GitHubUser,
  GameReportForm,
  GameDetailsRequestMetricResult,
  GamePriceSummary,
  GameRatingsSummary,
  UserGameReport,
  GithubIssuesSearchResultItems,
}

interface MarketQueryParams {
  appId?: string | null;
  gameName?: string | null;
  country?: string;
  currency?: string;
}

export interface HomeReport {
  id: number | null;
  // Optional full GitHub issue object for user reports (undefined for community reports)
  issue?: GithubIssuesSearchResultItems | undefined;
  data: GameReportData;
  metadata: GameMetadata;
  reactions: GameReportReactions;
  user: GitHubUser;
  reviewScore: string;
}

/**
 * Adapter around the platform-specific fetch service.
 *
 * This function delegates to the platform-injected `fetchService` alias so the
 * same higher-level code can operate in SSR, web, and native (Capacitor) builds.
 *
 * @param url - The URL to fetch (may be a relative path when running in browser).
 * @param options - Optional RequestInit overrides passed to the underlying fetch implementation.
 * @returns A promise that resolves to the platform-specific FetchServiceResponse.
 */
export const fetchService = (url: string, options?: RequestInit): Promise<FetchServiceResponse> =>
  aliasFetchService(url, options)

/**
 * Shared API helpers. Platform-specific fetch implementations are injected via
 * Vite aliasing so that Capacitor builds can rely on CapacitorHttp while web
 * builds continue to use the native fetch API.
 *
 * @param path - The request path (beginning with a slash) to call on the backend.
 * @returns A fully-qualified URL to use for fetch calls on SSR/native builds or the passed path for browser builds.
 */
export const apiUrl = (path: string) => {
  const backendApiOrigin = BACKEND_API_ORIGIN
  const isSsrBuild = globalThis.isSsr ?? typeof window === 'undefined'
  const isNativeBuild = globalThis.isCapacitor ?? false
  if (isSsrBuild || isNativeBuild) {
    return `${backendApiOrigin}${path}`
  }
  return path
}

/**
 * Build a condensed `HomeReport` from a full `GameReport`.
 *
 * This helper extracts the small set of fields used by list and summary UIs
 * and derives a simple `reviewScore` based on reactions to make it easy to
 * surface a quick sentiment for each report.
 *
 * Derivation rules for `reviewScore`:
 * - 'positive' when (thumbs_up - thumbs_down) > 0
 * - 'negative' when (thumbs_up - thumbs_down) < 0
 * - 'neutral' when they are equal
 *
 * @param report - The full `GameReport` object returned by the backend.
 * @returns A lightweight `HomeReport` suitable for display in lists.
 */
const buildHomeReport = (report: GameReport): HomeReport => {
  const reactionDiff = (report.reactions.reactions_thumbs_up || 0) - (report.reactions.reactions_thumbs_down || 0)
  const reviewScore = reactionDiff > 0 ? 'positive' : reactionDiff < 0 ? 'negative' : 'neutral'
  return {
    id: report.id,
    data: report.data,
    metadata: report.metadata,
    reactions: report.reactions,
    user: report.user,
    reviewScore,
    // Community/popular reports don't include a full GitHub issue object; leave undefined.
    issue: undefined,
  }
}

/**
 * Fetch price summary for a game (I.T.A.D. integration) via backend API.
 *
 * Provide either `appId` or `gameName`. The backend prefers `appId` when both are supplied.
 *
 * @param params - Market query parameters (appId or gameName).
 * @returns A `GamePriceSummary` object or `null` if not available or on error.
 */
export const fetchGamePriceSummary = async (params: MarketQueryParams): Promise<GamePriceSummary | null> => {
  let url = apiUrl('/deck-verified/api/v1/game_prices')
  const { country = 'US', currency = 'USD' } = params

  const queryParts: string[] = []
  if (params.appId) {
    queryParts.push(`appid=${params.appId}`)
  } else if (params.gameName) {
    queryParts.push(`name=${encodeURIComponent(params.gameName)}`)
  } else {
    console.error('fetchGamePriceSummary called without appId or gameName')
    return null
  }

  if (country && country.trim() !== '') {
    queryParts.push(`country=${encodeURIComponent(country)}`)
  }
  if (currency && currency.trim() !== '') {
    queryParts.push(`currency=${encodeURIComponent(currency)}`)
  }

  if (queryParts.length > 0) {
    url += `?${queryParts.join('&')}`
  }

  try {
    const response = await fetchService(url)
    if (response.status === 204) {
      return null
    }
    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`Failed to fetch price summary: ${response.status} - ${errorBody}`)
      return null
    }
    const text = await response.text()
    if (!text) {
      return null
    }
    return JSON.parse(text) as GamePriceSummary
  } catch (error) {
    console.error('Error fetching price summary:', error)
    return null
  }
}

/**
 * Fetch ratings summary (ProtonDB + Steam Deck compatibility) via backend API.
 *
 * Provide either `appId` or `gameName`. The backend prefers `appId` when both are supplied.
 *
 * @param params - Market query parameters (appId or gameName).
 * @returns A `GameRatingsSummary` object or `null` if not available or on error.
 */
export const fetchGameRatingsSummary = async (params: MarketQueryParams): Promise<GameRatingsSummary | null> => {
  let url = apiUrl('/deck-verified/api/v1/game_ratings')
  if (params.appId) {
    url += `?appid=${params.appId}`
  } else if (params.gameName) {
    url += `?name=${encodeURIComponent(params.gameName)}`
  } else {
    console.error('fetchGameRatingsSummary called without appId or gameName')
    return null
  }

  try {
    const response = await fetchService(url)
    if (response.status === 204) {
      return null
    }
    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`Failed to fetch ratings summary: ${response.status} - ${errorBody}`)
      return null
    }
    const text = await response.text()
    if (!text) {
      return null
    }
    return JSON.parse(text) as GameRatingsSummary
  } catch (error) {
    console.error('Error fetching ratings summary:', error)
    return null
  }
}

/**
 * Fetch the most recent community reports.
 *
 * @param count - Number of reports to fetch (default: 5).
 * @param sort - Which field to sort by on the backend ('updated' or 'created'). Defaults to 'updated'.
 * @returns An array of simplified `HomeReport` objects. Returns an empty array on error.
 */
export const fetchRecentReports = async (count: number = 5, sort: 'updated' | 'created' = 'updated'): Promise<HomeReport[]> => {
  const url = apiUrl(`/deck-verified/api/v1/recent_reports?count=${count}&sortby=${sort}`)

  try {
    console.debug('Fetching recent reports from backend')
    const response = await fetchService(url)
    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Failed to fetch recent reports: ${response.status} - ${errorBody}`)
    }
    const data = await response.json() as GameReport[]
    return data.map(buildHomeReport)
  } catch (error) {
    console.error('Error fetching or parsing recent reports:', error)
    return []
  }
}

/**
 * Fetch the most popular community reports.
 *
 * @param count - Number of reports to fetch (default: 5).
 * @returns An array of simplified `HomeReport` objects. Returns an empty array on error.
 */
export const fetchPopularReports = async (count: number = 5): Promise<HomeReport[]> => {
  const url = apiUrl(`/deck-verified/api/v1/popular_reports?count=${count}`)

  try {
    console.debug('Fetching popular reports from backend')
    const response = await fetchService(url)
    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Failed to fetch popular reports: ${response.status} - ${errorBody}`)
    }
    const data = await response.json() as GameReport[]
    return data.map(buildHomeReport)
  } catch (error) {
    console.error('Error fetching or parsing popular reports:', error)
    return []
  }
}

/**
 * Fetch a game's details (including optional external reviews).
 *
 * Provide either `appId` or `gameName`. When both are present the backend prefers `appId`.
 *
 * @param gameName - Friendly game name (optional when appId provided).
 * @param appId - Steam AppID (preferred).
 * @returns A `GameDetails` object or `null` if not available or on error.
 */
export const fetchGameData = async (gameName: string | null, appId: string | null, githubToken?: string | null): Promise<GameDetails | null> => {
  let url = apiUrl('/deck-verified/api/v1/game_details')
  if (appId) {
    url += `?appid=${appId}&include_external=true`
  } else if (gameName) {
    url += `?name=${encodeURIComponent(gameName)}`
  } else {
    console.error('fetchGameData called without appId or gameName')
    return null
  }

  try {
    const options: RequestInit | undefined = githubToken
      ? {
        headers: {
          'X-GitHub-Token': githubToken,
        },
      }
      : undefined

    const response = await fetchService(url, options)
    if (response.status === 204) {
      return null
    }
    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`Failed to fetch project data: ${response.status} - ${errorBody}`)
      return null
    }
    const text = await response.text()
    if (!text) return null
    const data = JSON.parse(text) as GameDetails
    if (data) {
      // console.debug('Game data:', JSON.stringify(data))
      return data
    } else {
      console.error('Unable to find game data by AppID/Game Name')
      return null
    }
  } catch (error) {
    console.error('Error fetching project data:', error)
    return null
  }
}

/**
 * Fetch games that have community reports (paginated).
 *
 * @param from - Offset to start from (0-based).
 * @param limit - Maximum number of records to return.
 * @returns An array of `GameSearchResult` or empty array on error / no content.
 */
export const fetchGamesWithReports = async (from: number, limit: number): Promise<GameSearchResult[] | null> => {
  const url = apiUrl(`/deck-verified/api/v1/games_with_reports?from=${from}&limit=${limit}&orderBy=appname&orderDirection=ASC`)
  try {
    const response = await fetchService(url)
    if (response.status === 204) {
      console.log('No results found')
      return []
    }

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`Failed to fetch any results data: ${response.status} - ${errorBody}`)
      return []
    }

    return await response.json() as GameSearchResult[]
  } catch (error) {
    console.error('Error fetching project data:', error)
    return []
  }
}

/**
 * Search for games by name using the backend search endpoint.
 *
 * @param searchString - The search term to query.
 * @param includeExternal - Whether to include external/non-store entries.
 * @returns An array of matching `GameSearchResult` or empty array on error.
 */
export const searchGames = async (searchString: string | null, includeExternal: boolean = false): Promise<GameSearchResult[] | null> => {
  let url = apiUrl('/deck-verified/api/v1/search_games')
  if (searchString) {
    url += `?term=${encodeURIComponent(searchString)}`
  } else {
    console.error('searchGames called without a search string')
    return []
  }
  if (includeExternal) {
    url += '&include_external=true'
  }

  try {
    const response = await fetchService(url)
    if (response.status === 204) {
      console.log('No results found')
      return []
    }

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`Failed to fetch any results data: ${response.status} - ${errorBody}`)
      return []
    }

    return await response.json() as GameSearchResult[]
  } catch (error) {
    console.error('Error fetching project data:', error)
    return []
  }
}

/**
 * Get the template used to render the game report submission form.
 *
 * @returns A `GameReportForm` structure or `null` if not available.
 */
export const gameReportTemplate = async (): Promise<GameReportForm | null> => {
  try {
    const response = await fetchService(apiUrl('/deck-verified/api/v1/report_form'))
    if (response.status === 204) {
      console.log('No results found')
      return null
    }

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`Failed to fetch any results data: ${response.status} - ${errorBody}`)
      return null
    }
    const text = await response.text()
    if (!text) return null
    return JSON.parse(text) as GameReportForm
  } catch (error) {
    console.error('Error fetching project data:', error)
    return null
  }
}

/**
 * Fetch issue labels used by the reports repository — network-only.
 *
 * @returns An array of `GitHubIssueLabel` objects (may be empty on error).
 */
export const fetchLabels = async (): Promise<GitHubIssueLabel[]> => {
  try {
    const url = apiUrl('/deck-verified/api/v1/issue_labels')
    console.debug('Fetching labels from backend: ', url)
    const response = await fetchService(url)
    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Failed to fetch labels: ${response.status} - ${errorBody}`)
    }
    const data = await response.json() as GitHubIssueLabel[]
    return data
  } catch (error) {
    console.error('Error fetching labels:', error)
    return []
  }
}

/**
 * Fetch aggregated metrics about game details requests.
 *
 * @param days - How many days to cover for metrics aggregation.
 * @param min_report_count - Minimum number of reports filter.
 * @param max_report_count - Maximum number of reports filter.
 * @param limit - Optional maximum number of results to return.
 * @returns An array of `GameDetailsRequestMetricResult` or an empty array on error.
 */
export const fetchTopGameDetailsRequestMetrics = async (days: number, min_report_count: number, max_report_count: number, limit: number | null): Promise<GameDetailsRequestMetricResult[]> => {
  let url = apiUrl(`/deck-verified/api/v1/metric/game_details?days=${days}&min_report_count=${min_report_count}&max_report_count=${max_report_count}`)
  if (limit) {
    url += '&limit=' + limit
  }
  try {
    const response = await fetchService(url)
    if (response.status === 204) {
      // 204 - No Content
      console.log('No results found')
      return []
    }

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`Failed to fetch any results data: ${response.status} - ${errorBody}`)
      return []
    }
    const data = await response.json() as { results: GameDetailsRequestMetricResult[] }
    if (!data.results) {
      return []
    }
    return data.results
  } catch (error) {
    console.error('Error fetching project data:', error)
    return []
  }
}

/**
 * Fetch all reports for the authenticated user.
 *
 * @param githubToken - The user's GitHub access token.
 * @param dvToken - The user's Deck Verified authentication token.
 * @returns An array of `UserGameReport` objects or `null` on error.
 */
export const getUserReports = async (githubToken: string, dvToken: string): Promise<UserGameReport[] | null> => {
  const url = apiUrl('/deck-verified/api/user/reports')
  try {
    const response = await fetchService(url, {
      headers: {
        'X-GitHub-Token': githubToken,
        'Authorization': `Bearer ${dvToken}`,
      },
    })
    if (response.status === 204) {
      return []
    }
    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`Failed to fetch user reports: ${response.status} - ${errorBody}`)
      return null
    }
    const data = await response.json() as UserGameReport[]
    return data
  } catch (error) {
    console.error('Error fetching user reports:', error)
    return null
  }
}