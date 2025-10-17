import { fetchRepoIssueLabels } from '../../external/decksettings/repo_issue_labels'
import { fetchReportBodySchema } from '../../external/decksettings/report_body_schema'
import { fetchGameReportTemplate } from '../../external/decksettings/game_report_template'
import { fetchHardwareInfo } from '../../external/decksettings/hw_info'
import { fetchPopularReports, fetchRecentReports } from '../../external/decksettings/reports'
import { updateGameIndex } from '../../external/decksettings/projects'
import logger from '../../logger'
import config from '../../config'

/**
 * BullMQ job processor for the scheduled GitHub data update.
 */
export async function run(): Promise<void> {
  logger.info('Running scheduled job: updateGitHubData')
  try {
    const authToken = config.defaultGithubAuthToken

    // First, fetch all the supporting data from the repo. This is used in the following lot of function calls
    await fetchReportBodySchema(authToken, true)
    await fetchHardwareInfo(authToken, true)
    await fetchGameReportTemplate(authToken, true)
    await fetchRepoIssueLabels(authToken, true)

    // Next, get an update on all the recent reports
    // NOTE: These fetch***Reports functions call parseGameReport which need cached fetchReportBodySchema and fetchHardwareInfo
    await Promise.all([
      fetchRecentReports(20, 'created', authToken, true),
      fetchRecentReports(5, 'created', authToken, true),
      fetchPopularReports(20, authToken, true),
      fetchPopularReports(5, authToken, true),
    ])

    // Finally, update all games with reports from GitHub
    await updateGameIndex(authToken)
    logger.info('Finished scheduled job: updateGitHubData')
  } catch (error) {
    logger.error('Scheduled job updateGitHubData failed', error)
    // Re-throw the error to let BullMQ know the job has failed
    throw error
  }
}
