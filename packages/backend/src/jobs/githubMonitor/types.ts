export interface GithubMonitorJobData {
  taskId: string
  userId: string
  login: string
  issueNumber: number
  issueUrl: string
  createdAt: string
  repository?: {
    owner: string
    name: string
  }
  githubToken: string
  workflowType?: 'validation' | 'operations' | string
  operation?: string | null
}
