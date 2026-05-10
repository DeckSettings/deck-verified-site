import config from '../../config'
import logger from '../../logger'
import {
  redisCacheExtData,
  redisLookupExtData,
  searchGamesInRedis,
} from '../../redis'
import {
  generateImageLinksFromAppId,
  parseReportBody,
} from '../../helpers'
import { fetchReportBodySchema } from './report_body_schema'
import { fetchHardwareInfo } from './hw_info'
import { fetchReportsWithIssuesApi } from './reports'
import type {
  ContributorSummary,
  GameMetadata,
  GameReportData,
  GitHubReportIssueBodySchema,
  GitHubUser,
  HardwareInfo,
  HomepageContributorsResponse,
  HomepageRecentGame,
  UserGameReport,
  UserReportsPageResponse,
  GithubIssuesSearchResultItems,
} from '../../../../shared/src/game'

const HOMEPAGE_CACHE_TTL_SECONDS = 30 * 60

interface CommunityReportSnapshot {
  issueId: number
  issueNumber: number
  createdAt: string
  updatedAt: string
  likes: number
  deviceLabel: string
  parsedReport: GameReportData
  user: GitHubUser
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const buildContributorSummary = (login: string, avatar_url: string): ContributorSummary => ({
  login,
  avatar_url,
  report_count: 0,
  games_covered: 0,
  devices_covered: 0,
  likes_received: 0,
  first_report_at: null,
  last_report_at: null,
})

const DEVICE_MANUFACTURERS = ['Valve', 'ASUS', 'Lenovo', 'MSI', 'AYANEO', 'GPD']

const stripManufacturerPrefixOnce = (value: string): string => {
  const trimmed = value.trim().toLowerCase()
  for (const manufacturer of DEVICE_MANUFACTURERS) {
    const prefix = `${manufacturer.toLowerCase()} `
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim()
    }
  }
  return trimmed
}

const matchesReportedDevice = (candidate: string, reportedDevice: string): boolean => {
  const candidateLower = candidate.trim().toLowerCase()
  if (!candidateLower) return false
  if (candidateLower === reportedDevice) return true
  if (stripManufacturerPrefixOnce(candidateLower) === reportedDevice) return true
  return false
}

const resolveCanonicalDeviceLabel = (reportedDevice: string | null | undefined, hardwareInfo: HardwareInfo[]): string => {
  const safeReportedDevice = typeof reportedDevice === 'string' ? reportedDevice.trim() : ''
  if (!safeReportedDevice) {
    return ''
  }

  const reportedDeviceLower = safeReportedDevice.toLowerCase()
  const matchedDevice = hardwareInfo.find((device) => {
    if (matchesReportedDevice(device.name || '', reportedDeviceLower)) return true
    if (Array.isArray(device.aliases)) {
      return device.aliases.some((alias) => matchesReportedDevice(alias, reportedDeviceLower))
    }
    return false
  })

  return matchedDevice?.name?.trim() || safeReportedDevice
}

const toReportGameKey = (report: Pick<GameReportData, 'app_id' | 'game_name'>): string => {
  if (typeof report.app_id === 'number' && Number.isFinite(report.app_id)) {
    return `app:${report.app_id}`
  }
  return `name:${report.game_name.trim().toLowerCase()}`
}

const toPublicUserFallback = (login: string): GitHubUser => ({
  login,
  avatar_url: '',
})

const shouldKeepParsedReport = (parsedReport: GameReportData): boolean =>
  isNonEmptyString(parsedReport.game_name) && isNonEmptyString(parsedReport.summary) && isNonEmptyString(parsedReport.device)

const hasMissingMetadata = (m: Partial<GameMetadata>): boolean =>
  m.banner == null ||
  m.poster == null ||
  m.hero == null ||
  m.background == null

