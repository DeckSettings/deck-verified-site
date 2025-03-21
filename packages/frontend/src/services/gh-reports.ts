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
  GameDetailsRequestMetricResult
} from '../../../shared/src/game'

export interface Report {
  id: number;
  data: GameReportData;
  metadata: GameMetadata;
  reactions: GameReportReactions;
  user: GitHubUser;
  reviewScore: string;
}

export const fetchRecentReports = async (): Promise<Report[]> => {
  const url = '/deck-verified/api/v1/recent_reports'
  try {
    const response = await fetch(url)
    const data = await response.json() as GameReport[]
    return data.map((report) => {
      const reactionDiff = (report.reactions.reactions_thumbs_up || 0) - (report.reactions.reactions_thumbs_down || 0)
      const reviewScore = reactionDiff > 0 ? 'positive' : reactionDiff < 0 ? 'negative' : 'neutral'
      return {
        id: report.id,
        data: report.data,
        metadata: report.metadata,
        reactions: report.reactions,
        user: report.user,
        reviewScore
      }
    })
  } catch (error) {
    console.error('Error fetching or parsing data:', error)
    return []
  }
}

export const fetchPopularReports = async (): Promise<Report[]> => {
  const url = '/deck-verified/api/v1/popular_reports'
  try {
    const response = await fetch(url)
    const data = await response.json() as GameReport[]
    return data.map((report) => {
      const reactionDiff = (report.reactions.reactions_thumbs_up || 0) - (report.reactions.reactions_thumbs_down || 0)
      const reviewScore = reactionDiff > 0 ? 'positive' : reactionDiff < 0 ? 'negative' : 'neutral'
      return {
        id: report.id,
        data: report.data,
        metadata: report.metadata,
        reactions: report.reactions,
        user: report.user,
        reviewScore
      }
    })
  } catch (error) {
    console.error('Error fetching or parsing data:', error)
    return []
  }
}

export const fetchGameData = async (gameName: string | null, appId: string | null): Promise<GameDetails | null> => {
  let url = '/deck-verified/api/v1/game_details'
  if (appId) {
    url += `?appid=${appId}&include_external=true`
  } else if (gameName) {
    url += `?name=${encodeURIComponent(gameName)}`
  } else {
    throw new Error('Either appId or gameName must be provided')
  }

  try {
    const response = await fetch(url)
    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`Failed to fetch project data: ${response.status} - ${errorBody}`)
      throw new Error('Failed to fetch project data')
    }
    const data = await response.json() as GameDetails
    if (data) {
      console.debug('Game data:', data)
      return data
    } else {
      console.error('Unable to find game data by AppID/Game Name')
      return null
    }
  } catch (error) {
    console.error('Error fetching project data:', error)
    throw error
  }
}

export const fetchGamesWithReports = async (from: number, limit: number): Promise<GameSearchResult[] | null> => {
  const url = `/deck-verified/api/v1/games_with_reports?from=${from}&limit=${limit}&orderBy=appname&orderDirection=ASC`
  try {
    const response = await fetch(url)
    if (response.status === 204) {
      // 204 - No Content
      console.log('No results found')
      return []
    } else if (!response.ok) {
      const errorBody = await response.text()
      console.error(`Failed to fetch any results data: ${response.status} - ${errorBody}`)
      throw new Error('Failed to fetch project data')
    }
    return await response.json() as GameSearchResult[]
  } catch (error) {
    console.error('Error fetching project data:', error)
    throw error
  }
}

export const searchGames = async (searchString: string | null, includeExternal: boolean = false): Promise<GameSearchResult[] | null> => {
  let url = '/deck-verified/api/v1/search_games'
  if (searchString) {
    url += `?term=${encodeURIComponent(searchString)}`
  } else {
    throw new Error('No search string provided')
  }
  if (includeExternal) {
    url += '&include_external=true'
  }

  try {
    const response = await fetch(url)
    if (response.status === 204) {
      // 204 - No Content
      console.log('No results found')
      return []
    } else if (!response.ok) {
      const errorBody = await response.text()
      console.error(`Failed to fetch any results data: ${response.status} - ${errorBody}`)
      throw new Error('Failed to fetch project data')
    }
    return await response.json() as GameSearchResult[]
  } catch (error) {
    console.error('Error fetching project data:', error)
    throw error
  }
}

export const gameReportTemplate = async (): Promise<GameReportForm | null> => {
  try {
    const response = await fetch('/deck-verified/api/v1/report_form')
    if (response.status === 204) {
      // 204 - No Content
      console.log('No results found')
      return null
    } else if (!response.ok) {
      const errorBody = await response.text()
      console.error(`Failed to fetch any results data: ${response.status} - ${errorBody}`)
      throw new Error('Failed to fetch project data')
    }
    return await response.json() as GameReportForm
  } catch (error) {
    console.error('Error fetching project data:', error)
    throw error
  }
}

let labels: GitHubIssueLabel[] = []
let lastFetchTime: number | null = null
export const fetchLabels = async (): Promise<GitHubIssueLabel[]> => {
  const currentTime = Date.now()
  const cacheDuration = 30 * 60 * 1000 // 30 minutes in milliseconds

  if (labels && lastFetchTime && currentTime - lastFetchTime < cacheDuration) {
    console.debug('Serving labels from cache')
    return labels
  }

  try {
    console.debug('Fetching labels from backend')
    const response = await fetch('/deck-verified/api/v1/issue_labels')
    const data = await response.json()
    labels = data
    lastFetchTime = currentTime
    return labels
  } catch (error) {
    console.error('Error fetching labels:', error)
    return []
  }
}

export const fetchTopGameDetailsRequestMetrics = async (days: number, min_report_count: number, max_report_count: number): Promise<GameDetailsRequestMetricResult[]> => {
  const url = `/deck-verified/api/v1/metric/game_details?days=${days}&min_report_count=${min_report_count}&max_report_count=${max_report_count}`
  try {
    const response = await fetch(url)
    if (response.status === 204) {
      // 204 - No Content
      console.log('No results found')
      return []
    } else if (!response.ok) {
      const errorBody = await response.text()
      console.error(`Failed to fetch any results data: ${response.status} - ${errorBody}`)
      throw new Error('Failed to fetch project data')
    }
    const data = await response.json()
    if (!data.results) {
      return []
    }
    return data.results as GameDetailsRequestMetricResult[]
  } catch (error) {
    console.error('Error fetching project data:', error)
    throw error
  }
}
