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
} from '../../../shared/src/game'
import { CapacitorHttp } from '@capacitor/core'
import type { HttpResponse, HttpOptions } from '@capacitor/core'

// Build absolute API URLs during SSR to avoid hitting the SSR server itself
const SSR = globalThis.isSsr ?? typeof window === 'undefined'

// Detect native (Capacitor) runtime
const IS_NATIVE = globalThis.isCapacitor ?? false

const DEFAULT_API = 'https://deckverified.games'
// Prefer SSR_API_ORIGIN; default to production domain
const SSR_API_ORIGIN = SSR ? (process.env.SSR_API_ORIGIN || DEFAULT_API) : ''
const NATIVE_API_ORIGIN = !SSR && IS_NATIVE ? (process.env.CAPACITOR_API_ORIGIN || DEFAULT_API) : ''

// Build API URL depending on if we are running as SSR or SPA
const apiUrl = (path: string) => {
  if (SSR) return `${SSR_API_ORIGIN}${path}`
  if (IS_NATIVE && NATIVE_API_ORIGIN) return `${NATIVE_API_ORIGIN}${path}`
  return path
}

const fetchService = async (url: string, options?: RequestInit): Promise<{
  ok: boolean,
  status: number,
  text: () => Promise<string>,
  json: () => Promise<unknown>,
  headers: unknown
}> => {
  if (IS_NATIVE) {
    console.debug('Using CapacitorHttp for request:', url)
    try {
      const httpOptions: HttpOptions = {
        method: options?.method || 'GET',
        url: url,
        data: options?.body,
      }
      if (options?.headers) {
        httpOptions.headers = options.headers as { [key: string]: string }
      }
      const response: HttpResponse = await CapacitorHttp.request(httpOptions)

      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        text: async () => typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
        json: async () => typeof response.data === 'string' ? JSON.parse(response.data) : response.data,
        headers: response.headers,
      }
    } catch (error) {
      console.error('CapacitorHttp request failed', error)
      throw error
    }
  } else {
    const response = await fetch(url, options)
    return {
      ok: response.ok,
      status: response.status,
      text: response.text.bind(response),
      json: response.json.bind(response),
      headers: response.headers,
    }
  }
}

export interface HomeReport {
  id: number | null;
  data: GameReportData;
  metadata: GameMetadata;
  reactions: GameReportReactions;
  user: GitHubUser;
  reviewScore: string;
}

const REPORTS_CACHE_DURATION = 60 * 1000 // 1 minute in milliseconds
const LABELS_CACHE_DURATION = 3 * 60 * 1000 // 3 minutes in milliseconds

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
  }
}

let recentReportsCache: HomeReport[] = []
let recentReportsLastFetch: number | null = null
let recentReportsPromise: Promise<HomeReport[]> | null = null
export const fetchRecentReports = async (): Promise<HomeReport[]> => {
  const currentTime = Date.now()
  const url = apiUrl('/deck-verified/api/v1/recent_reports')

  if (recentReportsCache.length > 0 && recentReportsLastFetch && currentTime - recentReportsLastFetch < REPORTS_CACHE_DURATION) {
    console.debug('Serving recent reports from cache')
    return recentReportsCache
  }

  if (recentReportsPromise) {
    console.debug('Waiting for existing recent reports fetch to complete')
    return recentReportsPromise
  }

  recentReportsPromise = (async () => {
    try {
      console.debug('Fetching recent reports from backend')
      const response = await fetchService(url)
      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`Failed to fetch recent reports: ${response.status} - ${errorBody}`)
      }
      const data = await response.json() as GameReport[]
      recentReportsCache = data.map(buildHomeReport)
      recentReportsLastFetch = Date.now()
      return recentReportsCache
    } catch (error) {
      console.error('Error fetching or parsing recent reports:', error)
      return []
    } finally {
      recentReportsPromise = null
    }
  })()

  return recentReportsPromise
}

let popularReportsCache: HomeReport[] = []
let popularReportsLastFetch: number | null = null
let popularReportsPromise: Promise<HomeReport[]> | null = null
export const fetchPopularReports = async (): Promise<HomeReport[]> => {
  const currentTime = Date.now()
  const url = apiUrl('/deck-verified/api/v1/popular_reports')

  if (popularReportsCache.length > 0 && popularReportsLastFetch && currentTime - popularReportsLastFetch < REPORTS_CACHE_DURATION) {
    console.debug('Serving popular reports from cache')
    return popularReportsCache
  }

  if (popularReportsPromise) {
    console.debug('Waiting for existing popular reports fetch to complete')
    return popularReportsPromise
  }

  popularReportsPromise = (async () => {
    try {
      console.debug('Fetching popular reports from backend')
      const response = await fetchService(url)
      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`Failed to fetch popular reports: ${response.status} - ${errorBody}`)
      }
      const data = await response.json() as GameReport[]
      popularReportsCache = data.map(buildHomeReport)
      popularReportsLastFetch = Date.now()
      return popularReportsCache
    } catch (error) {
      console.error('Error fetching or parsing popular reports:', error)
      return []
    } finally {
      popularReportsPromise = null
    }
  })()

  return popularReportsPromise
}

export const fetchGameData = async (gameName: string | null, appId: string | null): Promise<GameDetails | null> => {
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
    const response = await fetchService(url)
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
      console.debug('Game data:', JSON.stringify(data))
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

let labelsCache: GitHubIssueLabel[] = []
let labelsLastFetchTime: number | null = null
let labelsPromise: Promise<GitHubIssueLabel[]> | null = null
export const fetchLabels = async (): Promise<GitHubIssueLabel[]> => {
  const currentTime = Date.now()

  if (labelsCache.length > 0 && labelsLastFetchTime && currentTime - labelsLastFetchTime < LABELS_CACHE_DURATION) {
    console.debug('Serving labels from cache')
    return labelsCache
  }

  if (labelsPromise) {
    console.debug('Waiting for existing fetch to complete')
    return labelsPromise
  }

  labelsPromise = (async () => {
    try {
      console.debug('Fetching labels from backend')
      const response = await fetchService(apiUrl('/deck-verified/api/v1/issue_labels'))
      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`Failed to fetch labels: ${response.status} - ${errorBody}`)
      }
      const data = await response.json() as GitHubIssueLabel[]
      labelsCache = data
      labelsLastFetchTime = currentTime
      return labelsCache
    } catch (error) {
      console.error('Error fetching labels:', error)
      return []
    } finally {
      labelsPromise = null
    }
  })()

  return labelsPromise
}

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