const resolveMetadataForParsedReport = async (parsedReport: GameReportData): Promise<GameMetadata> => {
  let metadata: Partial<GameMetadata> = {
    banner: null,
    poster: null,
    hero: null,
    background: null,
  }

  if (parsedReport.game_name) {
    const games = await searchGamesInRedis(null, null, parsedReport.game_name)
    if (games.length > 0) {
      const redisResult = games[0]
      metadata = {
        banner: metadata.banner ?? redisResult.banner,
        poster: metadata.poster ?? redisResult.poster,
        hero: metadata.hero,
        background: metadata.background,
      }
    }
  }

  if (parsedReport.app_id) {
    if (hasMissingMetadata(metadata)) {
      const games = await searchGamesInRedis(null, parsedReport.app_id.toString(), null)
      if (games.length > 0) {
        const redisResult = games[0]
        metadata = {
          banner: metadata.banner ?? redisResult.banner,
          poster: metadata.poster ?? redisResult.poster,
          hero: metadata.hero,
          background: metadata.background,
        }
      }
    }

    if (hasMissingMetadata(metadata)) {
      const fallbackImages = await generateImageLinksFromAppId(String(parsedReport.app_id))
      metadata = {
        banner: metadata.banner ?? fallbackImages.banner,
        poster: metadata.poster ?? fallbackImages.poster,
        hero: metadata.hero ?? fallbackImages.hero,
        background: metadata.background ?? fallbackImages.background,
      }
    }
  }

  return metadata as GameMetadata
}

const buildContributorSummaryFromReports = (
  reports: UserGameReport[],
  fallbackLogin: string,
  hardwareInfo: HardwareInfo[],
): ContributorSummary => {
  const user = reports[0]?.issue?.user ?? toPublicUserFallback(fallbackLogin)
  const summary = buildContributorSummary(user.login, user.avatar_url)
  const uniqueGames = new Set<string>()
  const uniqueDevices = new Set<string>()

  reports.forEach((report) => {
    summary.report_count += 1
    summary.likes_received += report.issue?.reactions?.['+1'] || 0
    uniqueGames.add(toReportGameKey(report.parsedReport))
    uniqueDevices.add(resolveCanonicalDeviceLabel(report.parsedReport.device, hardwareInfo))

    const createdAt = report.issue?.created_at ?? null
    if (createdAt && (!summary.first_report_at || createdAt < summary.first_report_at)) {
      summary.first_report_at = createdAt
    }
    if (createdAt && (!summary.last_report_at || createdAt > summary.last_report_at)) {
      summary.last_report_at = createdAt
    }
  })

  summary.games_covered = uniqueGames.size
  summary.devices_covered = uniqueDevices.size
  return summary
}

const parseIssueReportsWithDependencies = async (
  issues: GithubIssuesSearchResultItems[],
  schema: GitHubReportIssueBodySchema,
  hardwareInfo: HardwareInfo[],
): Promise<UserGameReport[]> => {
  const reports = await Promise.all(
    issues.map(async (issue): Promise<UserGameReport | null> => {
      try {
        const parsedReport = await parseReportBody(issue.body, schema, hardwareInfo)
        if (!shouldKeepParsedReport(parsedReport)) {
          return null
        }

        const metadata = await resolveMetadataForParsedReport(parsedReport)
        return {
          issue,
          parsedReport,
          issueNumber: issue.number,
          issueId: issue.id,
          metadata,
        }
      } catch (error) {
        logger.error(`Failed to parse user report issue #${issue.number}`, error)
        return null
      }
    }),
  )

  return reports.filter((report): report is UserGameReport => report !== null)
}

const parseIssueReports = async (issues: GithubIssuesSearchResultItems[]): Promise<UserGameReport[]> => {
  const [schema, hardwareInfo] = await Promise.all([
    fetchReportBodySchema(),
    fetchHardwareInfo(),
  ])

  return parseIssueReportsWithDependencies(issues, schema, hardwareInfo)
}

const buildHomepageContributorSummary = (
  snapshots: CommunityReportSnapshot[],
  login: string,
): ContributorSummary => {
  const first = snapshots[0]
  const summary = buildContributorSummary(login, first?.user.avatar_url || '')
  const uniqueGames = new Set<string>()
  const uniqueDevices = new Set<string>()

  snapshots.forEach((snapshot) => {
    summary.report_count += 1
    summary.likes_received += snapshot.likes
    uniqueGames.add(toReportGameKey(snapshot.parsedReport))
    uniqueDevices.add(snapshot.deviceLabel)

    if (!summary.first_report_at || snapshot.createdAt < summary.first_report_at) {
      summary.first_report_at = snapshot.createdAt
    }
    if (!summary.last_report_at || snapshot.createdAt > summary.last_report_at) {
      summary.last_report_at = snapshot.createdAt
    }
  })

  summary.games_covered = uniqueGames.size
  summary.devices_covered = uniqueDevices.size
  return summary
}

