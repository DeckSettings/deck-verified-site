const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args))
const logfmt = require('logfmt')
const { storeGameInRedis, parseGameProjectBody, parseReportBody } = require('./helpers')

// Configure default GitHub auth token
const defaultGithubAuthToken = process.env.GH_TOKEN || null

const fetchReports = async (
  repoOwner = 'DeckSettings',
  repoName = 'deck-settings-db',
  state = 'open',
  sort = 'updated',
  direction = 'desc',
  limit = null
) => {
  let encodedSort = encodeURIComponent(sort)
  let url = `https://api.github.com/search/issues?q=repo:${repoOwner}/${repoName}+state:${state}+is:issue&sort=${encodedSort}&order=${direction}`
  if (limit !== null) {
    url += `&per_page=${limit}`
  }
  const response = await fetch(url)
  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`GitHub API request failed with status ${response.status}: ${errorBody}`)
    return []
  }
  return await response.json()
}

const updateGameIndex = async () => {
  try {
    // Configure API auth token
    let authToken = null
    if (defaultGithubAuthToken) {
      authToken = defaultGithubAuthToken
    }

    const projects = await fetchProject('', authToken)
    if (projects) {
      for (const project of projects) {
        console.log(`Storing project ${project.gameName} with appId ${project.appId} in RedisSearch`)
        try {
          await storeGameInRedis(project.gameName, project.appId, project.metadata.poster)
        } catch (error) {
          console.error('Error storing game in Redis:', error)
        }
      }
    }
  } catch (error) {
    console.error('Error updating game index:', error)
  }
}

const fetchProject = async (searchTerm, authToken = null) => {
  // Use default API auth token if none provided
  if (!authToken && defaultGithubAuthToken) {
    authToken = defaultGithubAuthToken
  }

  //const orgNodeId = await getOrgId('DeckSettings', authToken)
  const orgNodeId = 'O_kgDOC35waw'
  const query = `
    query fetchOrgProjects($orgId: ID!, $cursor: String, $searchTerm: String!) {
      node(id: $orgId) {
        ... on Organization {
          projectsV2(first: 100, after: $cursor, query: $searchTerm) {
            nodes {
              id
              title
              number
              shortDescription
              readme
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
    let discoveredProjects = []
    let returnProjects = []

    while (hasNextPage) {
      const headers = {
        'Content-Type': 'application/json'
      }
      if (authToken) {
        headers['Authorization'] = `bearer ${authToken}`
      }

      const response = await fetch('https://api.github.com/graphql', {
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
      })

      if (!response.ok) {
        const errorBody = await response.text()
        console.error(`GitHub GraphQL API request failed with status ${response.status}: ${errorBody}`)
        return null
      }

      const responseData = await response.json()

      if (!responseData.data?.node || !responseData.data?.node.projectsV2) {
        console.log('No project data returned from org node.')
        return null // Return null to indicate no data
      }
      discoveredProjects = discoveredProjects.concat(responseData.data.node.projectsV2.nodes)

      for (const project of discoveredProjects) {
        const parsedTitle = logfmt.parse(project.title)

        const projectData = {
          gameName: parsedTitle.name ?? '',
          appId: parsedTitle.appid ? parseInt(parsedTitle.appid, 10) : null,
          projectNumber: project.number,
          shortDescription: project.shortDescription,
          readme: project.readme,
          metadata: {
            poster: '',
            hero: '',
            banner: ''
          },
          issues: []
        }

        // Parse Game data from project readme
        projectData.metadata = Object.fromEntries(
          Object.entries(await parseGameProjectBody(project.readme)).map(([key, value]) => [key.toLowerCase(), value])
        )

        // Parse issues list
        for (const node of project.items.nodes) {
          if (node.content.__typename === 'Issue' && node.content.body) {
            const parsedIssueData = await parseReportBody(node.content.body)
            projectData.issues.push({
              id: node.content.databaseId,
              title: node.content.title,
              html_url: node.content.url,
              body: node.content.body,
              reactions: {
                'reactions_thumbs_up': node.content.reactions_thumbs_up.totalCount,
                'reactions_thumbs_down': node.content.reactions_thumbs_down.totalCount
              },
              labels: node.content.labels.nodes,
              user: node.content.author,
              created_at: node.content.createdAt,
              updated_at: node.content.updatedAt,
              ...parsedIssueData
            })
          }
        }
        returnProjects.push(projectData)
      }

      hasNextPage = responseData.data.node.projectsV2.pageInfo.hasNextPage
      endCursor = responseData.data.node.projectsV2.pageInfo.endCursor
    }

    return returnProjects
  } catch (error) {
    console.error('Error fetching organization projects:', error)
    return null
  }
}

const fetchIssueLabels = async (authToken = null) => {
  // Use default API auth token if none provided
  if (!authToken && defaultGithubAuthToken) {
    authToken = defaultGithubAuthToken
  }

  console.log('Fetching labels from GitHub API')
  const headers = {
    'Content-Type': 'application/json'
  }
  if (authToken) {
    headers['Authorization'] = `bearer ${authToken}`
  }
  const response = await fetch('https://api.github.com/repos/DeckSettings/deck-settings-db/labels', {
    method: 'GET',
    headers: headers
  })
  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`GitHub API request failed with status ${response.status}: ${errorBody}`)
    throw new Error('Failed to fetch labels from GitHub API. Non-success response recieved from GitHub')
  }
  return await response.json()
}

const getOrgId = async (orgName, authToken) => {
  const query = `
    query GetOrganizationId($orgLogin: String!) {
      organization(login: $orgLogin) {
        id
      }
    }
  `

  try {
    const headers = {
      'Content-Type': 'application/json'
    }
    if (authToken) {
      headers['Authorization'] = `bearer ${authToken}`
    }

    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        query: query,
        variables: {
          orgLogin: orgName
        }
      })
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`GitHub GraphQL API request failed with status ${response.status}: ${errorBody}`)
      throw new Error('Failed to fetch organization ID')
    }

    const responseData = await response.json()
    return responseData.data.organization.id
  } catch (error) {
    console.error('Error fetching organization ID:', error)
    throw error
  }
}

module.exports = { fetchReports, fetchProject, updateGameIndex, fetchIssueLabels, getOrgId }
