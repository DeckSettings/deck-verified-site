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
import { apiUrl, fetchService } from 'src/utils/api'

export interface HomeReport {
  id: number | null;
  data: GameReportData;
  metadata: GameMetadata;
  reactions: GameReportReactions;
  user: GitHubUser;
  reviewScore: string;
}


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

export const fetchRecentReports = async (count: number = 5): Promise<HomeReport[]> => {
  const url = apiUrl(`/deck-verified/api/v1/recent_reports?count=${count}`)

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