const sortTopContributors = (a: ContributorSummary, b: ContributorSummary): number => {
  if (b.report_count !== a.report_count) return b.report_count - a.report_count
  if (b.likes_received !== a.likes_received) return b.likes_received - a.likes_received
  if ((b.last_report_at || '') !== (a.last_report_at || '')) return (b.last_report_at || '').localeCompare(a.last_report_at || '')
  return a.login.localeCompare(b.login)
}

const sortNewContributors = (a: ContributorSummary, b: ContributorSummary): number => {
  if ((b.first_report_at || '') !== (a.first_report_at || '')) return (b.first_report_at || '').localeCompare(a.first_report_at || '')
  if (b.likes_received !== a.likes_received) return b.likes_received - a.likes_received
  if (b.report_count !== a.report_count) return b.report_count - a.report_count
  return a.login.localeCompare(b.login)
}

const fetchVisibleCommunityReportSnapshot = async (): Promise<CommunityReportSnapshot[]> => {
  const cacheKey = 'homepage:community_report_snapshot'
  try {
    const cached = await redisLookupExtData(cacheKey)
    if (cached) {
      return JSON.parse(cached) as CommunityReportSnapshot[]
    }
  } catch (error) {
    logger.error('Failed to load cached homepage community report snapshot', error)
  }

  const reports = await fetchReportsWithIssuesApi(
    undefined,
    'open',
    null,
    null,
    'created',
    'desc',
    null,
    true,
    ['community:duplicate-report'],
    config.defaultGithubAuthToken,
  )

  if (!reports?.items?.length) {
    await redisCacheExtData(JSON.stringify([]), cacheKey, HOMEPAGE_CACHE_TTL_SECONDS)
    return []
  }

  const [schema, hardwareInfo] = await Promise.all([
    fetchReportBodySchema(),
    fetchHardwareInfo(),
  ])

  const snapshots = await Promise.all(
    reports.items.map(async (issue): Promise<CommunityReportSnapshot | null> => {
      try {
        const parsedReport = await parseReportBody(issue.body, schema, hardwareInfo)
        if (!shouldKeepParsedReport(parsedReport)) {
          return null
        }

        return {
          issueId: issue.id,
          issueNumber: issue.number,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          likes: issue.reactions?.['+1'] || 0,
          deviceLabel: resolveCanonicalDeviceLabel(parsedReport.device, hardwareInfo),
          parsedReport,
          user: {
            login: issue.user.login,
            avatar_url: issue.user.avatar_url,
          },
        }
      } catch (error) {
        logger.error(`Failed to parse homepage report snapshot for issue #${issue.number}`, error)
        return null
      }
    }),
  )

  const filteredSnapshots = snapshots.filter((snapshot): snapshot is CommunityReportSnapshot => snapshot !== null)

  try {
    await redisCacheExtData(JSON.stringify(filteredSnapshots), cacheKey, HOMEPAGE_CACHE_TTL_SECONDS)
  } catch (error) {
    logger.error('Failed to cache homepage community report snapshot', error)
  }

  return filteredSnapshots
}

