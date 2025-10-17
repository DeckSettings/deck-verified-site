import { updateGameIndex as updateGameIndexLogic } from '../../external/github'
import { fetchRepoIssueLabels } from '../../external/decksettings/repo_issue_labels'
import { fetchReportBodySchema } from '../../external/decksettings/report_body_schema'
import { fetchGameReportTemplate } from '../../external/decksettings/game_report_template'
import { fetchHardwareInfo } from '../../external/decksettings/hw_info'
import { fetchPopularReports, fetchRecentReports } from '../../external/decksettings/reports'
import logger from '../../logger'

/**
 * BullMQ job processor for the scheduled GitHub data update.
 */
export async function run(): Promise<void> {
  logger.info('Running scheduled job: updateGitHubData')
  try {
    await updateGameIndexLogic()
    await Promise.all([
      fetchRepoIssueLabels(null, true),
      fetchReportBodySchema(true),
      fetchGameReportTemplate(true),
      fetchHardwareInfo(true),
      fetchRecentReports(20, 'created', true),
      fetchRecentReports(5, 'created', true),
      fetchPopularReports(20, true),
      fetchPopularReports(5, true),
    ])
    logger.info('Finished scheduled job: updateGitHubData')
  } catch (error) {
    logger.error('Scheduled job updateGitHubData failed', error)
    // Re-throw the error to let BullMQ know the job has failed
    throw error
  }
}
