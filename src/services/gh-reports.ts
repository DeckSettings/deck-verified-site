import { parse } from 'logfmt'

export interface ReportData {
  summary: string;
  gameName: string;
  deckCompatibility: string;
  compatibilityTool: string;
  compatibilityToolVersion: string;
  device: string;
  targetFramerate: string;
  appid?: number;
  launcher: string;
  osVersion: string;
  undervoltApplied: string;
  customLaunchOptions: string;
  frameLimit: number;
  allowTearing: string;
  halfRateShading: string;
  tdpLimit: string;
  manualGpuClock: string;
  scalingMode: string;
  scalingFilter: string;
  gameDisplaySettings: string;
  gameGraphicsSettings: string;
  additionalNotes: string;
}

export interface Report {
  id: number;
  data: ReportData;
  reviewScore: string;
}

export interface ReportReactions {
  'reactions_thumbs_up': number;
  'reactions_thumbs_down': number;
  '+1': number;
  '-1': number;
}

export interface ReportLabel {
  name: string;
  color: string;
  description: string;
}

export interface ReportUser {
  login: string;
  avatar_url: string;
}

export interface GithubIssue {
  id: number;
  title: string;
  html_url: string;
  body: string;
  reactions: ReportReactions;
  labels: ReportLabel[];
  user: ReportUser;
  created_at: string;
  updated_at: string;
}

export interface GithubIssueLabel {
  id: number;
  node_id: string;
  url: string;
  name: string;
  color: string;
  default: boolean;
  description: string;
}

export interface GithubProject {
  id: string;
  title: string;
  url: string;
  items: {
    nodes: {
      content: {
        __typename: string;
        databaseId: number;
        title: string;
        url: string;
        body: string;
        labels: {
          nodes: ReportLabel[];
        };
        reactions_thumbs_up: {
          totalCount: number;
        };
        reactions_thumbs_down: {
          totalCount: number;
        };
        author: ReportUser;
        createdAt: string;
        updatedAt: string;
      }
    }[]
  }
}

export interface GithubProjectIssues {
  gameName: string;
  appId?: number;
  issues: GithubIssue[];
}

export interface GithubProjectData {
  gameName: string;
  appId?: number;
  projectNumber: number;
  shortDescription: string;
  readme: string;
  issues: GithubIssue[];
}

export interface GameSearchResult {
  name: string;
  appId: string;
}

export const extractHeadingValue = (lines: string[], heading: string): string | null => {
  const headingToFind = `### ${heading}`.toLowerCase()
  const headingIndex = lines.findIndex(line => line.trim().toLowerCase() === headingToFind)
  if (headingIndex === -1) return null

  const sectionLines = []
  for (let i = headingIndex + 1; i < lines.length; i++) {
    const currentLine = lines[i]?.trim()
    if (currentLine === undefined) {
      continue
    }
    if (currentLine.toLowerCase().startsWith('### ')) break
    sectionLines.push(currentLine)
  }

  const content = sectionLines.join('\n').trim()
  return content.length > 0 ? content : null
}

export const parseMarkdown = (markdown: string): ReportData => {
  const headersToFetch: {
    [key: string]: { field: keyof ReportData; type: 'string' | 'number' }
  } = {
    'Title': { field: 'summary', type: 'string' },
    'Game Name': { field: 'gameName', type: 'string' },
    'App ID': { field: 'appid', type: 'number' },
    'Launcher': { field: 'launcher', type: 'string' },
    'Device Compatibility': { field: 'deckCompatibility', type: 'string' },
    'Target Framerate': { field: 'targetFramerate', type: 'string' },
    'Device': { field: 'device', type: 'string' },
    'OS Version': { field: 'osVersion', type: 'string' },
    'Undervolt Applied': { field: 'undervoltApplied', type: 'string' },
    'Frame Limit': { field: 'frameLimit', type: 'number' },
    'Steam Play Compatibility Tool Used': { field: 'compatibilityTool', type: 'string' },
    'Compatibility Tool Version': { field: 'compatibilityToolVersion', type: 'string' },
    'Custom Launch Options': { field: 'customLaunchOptions', type: 'string' },
    'Allow Tearing': { field: 'allowTearing', type: 'string' },
    'Half Rate Shading': { field: 'halfRateShading', type: 'string' },
    'TDP Limit': { field: 'tdpLimit', type: 'string' },
    'Manual GPU Clock': { field: 'manualGpuClock', type: 'string' },
    'Scaling Mode': { field: 'scalingMode', type: 'string' },
    'Scaling Filter': { field: 'scalingFilter', type: 'string' },
    'Game Display Settings': { field: 'gameDisplaySettings', type: 'string' },
    'Game Graphics Settings': { field: 'gameGraphicsSettings', type: 'string' },
    'Additional Notes': { field: 'additionalNotes', type: 'string' }
  }

  const data: ReportData = {
    summary: '',
    gameName: '',
    deckCompatibility: '',
    compatibilityTool: '',
    compatibilityToolVersion: '',
    device: '',
    targetFramerate: '',
    launcher: '',
    osVersion: '',
    undervoltApplied: '',
    customLaunchOptions: '',
    frameLimit: 0,
    allowTearing: '',
    halfRateShading: '',
    tdpLimit: '',
    manualGpuClock: '',
    scalingMode: '',
    scalingFilter: '',
    gameDisplaySettings: '',
    gameGraphicsSettings: '',
    additionalNotes: ''
  }

  const normalizedMarkdown = markdown.replace(/\r\n/g, '\n')
  const lines: string[] = normalizedMarkdown.split('\n')

  for (const heading in headersToFetch) {
    const headerConfig = headersToFetch[heading]
    if (!headerConfig) continue

    const { field, type } = headerConfig
    let value = extractHeadingValue(lines, heading)
    if (value === null) {
      continue
    }
    // Remove any trailing newline from the final value
    value = value.trimEnd()
    if (value === '_No response_') {
      // Treat a field with _No response_ as if it were not even there
      continue
    }
    if (type === 'number') {
      const parsedValue = parseInt(value, 10)
      if (field === 'appid') {
        if (!isNaN(parsedValue)) {
          data.appid = parsedValue
        } else {
          delete data.appid
        }
      } else {
        (data as Record<keyof ReportData, string | number>)[field] = isNaN(parsedValue) ? 0 : parsedValue
      }
    } else {
      (data as Record<keyof ReportData, string | number>)[field] = value || ''
    }
  }

  return data
}