export const fetchUserReportsPageData = async (
  login: string,
  options: {
    accessToken?: string | null
    includeClosed?: boolean
    excludeInvalid?: boolean
    excludeLabels?: string[] | null
  } = {},
): Promise<UserReportsPageResponse> => {
  const {
    accessToken = config.defaultGithubAuthToken,
    includeClosed = false,
    excludeInvalid = true,
    excludeLabels = ['community:duplicate-report'],
  } = options

  const reports = await fetchReportsWithIssuesApi(
    undefined,
    includeClosed ? null : 'open',
    login,
    null,
    'updated',
    'desc',
    null,
    excludeInvalid,
    excludeLabels,
    accessToken,
  )

  const [schema, hardwareInfo] = reports?.items?.length
    ? await Promise.all([fetchReportBodySchema(), fetchHardwareInfo()])
    : [null, [] as HardwareInfo[]]

  const parsedReports = reports?.items?.length && schema
    ? await parseIssueReportsWithDependencies(reports.items, schema, hardwareInfo)
    : []
  const stats = buildContributorSummaryFromReports(parsedReports, login, hardwareInfo)
  const user = parsedReports[0]?.issue?.user ?? toPublicUserFallback(login)

  return {
    user,
    stats,
    reports: parsedReports,
  }
}

export const fetchHomepageContributors = async (
  topLimit: number,
  newLimit: number,
): Promise<HomepageContributorsResponse> => {
  const cacheKey = `homepage:contributors:${topLimit}:${newLimit}`
  try {
    const cached = await redisLookupExtData(cacheKey)
    if (cached) {
      return JSON.parse(cached) as HomepageContributorsResponse
    }
  } catch (error) {
    logger.error('Failed to load cached homepage contributors', error)
  }

  const snapshots = await fetchVisibleCommunityReportSnapshot()
  const byLogin = new Map<string, CommunityReportSnapshot[]>()

  snapshots.forEach((snapshot) => {
    const existing = byLogin.get(snapshot.user.login) ?? []
    existing.push(snapshot)
    byLogin.set(snapshot.user.login, existing)
  })

  const contributors = Array.from(byLogin.entries()).map(([login, records]) =>
    buildHomepageContributorSummary(records, login),
  )

  const topContributors = contributors
    .slice()
    .sort(sortTopContributors)
    .slice(0, topLimit)

  const newContributors = contributors
    .slice()
    .sort(sortNewContributors)
    .slice(0, newLimit)

  const result: HomepageContributorsResponse = {
    topContributors,
    newContributors,
  }

  try {
    await redisCacheExtData(JSON.stringify(result), cacheKey, HOMEPAGE_CACHE_TTL_SECONDS)
  } catch (error) {
    logger.error('Failed to cache homepage contributors', error)
  }

  return result
}

export const fetchHomepageRecentGames = async (limit: number = 6): Promise<HomepageRecentGame[]> => {
  const cacheKey = `homepage:recent_games:${limit}`
  try {
    const cached = await redisLookupExtData(cacheKey)
    if (cached) {
      return JSON.parse(cached) as HomepageRecentGame[]
    }
  } catch (error) {
    logger.error('Failed to load cached homepage recent games', error)
  }

  const snapshots = await fetchVisibleCommunityReportSnapshot()
  const grouped = new Map<string, CommunityReportSnapshot[]>()

  snapshots.forEach((snapshot) => {
    const key = toReportGameKey(snapshot.parsedReport)
    const existing = grouped.get(key) ?? []
    existing.push(snapshot)
    grouped.set(key, existing)
  })

  const recentGames = await Promise.all(
    Array.from(grouped.values()).map(async (records): Promise<HomepageRecentGame | null> => {
      const sorted = records.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const first = sorted[0]
      const latest = sorted[sorted.length - 1]

      if (!first) {
        return null
      }

      const metadata = await resolveMetadataForParsedReport(latest.parsedReport)
      return {
        gameName: latest.parsedReport.game_name,
        appId: latest.parsedReport.app_id ?? null,
        metadata,
        reportCount: records.length,
        likes: records.reduce((sum, record) => sum + record.likes, 0),
        devices: Array.from(new Set(records.map((record) => record.deviceLabel))),
        firstReportAt: first.createdAt,
        latestReportAt: latest.createdAt,
      }
    }),
  )

  const result = recentGames
    .filter((game): game is HomepageRecentGame => game !== null)
    .sort((a, b) => b.firstReportAt.localeCompare(a.firstReportAt))
    .slice(0, limit)

  try {
    await redisCacheExtData(JSON.stringify(result), cacheKey, HOMEPAGE_CACHE_TTL_SECONDS)
  } catch (error) {
    logger.error('Failed to cache homepage recent games', error)
  }

  return result
}