export const fetchRecentReports = async (): Promise<Report[]> => {
  const url = '/deck-verified/api/v1/recent_reports'
  try {
    const response = await fetch(url)
    const data = await response.json() as GithubIssue[]
    return data.map((issue: GithubIssue) => {
      const data = parseMarkdown(issue.body)
      let reactionDiff = 0
      if (issue.reactions['reactions_thumbs_up'] && issue.reactions['reactions_thumbs_up']) {
        reactionDiff = issue.reactions['reactions_thumbs_up'] - issue.reactions['reactions_thumbs_down']
      } else {
        reactionDiff = issue.reactions['+1'] - issue.reactions['-1']
      }
      const reviewScore = reactionDiff > 0 ? 'positive' : (reactionDiff < 0 ? 'negative' : 'neutral')
      return { id: issue.id, data, reactions: issue.reactions, reviewScore }
    })
  } catch (error) {
    console.error('Error fetching or parsing data:', error)
    return [] // Return an empty array in case of an error
  }
}

export const fetchPopularReports = async (): Promise<Report[]> => {
  const url = '/deck-verified/api/v1/popular_reports'
  try {
    const response = await fetch(url)
    const data = await response.json() as GithubIssue[]
    return data.map((issue: GithubIssue) => {
      const data = parseMarkdown(issue.body)
      let reactionDiff = 0
      if (issue.reactions['reactions_thumbs_up'] && issue.reactions['reactions_thumbs_up']) {
        reactionDiff = issue.reactions['reactions_thumbs_up'] - issue.reactions['reactions_thumbs_down']
      } else {
        reactionDiff = issue.reactions['+1'] - issue.reactions['-1']
      }
      const reviewScore = reactionDiff > 0 ? 'positive' : (reactionDiff < 0 ? 'negative' : 'neutral')
      return { id: issue.id, data, reactions: issue.reactions, reviewScore }
    })
  } catch (error) {
    console.error('Error fetching or parsing data:', error)
    return [] // Return an empty array in case of an error
  }
}

export const fetchIssuesByProjectSearch = async (gameName: string | null, appId: string | null): Promise<GithubProjectData | null> => {
  let url = '/deck-verified/api/v1/search_games_by_project'
  if (appId) {
    url += `?appid=${appId}`
  } else if (gameName) {
    url += `?game_name=${encodeURIComponent(gameName)}`
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
    const data = await response.json() as GithubProjectData[]
    const projectData = data.length > 0 ? data[0] : null
    if (projectData) {
      // Do something with projectData if it's not null
      console.debug('Project data:', projectData)
      return projectData
    } else {
      // Handle the case where no project data was found
      console.error('Unable to find game data by project')
      return null
    }
  } catch (error) {
    console.error('Error fetching project data:', error)
    throw error
  }
}

export const searchGames = async (searchString: string | null): Promise<GameSearchResult[] | null> => {
  let url = '/deck-verified/api/v1/search_games'
  if (searchString) {
    url += `?search=${encodeURIComponent(searchString)}`
  } else {
    throw new Error('No search string provided')
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
    const data = await response.json() as GameSearchResult[]
    const gameSearchResults: GameSearchResult[] = data.map(githubData => ({
      name: githubData.name,
      appId: githubData.appId
    }))
    return gameSearchResults
  } catch (error) {
    console.error('Error fetching project data:', error)
    throw error
  }
}

let labels: GithubIssueLabel[] = []
let lastFetchTime: number | null = null
export const fetchLabels = async (): Promise<GithubIssueLabel[]> => {
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

// TODO: Remove this... I think it is better to only use the backend with its cache
export const fetchIssuesByProjectSearchLocal = async (searchTerm: string, authToken: string | null): Promise<GithubProjectIssues> => {
  const orgNodeId = 'O_kgDOC35waw'
  const query = `
    query fetchOrgProjects($orgId: ID!, $cursor: String, $searchTerm: String!) {
      node(id: $orgId) {
        ... on Organization {
          projectsV2(first: 100, after: $cursor, query: $searchTerm) {
            nodes {
              id
              title
              url
              items(first: 100) {
                nodes {
                  content {
                    __typename
                    ... on Issue {
                      databaseId
                      title
                      url
                      body
                      labels(first: 5) {
                        nodes {
                          id
                          name
                          color
                          description
                        }
                      }
                      reactions_thumbs_up: reactions(content: THUMBS_UP) {
                        totalCount
                      }
                      reactions_thumbs_down: reactions(content: THUMBS_DOWN) {
                        totalCount
                      }
                      author {
                        login
                        avatar_url: avatarUrl
                      }
                      createdAt
                      updatedAt
                    }
                    ... on PullRequest {
                      id
                      title
                      url
                    }
                  }
                }
              }
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
        }
      }
    }
  `

  try {
    let hasNextPage = true
    let endCursor = null
    let projects: GithubProject[] = []
    const issues: GithubIssue[] = []
    const projectIssues: GithubProjectIssues = {} as GithubProjectIssues

    while (hasNextPage) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      if (authToken) {
        headers['Authorization'] = `bearer ${authToken}`
      }
      const response: {
        data: {
          node: { projectsV2: { nodes: GithubProject[], pageInfo: { endCursor: string, hasNextPage: boolean } } }
        }
      } = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          query: query,
          variables: {
            orgId: orgNodeId,
            cursor: endCursor,
            searchTerm: searchTerm
          }
        })
      }).then(res => res.json())

      if (!response.data?.node || !response.data?.node.projectsV2) { // Optional chaining for safety
        console.log('No project data returned from org node.')
        return projectIssues
      }

      //projects = projects.concat(response.data.node.projectsV2.nodes)
      projects = projects.concat(response.data.node.projectsV2.nodes.map(project => {
        project.items.nodes.forEach(node => {
          if (node.content.__typename === 'Issue' && node.content.body) {
            const parsedData = parseMarkdown(node.content.body)
            issues.push({
              id: node.content.databaseId,
              title: node.content.title,
              html_url: node.content.url,
              body: node.content.body,
              reactions: {
                'reactions_thumbs_up': node.content.reactions_thumbs_up.totalCount,
                '+1': node.content.reactions_thumbs_up.totalCount,
                'reactions_thumbs_down': node.content.reactions_thumbs_down.totalCount,
                '-1': node.content.reactions_thumbs_down.totalCount
              },
              labels: node.content.labels.nodes,
              user: node.content.author,
              created_at: node.content.createdAt,
              updated_at: node.content.updatedAt,
              ...parsedData
            })
          }
        })
        const parsedTitle = parse(project.title)
        projectIssues.gameName = decodeURIComponent(String(parsedTitle.name ?? ''))
        if (parsedTitle.appid && Number.isNaN(parsedTitle.appid)) {
          projectIssues.appId = Number(parsedTitle.appid)
        }
        return project
      }))

      hasNextPage = response.data.node.projectsV2.pageInfo.hasNextPage
      endCursor = response.data.node.projectsV2.pageInfo.endCursor
    }

    projectIssues.issues = issues

    return projectIssues
  } catch (error) {
    console.error('Error fetching organization projects:', error)
    throw error
  }
}

export const fetchReports = async (
  repoOwner: string = 'DeckSettings',
  repoName: string = 'deck-settings-db',
  state: string = 'open',
  sort: string = 'updated',
  direction: string = 'desc'
): Promise<Report[]> => {
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues?q=is:issue+is:${state}+-label:invalid:template-incomplete+sort:${sort}-${direction}`
  try {
    const response = await fetch(url)
    const data = await response.json() as GithubIssue[]
    return data.map((issue: GithubIssue) => {
      const data = parseMarkdown(issue.body)
      const reactionDiff = issue.reactions['reactions_thumbs_up'] - issue.reactions['reactions_thumbs_down']
      const reviewScore = reactionDiff > 0 ? 'positive' : (reactionDiff < 0 ? 'negative' : 'neutral')
      return { id: issue.id, data, reactions: issue.reactions, reviewScore }
    })
  } catch (error) {
    console.error('Error fetching or parsing data:', error)
    return [] // Return an empty array in case of an error
  }
}
