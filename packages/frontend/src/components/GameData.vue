<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { QAjaxBar } from 'quasar'
import {
  simGithub,
  simSteam,
  simProtondb,
  simPcgamingwiki,
  simReddit,
  simBluesky,
  simX,
  simFacebook,
} from 'quasar-extras-svg-icons/simple-icons-v14'
import sdhqLogo from 'src/assets/icons/sdhq.svg'
import { useGameStore } from 'src/stores/game-store'
import { useGameMarketStore } from 'src/stores/game-market-store'
import { useAuthStore } from 'src/stores/auth-store'
import { useConfigStore } from 'src/stores/config-store'
import { storeToRefs } from 'pinia'
import { getPCGamingWikiUrlFromGameName } from 'src/utils/external-links'
import type {
  GameReport,
  GameDetails,
  GitHubIssueLabel,
  GameReportData,
  ExternalGameReview,
  GameRatingsSummary,
  GamePriceSummary,
  SteamDeckCompatibilitySummary,
  GameReportUserReaction,
} from '../../../shared/src/game'
import DeviceImage from 'components/elements/DeviceImage.vue'
import { useQuasar } from 'quasar'
import { setReportReaction, submitCommunityFlagComment } from 'src/utils/gh-api'
import { BACKEND_API_ORIGIN } from 'src/utils/env'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import ReportForm from 'components/ReportForm.vue'
import { useMeta } from 'quasar'
import SecondaryButton from 'components/elements/SecondaryButton.vue'
import PrimaryButton from 'components/elements/PrimaryButton.vue'
import ProtonBadge from 'components/elements/ProtonBadge.vue'
import SteamCompatBadge from 'components/elements/SteamCompatBadge.vue'
import PriceBadge from 'components/elements/PriceBadge.vue'
import PageHeader from 'components/elements/PageHeader.vue'
import GameReportMarkdown from 'components/elements/GameReportMarkdown.vue'
import GameReportComparison from 'components/GameReportComparison.vue'
import LoginPromptDialog from 'components/LoginPromptDialog.vue'

dayjs.extend(relativeTime)

interface ExtendedGameReport extends Omit<GameReport, 'data'> {
  data: Partial<GameReportData>;
  reportVisible?: boolean;
  external?: boolean;
}

interface CommunityVerificationPresentation {
  label: string;
  icon: string;
  color: string;
  likes: number;
  tooltip: string;
}

interface AppreciationTierPresentation {
  key: 'gold' | 'silver' | 'bronze' | 'standard' | 'none';
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
  likes: number;
  tooltip: string;
  itemClass: string;
}

interface ReportStatusChip {
  key: string;
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
  tooltip: string;
  ariaLabel: string;
  avatarColor?: string;
  count?: number;
  kind: 'appreciation' | 'duplicate';
}

const isClient = typeof window !== 'undefined'
const route = useRoute()
const gameStore = useGameStore()
const marketStore = useGameMarketStore()
const authStore = useAuthStore()
const configStore = useConfigStore()
const { hideDuplicateReports, preferredDevices, country, currency } = storeToRefs(configStore)

const ajaxBar = ref<QAjaxBar | null>(null)

// Load Pinia store state
const isLoading = computed<boolean>(() => !gameStore.isLoaded)
const appId = computed<string | null>(() => gameStore.appId)
const gameName = computed<string>(() => gameStore.gameName)
const gameReportsSummary = computed<string | null>(() => gameStore.reportsSummary)
const gameData = computed<GameDetails | null>(() => gameStore.gameData)

const highestRatedGameReport = computed<Partial<GameReportData> | null>(() => {
  const gd = gameData.value
  if (!gd || !gd.reports || gd.reports.length === 0) return null
  const baseReports = hideDuplicateReports.value
    ? gd.reports.filter(report => !isDuplicateReport(report))
    : gd.reports.slice()
  if (baseReports.length === 0) return null
  const internalOnly = baseReports.slice().sort((a, b) => {
    const duplicatePriority = Number(isDuplicateReport(a)) - Number(isDuplicateReport(b))
    if (duplicatePriority !== 0) return duplicatePriority
    const scoreDelta = getReportReactionScore(b) - getReportReactionScore(a)
    if (scoreDelta !== 0) return scoreDelta
    const issuePriority = compareByCommunityIssues(a, b)
    if (issuePriority !== 0) return issuePriority
    return b.reactions['reactions_thumbs_up'] - a.reactions['reactions_thumbs_up']
  })
  return internalOnly[0]?.data ?? null
})
const gameBackground = computed<string | null>(() => gameStore.gameBackground)
const gameBanner = computed<string | null>(() => gameStore.gameBanner)
const githubProjectSearchLink = computed<string | null>(() => gameStore.githubProjectSearchLink)
const githubSubmitReportLink = computed<string>(() => gameStore.githubSubmitReportLink)
const githubListReportsLink = ref<string>('https://github.com/DeckSettings/game-reports-steamos/issues?q=is%3Aopen+is%3Aissue+-label%3Ainvalid%3Atemplate-incomplete')

const useLocalReportForm = ref<boolean>(true)
const reportFormDialogOpen = ref<boolean>(false)
const externalLinksDialogOpen = ref(false)
const dialogAutoOpened = ref(false)
const commentsDialogOpen = ref(false)
const reportIssueDialogOpen = ref(false)
const loginPromptDialogOpen = ref(false)
const commentsTargetReportId = ref<number | null>(null)

const $q = useQuasar()
const reportIssueSelectedOption = ref<string>('request-clarification')
const reportIssueMessage = ref<string>('')
const reportIssueDuplicateTarget = ref<number | null>(null)
const currentReportNumber = ref<number | null>(null)
const currentReportAuthor = ref<string | null>(null)
const reportIssueDuplicateOptions = ref<{ label: string; value: number }[]>([])
const reportIssueOptions = [
  {
    value: 'request-clarification',
    label: 'Need more details',
    description: 'This flag should be used to ask the author for additional details that clarify the report. For example: where the FPS was measured, which scene or run produced the minimum FPS, or what exact steps were used to collect the metric.',
  },
  {
    value: 'suggest-config-review',
    label: 'Suggest re-checking configuration details',
    description: 'This flag should be used to suggest the author re-check configuration and environment settings. Use it when a game, driver, or OS update may have altered behavior, or when reported config values (TDP, frame limits, compatibility tool) look inconsistent and a re-test is recommended.',
  },
  {
    value: 'suggest-improvements',
    label: 'Request extra information or media',
    description: 'This flag should be used to request additional supporting information or media (screenshots, logs, video clips, power/battery measurements) that help others reproduce, validate, or troubleshoot the reported results.',
  },
  {
    value: 'suggest-spelling-check',
    label: 'Typos or grammar',
    description: 'This flag should be used to point out spelling, grammar, or formatting issues in headings, descriptions, or data fields so the report is clearer and easier for others to read.',
  },
  {
    value: 'suggest-verification',
    label: 'Recommend verification',
    description: 'This flag should be used to recommend the author double-check numeric values or conclusions when they appear inconsistent, improbable, or likely mistyped (for example: a reported 5 W that seems like it should be 15 W).',
  },
  {
    value: 'mark-duplicate',
    label: 'Mark report as a duplicate',
    description: 'This flag should be used only when the same author has submitted the same report more than with the same data. Select which of the author’s other reports this duplicates so they can merge or close the redundant submission. Reports flagged by the community as duplicates can be filtered out in the website and apps.',
  },
]

const reportIssueOptionsEffective = computed(() => {
  const author = currentReportAuthor.value
  if (!author) return reportIssueOptions
  const authorReportsCount = (gameData.value?.reports ?? []).filter(r => (r.user?.login ?? '') === author).length
  if (authorReportsCount <= 1) {
    return reportIssueOptions.filter(o => o.value !== 'mark-duplicate')
  }
  return reportIssueOptions
})

const reportIssueDescription = computed(() => {
  const selected = reportIssueSelectedOption.value
  const opt = reportIssueOptions.find(o => o.value === selected)
  return opt?.description ?? ''
})

const includeExternalReports = ref(route.query.include_external === 'true')
const sdhqLink = ref('')

const filterDialogOpen = ref(false)
const sortDialogOpen = ref(false)

const selectedDevice = ref('all')
const deviceLabels = computed<GitHubIssueLabel[]>(() => gameStore.deviceLabels)
const formatLabelName = (labelName: string) => labelName.split(':')[1]?.trim() || labelName
const deviceOptions = computed(() => {
  if (deviceLabels.value) {
    const options = deviceLabels.value
      .map(label => {
        return {
          label: formatLabelName(label.name),
          value: label.name,
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    return [{ label: 'All', value: 'all' }, ...options]
  }
  return [{ label: 'All', value: 'all' }]
})
const hasGlobalDeviceFilter = computed(() => preferredDevices.value.length > 0)
const activeDeviceFilters = computed(() =>
  hasGlobalDeviceFilter.value
    ? preferredDevices.value
    : selectedDevice.value !== 'all' && selectedDevice.value
      ? [selectedDevice.value]
      : [],
)
const preferredDeviceSummary = computed(() => preferredDevices.value.map(formatLabelName).join(', '))

const selectedLauncher = ref('all')
const launcherLabels = computed<GitHubIssueLabel[]>(() => gameStore.launcherLabels)
const launcherOptions = computed(() => {
  if (launcherLabels.value) {
    let options = launcherLabels.value
      .map(label => {
        const parsedLabel = label.name.split(':')[1]?.trim() || label.name
        return {
          label: parsedLabel,
          value: label.name,
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))

    // Keep "Other" at the bottom
    const otherOption = options.find(opt => opt.label === 'Other')
    if (otherOption) options = options.filter(opt => opt !== otherOption)

    // Sort everything else and then re-add Other option
    options = options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    if (otherOption) options.push(otherOption)

    return [{ label: 'All', value: 'all' }, ...options]
  }
  return [{ label: 'All', value: 'all' }]
})

const sortOption = ref<'none' | 'reactions' | 'updated'>('none')
const sortOrder = ref<'off' | 'asc' | 'desc'>('off')
const toggleSortOrder = (option: 'reactions' | 'updated') => {
  if (sortOption.value !== option) {
    sortOption.value = option
    sortOrder.value = 'desc'
    return
  }
  sortOrder.value = sortOrder.value === 'off' ? 'desc' : sortOrder.value === 'desc' ? 'asc' : 'off'
}
const clearSort = () => {
  sortOption.value = 'none'
  sortOrder.value = 'off'
}
const hasActiveSort = computed(() => sortOrder.value !== 'off')

const hasSystemConfig = (report: ExtendedGameReport) => {
  return (
    report.data.undervolt_applied ||
    report.data.compatibility_tool_version ||
    report.data.game_resolution ||
    report.data.custom_launch_options
  )
}
const hasPerformanceSettings = (report: ExtendedGameReport) => {
  return (
    report.data.frame_limit ||
    report.data.disable_frame_limit ||
    report.data.enable_vrr ||
    report.data.allow_tearing ||
    report.data.half_rate_shading ||
    report.data.tdp_limit ||
    report.data.manual_gpu_clock ||
    report.data.scaling_mode ||
    report.data.scaling_filter
  )
}

const DUPLICATE_LABEL = 'community:duplicate-report'
const COMMUNITY_ISSUE_LABELS = new Set([
  'community:clarification-requested',
  'community:config-review-suggested',
  'community:improvements-suggested',
  'community:spelling-check-suggested',
  'community:verification-suggested',
])
type LabeledItem = { labels?: Array<{ name: string } | GitHubIssueLabel> }
const isDuplicateReport = (report: LabeledItem) => {
  return Array.isArray(report.labels) && report.labels.some(label => label?.name === DUPLICATE_LABEL)
}

const getCommunityIssueLabelCount = (report: LabeledItem) => (
  Array.isArray(report.labels)
    ? report.labels.filter(label => COMMUNITY_ISSUE_LABELS.has(label?.name ?? '')).length
    : 0
)

const getReportReactionScore = (report: Pick<GameReport, 'reactions'>) => (
  (report.reactions.reactions_thumbs_up || 0) - (report.reactions.reactions_thumbs_down || 0)
)

const compareByCommunityIssues = (a: LabeledItem, b: LabeledItem) => (
  getCommunityIssueLabelCount(a) - getCommunityIssueLabelCount(b)
)

const hasDuplicateReports = computed(() => {
  const gd = gameData.value
  if (!gd || !Array.isArray(gd.reports)) return false
  return gd.reports.some(report => isDuplicateReport(report))
})
const hasActiveFilters = computed(() =>
  activeDeviceFilters.value.length > 0 ||
  selectedLauncher.value !== 'all' ||
  (hideDuplicateReports.value && hasDuplicateReports.value),
)

watch(
  preferredDevices,
  (devices) => {
    if (devices.length > 0) {
      selectedDevice.value = 'all'
    }
  },
  { immediate: true, deep: true },
)

// Expanded state per-report id
const expanded = ref<Record<number, boolean>>({})
const lastExpandedReportId = ref<number | null>(null)

function isExpanded(id: number) {
  return !!expanded.value[id]
}

function getFirstExpandedReportId(excludedId?: number): number | null {
  const visibleExpanded = filteredReports.value.find((report) =>
    report.id !== excludedId && expanded.value[report.id],
  )
  if (visibleExpanded) return visibleExpanded.id

  for (const [rawId, isOpen] of Object.entries(expanded.value)) {
    const parsedId = Number(rawId)
    if (isOpen && parsedId !== excludedId) {
      return parsedId
    }
  }

  return null
}

function setExpanded(id: number, val: boolean) {
  expanded.value[id] = val
  if (val) {
    lastExpandedReportId.value = id
    scheduleVerificationPrompt(id)
    return
  }

  if (lastExpandedReportId.value === id) {
    lastExpandedReportId.value = getFirstExpandedReportId(id)
  }

  scheduleVerificationPrompt(lastExpandedReportId.value)
}

const priceSummary = ref<GamePriceSummary | null>(null)
const priceNew = computed(() => priceSummary.value?.bestDeal?.priceNew ?? null)
const priceOld = computed(() => priceSummary.value?.bestDeal?.priceOld ?? priceSummary.value?.deals?.[0]?.priceOld ?? null)
const priceCut = computed(() => priceSummary.value?.bestDeal?.priceCut ?? null)
const priceCurrency = computed(() => priceSummary.value?.bestDeal?.currency ?? null)
const ratingsSummary = ref<GameRatingsSummary | null>(null)
const protonTier = computed<string | null>(() => {
  const tier = ratingsSummary.value?.protonDb?.tier
  return tier ? String(tier).trim().toLowerCase() : null
})
const steamCompat = computed<SteamDeckCompatibilitySummary | null>(() => {
  const compat = ratingsSummary.value?.steamDeckCompatibility
  return compat ? compat : null
})
let isActive = false

const loadMarketData = async (id?: string | null) => {
  const currentId = id ?? appId.value
  if (!currentId) {
    priceSummary.value = null
    ratingsSummary.value = null
    return
  }

  try {
    const [priceResult, ratingsResult] = await Promise.all([
      marketStore.loadPriceSummary({ appId: currentId, currency: currency.value, country: country.value }),
      marketStore.loadRatingsSummary({ appId: currentId }),
    ])
    if (!isActive) return
    priceSummary.value = priceResult ?? null
    ratingsSummary.value = ratingsResult ?? null
  } catch (error) {
    if (!isActive) return
    priceSummary.value = null
    ratingsSummary.value = null
    console.warn('[GameData] Failed to load market data', error)
  }
}

const ensureClientGameData = async (forceReload: boolean = false) => {
  const routeAppId = route.params.appId as string
  const routeGameName = route.params.gameName as string

  let needsLoading = forceReload
  if (!gameData.value) {
    needsLoading = true
  } else if (routeAppId && gameStore.appId !== routeAppId) {
    needsLoading = true
  } else if (routeGameName && gameStore.gameName !== routeGameName) {
    needsLoading = true
  }

  if (needsLoading) {
    if (ajaxBar.value) {
      ajaxBar.value.start()
    }
    try {
      const githubToken = authStore && authStore.isLoggedIn && authStore.accessToken ? authStore.accessToken : null
      await gameStore.ensureLoaded(route, githubToken)
    } finally {
      if (ajaxBar.value) {
        ajaxBar.value.stop()
      }
    }
  }
}

watch(() => route.fullPath, () => {
  void ensureClientGameData()
})

watch(() => authStore.accessToken, async (newToken, oldToken) => {
  if (newToken === oldToken) return
  if (!route.path.startsWith('/app/') && !route.path.startsWith('/game/')) return
  await ensureClientGameData(true)
})

watch([appId, country, currency], async (values) => {
  const [newAppId] = values
  if (!newAppId) {
    priceSummary.value = null
    ratingsSummary.value = null
    return
  }
  await ensureClientGameData()
  await loadMarketData(newAppId)
}, { immediate: true })

const hasReports = computed(() => {
  const gd = gameData.value
  return !!(gd && Array.isArray(gd.reports) && gd.reports.length > 0)
})

const currentUserLogin = computed(() => authStore.user?.login ?? null)
const reactionLoadingByReport = ref<Record<number, boolean>>({})
const verificationPromptVisible = ref(false)
const verificationPromptDismissed = ref(false)
const verificationPromptTargetReportId = ref<number | null>(null)
let verificationPromptTimerId: number | null = null

const hasSubmittedOwnReport = computed(() => Boolean(
  currentUserLogin.value && (gameData.value?.reports ?? []).some((report) => report.user?.login === currentUserLogin.value),
))

const hasReactedToAnyReport = computed(() => Boolean(
  authStore.isLoggedIn &&
  (gameData.value?.reports ?? []).some((report) => report.current_user_reaction === 'up'),
))

const canPromptForVerification = computed(() => (
  hasReports.value &&
  (
    !authStore.isLoggedIn ||
    (
      !hasSubmittedOwnReport.value &&
      !hasReactedToAnyReport.value
    )
  )
))

const verificationPromptReport = computed<ExtendedGameReport | null>(() => {
  const targetReportId = verificationPromptTargetReportId.value ?? activeExpandedReportId.value
  if (targetReportId === null) return null
  return filteredReports.value.find((report) => report.id === targetReportId) ?? null
})

const activeExpandedReportId = computed<number | null>(() => {
  const lastExpanded = lastExpandedReportId.value
  if (lastExpanded !== null && expanded.value[lastExpanded]) {
    return lastExpanded
  }
  return getFirstExpandedReportId()
})

const compareReports = ref<ExtendedGameReport[]>([])
const comparisonDialogOpen = ref(false)
const hoveredCompareReportId = ref<number | null>(null)

const hasReportsToCompare = computed(() => compareReports.value.length > 0)

watch(appId, () => {
  compareReports.value = []
  comparisonDialogOpen.value = false
})

function isReportSelectedForCompare(reportId: number) {
  return compareReports.value.some(report => report.id === reportId)
}

function getCompareButtonIcon(reportId: number) {
  const isSelected = isReportSelectedForCompare(reportId)
  if (hoveredCompareReportId.value === reportId) {
    return isSelected ? 'remove_circle' : 'add'
  }
  return 'balance'
}

function addReportToCompare(report: ExtendedGameReport) {
  if (isReportSelectedForCompare(report.id)) {
    compareReports.value = compareReports.value.filter(item => item.id !== report.id)
    return
  }
  compareReports.value.push(report)
}

function openComparisonDialog() {
  if (!hasReportsToCompare.value) return
  comparisonDialogOpen.value = true
}

function clearCompareReports() {
  compareReports.value = []
  comparisonDialogOpen.value = false
}

/** SSR-stable, pure computed reports pipeline */
const filteredReports = computed<ExtendedGameReport[]>(() => {
  const gd = gameData.value
  if (!gd || !gd.reports) return []

  let reports: ExtendedGameReport[] = gd.reports.map((report) => ({
    ...report,
  }))

  // Filter by device selector or app-level preferred devices
  if (activeDeviceFilters.value.length > 0) {
    reports = reports.filter(report =>
      report.labels.some(label => activeDeviceFilters.value.includes(label.name)),
    )
  }

  // Filter by launcher selector
  if (selectedLauncher.value !== 'all' && selectedLauncher.value) {
    reports = reports.filter(report =>
      report.labels.some(label => label.name === selectedLauncher.value),
    )
  }

  // Append any external reports
  if (Array.isArray(gd.external_reviews)) {
    gd.external_reviews.forEach((review: ExternalGameReview) => {
      if (review.source.name === 'SDHQ') {
        // This only sets a ref; safe for SSR
        sdhqLink.value = review.html_url
      }
      if (includeExternalReports.value) {
        reports.push({
          id: review.id,
          number: 0,
          title: review.title,
          html_url: review.html_url,
          data: review.data as Partial<GameReportData>,
          user: {
            login: review.source.name,
            avatar_url: review.source.avatar_url,
            report_count: review.source.report_count || 0,
          },
          created_at: review.created_at,
          updated_at: review.updated_at,
          // Use metadata from parent game data
          metadata: {
            poster: gd.metadata.poster,
            hero: gd.metadata.hero,
            banner: gd.metadata.banner,
            background: gd.metadata.background,
          },
          reactions: { reactions_thumbs_up: 0, reactions_thumbs_down: 0 },
          comments: 0,
          labels: [],
          external: true,
        })
      }
    })
  }

  // Sort logic
  if (hideDuplicateReports.value) {
    reports = reports.filter(report => !isDuplicateReport(report))
  }

  if (sortOption.value === 'reactions') {
    reports = reports.slice().sort((a, b) => {
      const duplicatePriority = Number(isDuplicateReport(a)) - Number(isDuplicateReport(b))
      if (duplicatePriority !== 0) return duplicatePriority
      const scoreDelta = sortOrder.value === 'asc'
        ? getReportReactionScore(a) - getReportReactionScore(b)
        : getReportReactionScore(b) - getReportReactionScore(a)
      if (scoreDelta !== 0) return scoreDelta
      const issuePriority = compareByCommunityIssues(a, b)
      if (issuePriority !== 0) return issuePriority
      const likeTieBreak = sortOrder.value === 'asc'
        ? a.reactions['reactions_thumbs_up'] - b.reactions['reactions_thumbs_up']
        : b.reactions['reactions_thumbs_up'] - a.reactions['reactions_thumbs_up']
      if (likeTieBreak !== 0) return likeTieBreak
      return 0
    })
  } else if (sortOption.value === 'updated') {
    reports = reports.slice().sort((a, b) => {
      const duplicatePriority = Number(isDuplicateReport(a)) - Number(isDuplicateReport(b))
      if (duplicatePriority !== 0) return duplicatePriority
      const aUpdated = new Date(a.updated_at).getTime()
      const bUpdated = new Date(b.updated_at).getTime()
      const updatedDelta = sortOrder.value === 'asc' ? aUpdated - bUpdated : bUpdated - aUpdated
      if (updatedDelta !== 0) return updatedDelta
      return compareByCommunityIssues(a, b)
    })
  } else {
    reports = reports.slice().sort((a, b) =>
      Number(isDuplicateReport(a)) - Number(isDuplicateReport(b)) || compareByCommunityIssues(a, b),
    )
  }

  return reports
})

const lastUpdated = (dateString: string | null): string => {
  if (!dateString) return 'Unknown'
  const updatedAt = dayjs(dateString)
  return updatedAt.isValid() ? `${updatedAt.fromNow()}` : 'Unknown'
}

const getAppreciationTier = (report: ExtendedGameReport): AppreciationTierPresentation | null => {
  if (report.external) return null

  const likes = report.reactions.reactions_thumbs_up || 0
  if (likes <= 0) {
    return {
      key: 'none',
      label: 'Awaiting community feedback',
      shortLabel: 'Unrated',
      icon: 'chat_bubble_outline',
      color: 'blue-grey-4',
      likes,
      tooltip: 'This report has not received any likes yet. Read through it and leave a like if it helped.',
      itemClass: 'report-tier-none',
    }
  }

  if (likes >= 10) {
    return {
      key: 'gold',
      label: 'Gold report',
      shortLabel: 'Gold',
      icon: 'workspace_premium',
      color: 'amber-7',
      likes,
      tooltip: `${likes} players appreciated this report. It stands out as one of the most liked reports for this game.`,
      itemClass: 'report-tier-gold',
    }
  }

  if (likes >= 5) {
    return {
      key: 'silver',
      label: 'Silver report',
      shortLabel: 'Silver',
      icon: 'military_tech',
      color: 'blue-grey-3',
      likes,
      tooltip: `${likes} players appreciated this report. It has strong community support.`,
      itemClass: 'report-tier-silver',
    }
  }

  if (likes >= 2) {
    return {
      key: 'bronze',
      label: 'Bronze report',
      shortLabel: 'Bronze',
      icon: 'emoji_events',
      color: 'deep-orange-4',
      likes,
      tooltip: `${likes} players appreciated this report. It is building traction with the community.`,
      itemClass: 'report-tier-bronze',
    }
  }

  return {
    key: 'standard',
    label: 'Appreciated report',
    shortLabel: 'Liked',
    icon: 'thumb_up',
    color: 'light-green-5',
    likes,
    tooltip: `${likes} player appreciated this report. Leave a like if it helped you too.`,
    itemClass: 'report-tier-standard',
  }
}

const getReportStatusChips = (report: ExtendedGameReport): ReportStatusChip[] => {
  const chips: ReportStatusChip[] = []
  const appreciation = getAppreciationTier(report)

  if (appreciation) {
    chips.push({
      key: `appreciation-${appreciation.key}`,
      label: appreciation.label,
      shortLabel: appreciation.shortLabel,
      icon: appreciation.icon,
      color: appreciation.color,
      tooltip: appreciation.tooltip,
      ariaLabel: `${appreciation.label} indicator`,
      count: appreciation.likes > 0 ? appreciation.likes : undefined,
      kind: 'appreciation',
    })
  }

  if (isDuplicateReport(report)) {
    chips.push({
      key: 'duplicate',
      label: 'Duplicate',
      shortLabel: 'Duplicate',
      icon: 'backup_table',
      color: 'warning',
      avatarColor: 'warning',
      tooltip: 'This report is marked as a duplicate by the community.',
      ariaLabel: 'Duplicate community report indicator',
      kind: 'duplicate',
    })
  }

  return chips
}

const getReportStatusChipPositionClass = (chips: ReportStatusChip[], chipIndex: number) => {
  if (chips.length === 1) return 'report-corner-chip-single'
  if (chipIndex === 0) return 'report-corner-chip-left'
  if (chipIndex === chips.length - 1) return 'report-corner-chip-right'
  return 'report-corner-chip-middle'
}

const getReportStatusChipClasses = (chips: ReportStatusChip[], chip: ReportStatusChip, chipIndex: number) => ({
  [getReportStatusChipPositionClass(chips, chipIndex)]: true,
  'report-status-chip--appreciation': chip.kind === 'appreciation',
  'report-status-chip--duplicate': chip.kind === 'duplicate',
})

const getVerificationPresentation = (report: ExtendedGameReport): CommunityVerificationPresentation | null => {
  if (report.external) return null

  const likes = report.reactions.reactions_thumbs_up || 0
  if (likes <= 0) return null

  if (likes >= 10) {
    return {
      label: 'Community favourite',
      icon: 'workspace_premium',
      color: 'amber-7',
      likes,
      tooltip: `${likes} players appreciated this report for its detail and usefulness.`,
    }
  }

  if (likes >= 5) {
    return {
      label: 'Community verified',
      icon: 'verified',
      color: 'positive',
      likes,
      tooltip: `${likes} players appreciated this report and found it helpful.`,
    }
  }

  if (likes >= 2) {
    return {
      label: 'Gaining appreciation',
      icon: 'thumb_up',
      color: 'light-green-5',
      likes,
      tooltip: `${likes} players appreciated this report so far.`,
    }
  }

  return {
    label: 'Helpful report',
    icon: 'favorite_border',
    color: 'blue-grey-5',
    likes,
    tooltip: 'This report has started receiving appreciation from the community.',
  }
}

const hasUserReacted = (report: ExtendedGameReport, reaction: Exclude<GameReportUserReaction, null>): boolean =>
  authStore.isLoggedIn && report.current_user_reaction === reaction

const isReactionLoading = (reportId: number): boolean => Boolean(reactionLoadingByReport.value[reportId])

const applyLocalReactionUpdate = (
  reportId: number,
  nextReaction: GameReportUserReaction,
  nextCounts: { reactions_thumbs_up: number; reactions_thumbs_down: number },
) => {
  const currentGameData = gameStore.gameData
  const reports = currentGameData?.reports
  if (!currentGameData || !reports) return

  let didUpdate = false
  const nextReports = reports.map((candidate) => {
    if (candidate.id !== reportId) return candidate
    didUpdate = true
    return {
      ...candidate,
      current_user_reaction: nextReaction,
      reactions: {
        ...candidate.reactions,
        reactions_thumbs_up: nextCounts.reactions_thumbs_up,
        reactions_thumbs_down: nextCounts.reactions_thumbs_down,
      },
    }
  })

  if (!didUpdate) return

  gameStore.gameData = {
    ...currentGameData,
    reports: nextReports,
  }

  compareReports.value = compareReports.value.map((candidate) => (
    candidate.id !== reportId
      ? candidate
      : {
        ...candidate,
        current_user_reaction: nextReaction,
        reactions: {
          ...candidate.reactions,
          reactions_thumbs_up: nextCounts.reactions_thumbs_up,
          reactions_thumbs_down: nextCounts.reactions_thumbs_down,
        },
      }
  ))
}

const clearVerificationPromptTimer = () => {
  if (!isClient || verificationPromptTimerId === null) return
  window.clearTimeout(verificationPromptTimerId)
  verificationPromptTimerId = null
}

const dismissVerificationPrompt = () => {
  verificationPromptVisible.value = false
  verificationPromptDismissed.value = true
  verificationPromptTargetReportId.value = null
  clearVerificationPromptTimer()
}

const scheduleVerificationPrompt = (reportId: number | null = activeExpandedReportId.value) => {
  clearVerificationPromptTimer()
  verificationPromptVisible.value = false
  verificationPromptTargetReportId.value = null

  if (!isClient || verificationPromptDismissed.value || !canPromptForVerification.value || reportId === null) return

  verificationPromptTargetReportId.value = reportId

  verificationPromptTimerId = window.setTimeout(() => {
    if (
      canPromptForVerification.value &&
      !verificationPromptDismissed.value &&
      verificationPromptTargetReportId.value === reportId &&
      activeExpandedReportId.value === reportId &&
      expanded.value[reportId]
    ) {
      verificationPromptVisible.value = true
    }
  }, 10_000)
}

const handleVerificationPromptLike = async () => {
  const report = verificationPromptReport.value
  if (!report || report.external) return
  dismissVerificationPrompt()
  await handleReportReaction(report, 'up')
}

const handleVerificationPromptSubmit = () => {
  dismissVerificationPrompt()
  openDialog()
}

const handleReportReaction = async (
  report: ExtendedGameReport,
  reaction: 'up',
) => {
  if (report.external || !report.number) return

  if (!authStore.isLoggedIn) {
    loginPromptDialogOpen.value = true
    return
  }

  reactionLoadingByReport.value = {
    ...reactionLoadingByReport.value,
    [report.id]: true,
  }
  verificationPromptVisible.value = false

  try {
    const result = await setReportReaction(report.number, reaction, {
      appId: appId.value,
      gameName: gameName.value,
    })
    applyLocalReactionUpdate(report.id, result.currentUserReaction, result.reactions)

    if (result.currentUserReaction === null) {
      $q.notify({
        type: 'info',
        message: 'Like removed.',
      })
      return
    }

    $q.notify({
      type: 'positive',
      message: 'Thanks for highlighting this report for other players.',
    })
  } catch (error) {
    console.error('Failed to update report reaction', error)
    $q.notify({
      type: 'negative',
      message: 'Unable to record your feedback right now. Please try again.',
    })
  } finally {
    reactionLoadingByReport.value = {
      ...reactionLoadingByReport.value,
      [report.id]: false,
    }
    scheduleVerificationPrompt()
  }
}

const openDialog = () => {
  // Dialog can render in SSR markup as closed; opening is client-only UX
  reportFormDialogOpen.value = true
  if (isClient && 'history' in window) {
    history.pushState({ ...(history.state ?? {}), dialog: true }, '')
  }
}
const closeDialog = () => {
  reportFormDialogOpen.value = false
  if (isClient && history.state && history.state.dialog) {
    history.replaceState({ ...history.state, dialog: false }, '')
  }
}

const openCommentsDialog = (reportId?: number) => {
  // (PLACEHOLDER)
  // TODO: Opens a comments dialog where users can chat/comment about the report
  commentsTargetReportId.value = reportId ?? null
  commentsDialogOpen.value = true
  if (isClient && 'history' in window) history.pushState({ commentsDialog: true }, '')
}

const closeCommentsDialog = () => {
  commentsDialogOpen.value = false
  commentsTargetReportId.value = null
  if (isClient && history.state && history.state.commentsDialog) history.back()
}

const openReportIssueDialog = (report?: ExtendedGameReport | ExternalGameReview) => {
  if (!authStore.isLoggedIn) {
    loginPromptDialogOpen.value = true
    return
  }
  reportIssueDialogOpen.value = true
  reportIssueSelectedOption.value = 'request-clarification'
  reportIssueMessage.value = ''
  reportIssueDuplicateTarget.value = null

  const reportNumber = (report as unknown as { number?: number })?.number ?? null
  currentReportNumber.value = reportNumber
  const authorLogin = (report as unknown as { user?: { login?: string } })?.user?.login ?? null
  currentReportAuthor.value = authorLogin

  const allReports = gameData.value?.reports ?? []
  reportIssueDuplicateOptions.value = (allReports || [])
    .filter(r => authorLogin ? (r.user?.login === authorLogin && r.number !== reportNumber) : false)
    .map(r => ({ label: `[${r.user?.login}] Report #${r.number} — ${r.data?.summary}`, value: r.number }))

  if (isClient && 'history' in window) history.pushState({ reportIssueDialog: true }, '')
}
const closeReportIssueDialog = () => {
  reportIssueDialogOpen.value = false
  // Reset form state
  reportIssueSelectedOption.value = 'request-clarification'
  reportIssueMessage.value = ''
  reportIssueDuplicateTarget.value = null
  reportIssueDuplicateOptions.value = []
  currentReportNumber.value = null
  currentReportAuthor.value = null

  if (isClient && history.state && history.state.reportIssueDialog) {
    history.replaceState({ ...history.state, reportIssueDialog: false }, '')
  }
}

const refreshCurrentGameData = async () => {
  gameStore.resetGameState()
  await ensureClientGameData()
  if (appId.value) {
    await loadMarketData(appId.value)
  }
}

const submitReportIssue = async () => {
  try {
    if (!currentReportNumber.value) {
      $q.notify({ type: 'negative', message: 'No target report selected.' })
      return
    }

    const cmd = reportIssueSelectedOption.value
    let finalMessage = ''

    if (cmd === 'mark-duplicate') {
      finalMessage = `This looks like a duplicate of #${reportIssueDuplicateTarget.value}\nLet's keep the discussion there to avoid splitting feedback.`
    } else {
      finalMessage = reportIssueMessage.value || ''
    }

    await submitCommunityFlagComment(currentReportNumber.value, cmd, finalMessage)
    $q.notify({ type: 'positive', message: 'Report submitted.' })
    closeReportIssueDialog()
    await refreshCurrentGameData()
  } catch (err) {
    console.error('Failed to submit reportbot comment', err)
    $q.notify({ type: 'negative', message: 'Failed to submit report. Please try again.' })
  }
}

const shareOrigin = () => {
  if (!isClient) return BACKEND_API_ORIGIN
  return globalThis.isCapacitor ? BACKEND_API_ORIGIN : window.location.origin
}

const shareUrlForReport = (reportId: number) => {
  const url = new URL(route.path, `${shareOrigin()}/`)
  url.searchParams.set('expandedId', String(reportId))
  return url.toString()
}

const copyReportLink = (reportId: number) => {
  if (!isClient) return
  const url = shareUrlForReport(reportId)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).catch(() => {
      // Ignore
    })
  } else {
    const ta = document.createElement('textarea')
    ta.value = url
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
    } catch {
      // ignore
    }
    document.body.removeChild(ta)
  }
}

const shareToX = (report: ExtendedGameReport) => {
  if (!isClient) return
  const url = encodeURIComponent(shareUrlForReport(report.id))
  const text = encodeURIComponent(report.data?.summary ?? '')
  window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank', 'noopener')
}

const shareToReddit = (report: ExtendedGameReport) => {
  if (!isClient) return
  const url = encodeURIComponent(shareUrlForReport(report.id))
  const title = encodeURIComponent(report.data?.summary ?? '')
  window.open(`https://www.reddit.com/submit?url=${url}&title=${title}`, '_blank', 'noopener')
}

const shareToFacebook = (report: ExtendedGameReport) => {
  if (!isClient) return
  const url = encodeURIComponent(shareUrlForReport(report.id))
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'noopener')
}

const shareToBluesky = (report: ExtendedGameReport) => {
  if (!isClient) return
  const summary = report.data?.summary ?? ''
  const text = encodeURIComponent(`${summary}: ${shareUrlForReport(report.id)}`)
  window.open(`https://bsky.app/intent/compose?&text=${text}`, '_blank', 'noopener')
}

const onPopState = () => {
  if (reportFormDialogOpen.value) closeDialog()
  if (commentsDialogOpen.value) closeCommentsDialog()
  if (reportIssueDialogOpen.value) closeReportIssueDialog()
}

// Client-only effects
onMounted(async () => {
  isActive = true

  if (isClient) {
    window.addEventListener('popstate', onPopState)

    // Auto-open dialog only on the client
    if (route.query.openReportForm === 'true' && !dialogAutoOpened.value) {
      dialogAutoOpened.value = true
      openDialog()
    }

    // Pre-expand a report from query param
    const expandedId = parseInt(route.query.expandedId as string, 10)
    if (!Number.isNaN(expandedId)) {
      expanded.value[expandedId] = true
    }
  }

  await ensureClientGameData()
  if (appId.value) {
    await loadMarketData(appId.value)
  }
})
onBeforeUnmount(() => {
  isActive = false
  clearVerificationPromptTimer()
  if (isClient) {
    window.removeEventListener('popstate', onPopState)
  }
})

/*METADATA*/
const metaTitle = computed(() => gameStore.metadata.title || 'Game Report – Handheld Settings')
const metaDescription = computed(() => gameStore.metadata.description || 'Best handheld PC settings and community performance reports for this game. Graphics presets, frame rate targets, battery life tips, and tweaks that work on SteamOS handhelds.')
const metaLink = computed(() => `https://deckverified.games${route.path}`)
const metaLogo = ref('https://deckverified.games/logo2.png')
const metaImage = computed(() => gameStore.metadata.image)
const metaImageAlt = computed(() => gameStore.metadata.imageAlt)
const metaImageType = computed(() => gameStore.metadata.imageType)
const metaImageWidth = computed(() => gameStore.metadata.imageWidth)
const metaImageHeight = computed(() => gameStore.metadata.imageHeight)
const pageBackgroundStyle = computed(() => ({
  backgroundImage: gameBackground.value
    ? `linear-gradient(to top, var(--q-dark), transparent), url('${gameBackground.value}')`
    : 'linear-gradient(to top, var(--q-dark), transparent)',
}))

// Watch for changes to the gameBanner URL and update store metadata
watch(gameBanner, (newUrl) => {
    if (newUrl) {
      gameStore.setMetadata({ image: newUrl, imageAlt: `${gameName.value} - Game Banner` })
      gameStore.updateImageMetadataFromUrl(newUrl)
    }
  },
  { immediate: true },
)

watch([canPromptForVerification, activeExpandedReportId], () => {
  scheduleVerificationPrompt(activeExpandedReportId.value)
}, { immediate: true })

watch(() => route.fullPath, () => {
  verificationPromptDismissed.value = false
  scheduleVerificationPrompt(activeExpandedReportId.value)
})

watch(filteredReports, (reports) => {
  const visibleReportIds = new Set(reports.map((report) => report.id))
  const nextExpanded: Record<number, boolean> = {}

  for (const [rawId, isOpen] of Object.entries(expanded.value)) {
    const parsedId = Number(rawId)
    if (isOpen && visibleReportIds.has(parsedId)) {
      nextExpanded[parsedId] = true
    }
  }

  expanded.value = nextExpanded

  if (lastExpandedReportId.value !== null && !visibleReportIds.has(lastExpandedReportId.value)) {
    lastExpandedReportId.value = getFirstExpandedReportId()
  }
}, { deep: true })

useMeta(() => {
  return {
    title: metaTitle.value,
    titleTemplate: title => `${title} - Deck Verified Games`,
    meta: {
      description: { name: 'description', content: metaDescription.value },
      keywords: {
        name: 'keywords',
        content: `${gameName.value}, Steam Deck, ROG Ally, performance, settings, compatibility, optimisation`,
      },
      equiv: { 'http-equiv': 'Content-Type', content: 'text/html; charset=UTF-8' },

      // Open Graph (Facebook, Discord, etc.)
      ogTitle: { property: 'og:title', content: `${metaTitle.value} - Deck Verified Games` },
      ogType: { property: 'og:type', content: 'website' },
      ogImage: { property: 'og:image', content: metaImage.value },
      ogImageType: { property: 'og:image:type', content: metaImageType.value },
      ogImageAlt: { property: 'og:image:alt', content: metaImageAlt.value },
      ogImageWidth: { property: 'og:image:width', content: metaImageWidth.value },
      ogImageHeight: { property: 'og:image:height', content: metaImageHeight.value },
      ogUrl: { property: 'og:url', content: metaLink.value },
      ogDescription: { property: 'og:description', content: metaDescription.value },

      // Twitter Card (X)
      twitterCard: { name: 'twitter:card', content: 'summary_large_image' },
      twitterSite: { name: 'twitter:site', content: '@jsunnex' },
      twitterTitle: { name: 'twitter:title', content: `${metaTitle.value} - Deck Verified Games` },
      twitterDescription: { name: 'twitter:description', content: metaDescription.value },
      twitterImage: { name: 'twitter:image', content: metaImage.value },
    },

    link: { canonical: { rel: 'canonical', href: metaLink.value } },

    script: {
      ldJson: {
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'VideoGame',
          name: gameName.value || 'Unknown Game',
          url: metaLink.value,
          image: metaImage.value || undefined,
          gamePlatform: ['Steam Deck'],
          operatingSystem: 'SteamOS',
          sameAs: appId.value ? [`https://store.steampowered.com/app/${appId.value}`] : undefined,
          publisher: {
            '@type': 'Organization',
            name: 'Deck Verified Games',
            logo: {
              '@type': 'ImageObject',
              'url': metaLogo.value,
            },
          },
        }),
      },
    },
  }
})
</script>

<template>
  <q-ajax-bar
    ref="ajaxBar"
    :position="$q.platform.isMobileUi ? 'top' : 'bottom'"
    color="secondary"
    size="5px"
    skip-hijack
  />
  <!-- Show page header without a title. We will show the title per game below as it changes for mobile layouts -->
  <PageHeader :show-nav-back-button="true" />
  <div class="background-container"
       :class="{ 'background-container-mobile': $q.platform.isMobileUi }"
       :style="pageBackgroundStyle"></div>
  <div
    v-if="hasReportsToCompare || verificationPromptVisible"
    class="side-prompt-stack"
    :class=" $q.platform.isMobileUi ? 'side-prompt-stack-mobile' : 'side-prompt-stack-web'"
  >
    <q-slide-transition>
      <div
        v-if="verificationPromptVisible"
        class="verification-dialog-trigger"
      >
        <q-card class="verification-dialog-trigger-card">
          <div class="verification-dialog-trigger-content">
            <div class="verification-dialog-trigger-header">
              <q-icon name="campaign" color="primary" size="18px" />
              <span class="verification-dialog-trigger-title">Community Feedback</span>
              <q-btn
                flat
                round
                dense
                size="sm"
                icon="close"
                color="grey-4"
                aria-label="Dismiss feedback prompt"
                @click="dismissVerificationPrompt"
              />
            </div>
            <p class="verification-dialog-trigger-copy">
              Was this game report helpful? Give it a like so other players can quickly spot the most useful reports.
              If none of these matched your experience, consider submitting your own report.
            </p>
            <div class="verification-dialog-trigger-actions">
              <q-btn
                color="primary"
                text-color="black"
                dense
                size="sm"
                unelevated
                no-caps
                icon="thumb_up"
                label="Like"
                :loading="verificationPromptReport ? isReactionLoading(verificationPromptReport.id) : false"
                :disable="!verificationPromptReport || verificationPromptReport.external"
                @click="handleVerificationPromptLike"
              />
              <q-btn
                flat
                dense
                size="sm"
                no-caps
                color="secondary"
                icon="edit_note"
                label="Submit"
                @click="handleVerificationPromptSubmit"
              />
            </div>
          </div>
        </q-card>
      </div>
    </q-slide-transition>
    <div
      v-if="hasReportsToCompare"
      class="compare-dialog-trigger help-highlight-element"
    >
      <q-btn
        class="compare-dialog-trigger-button"
        color="secondary"
        text-color="black"
        dense
        unelevated
        no-caps
        icon="balance"
        :aria-label="`Compare (${compareReports.length})`"
        @click="openComparisonDialog"
      >
        <span class="compare-trigger-label">
          Compare ({{ compareReports.length }})
        </span>
      </q-btn>
      <span class="help-tooltip help-tooltip-left">Click here to view reports in comparison table</span>
    </div>
  </div>
  <div class="page-content-container">
    <div class="hero row items-center q-pa-md-md q-pa-sm">
      <div class="col-xs-12 col-md-12 text-center">
        <h1 v-if="!$q.platform.is.mobile" class="text-h2 game-title">
          <q-skeleton v-if="isLoading" type="text" width="400px" class="q-mx-auto" />
          <template v-else>{{ gameName }}</template>
        </h1>
      </div>
      <div class="col-xs-12 col-md-4 text-center q-pa-md-sm q-pa-xs-none self-start game-links">
        <div class="game-image-container row justify-center">
          <div style="position: relative; width: 100%;">
            <q-skeleton v-if="isLoading" class="game-banner" height="200px" width="100%" />
            <template v-else>
              <q-img
                v-if="gameBanner"
                class="game-banner"
                :src="gameBanner"
                alt="Game Image">
                <template v-slot:error>
                  <img
                    src="~/assets/banner-placeholder.png"
                    alt="Placeholder" />
                </template>
              </q-img>
              <q-img
                v-else
                class="game-banner"
                src="~/assets/banner-placeholder.png"
                alt="Game Image" />
            </template>

            <!-- compatibility badges (top-left) -->
            <div class="game-banner-badges absolute-top-left column q-gutter-xs">
              <ProtonBadge
                v-if="protonTier" class="q-mb-none"
                :key="`ProtonBadge-${appId}-${gameName}-protonTier`"
                :app-id="appId"
                :game-name="gameName"
                :tier="protonTier" />
              <SteamCompatBadge v-if="steamCompat" class="q-mt-none"
                                :game-name="gameName"
                                :steam-deck-compatibility="steamCompat" />
            </div>

            <!-- price badges (top-right) -->
            <div class="game-banner-badges absolute-top-right column">
              <PriceBadge
                v-if="priceSummary"
                :key="`PriceBadge-${priceSummary.lastChecked}-${priceNew}-${priceOld}`"
                :itad-slug="priceSummary.itadSlug"
                :price-new="priceNew"
                :price-old="priceOld"
                :price-cut="priceCut"
                :currency="priceCurrency" />
            </div>
          </div>
        </div>
        <h1 v-if="$q.platform.is.mobile" class="text-h5 game-title">
          <q-skeleton v-if="isLoading" type="text" width="200px" class="q-mx-auto" />
          <template v-else>{{ gameName }}</template>
        </h1>
        <div v-if="isLoading">
          <div class="row q-col-gutter-xs"
               :class="($q.screen.lt.md && !$q.platform.isMobileUi) ? 'justify-center' : ''">
            <q-skeleton type="QBtn" width="150px" height="46px" class="q-ma-xs" />
            <q-skeleton type="QBtn" width="150px" height="46px" class="q-ma-xs" />
          </div>
          <div class="row justify-center q-mt-md">
            <q-skeleton type="QBtn" width="100%" height="50px" />
          </div>
        </div>
        <div v-else-if="gameData">
          <!-- START EXTERNAL LINKS -->
          <div v-if="!$q.platform.isMobileUi"
               class="row q-col-gutter-xs"
               :class="$q.screen.lt.md ? 'justify-center' : ''">
            <SecondaryButton v-if="githubProjectSearchLink"
                             :icon="simGithub"
                             label="GitHub Reports"
                             :href="githubProjectSearchLink ?? ''"
                             target="_blank" rel="noopener">
              <q-tooltip>View reports on GitHub</q-tooltip>
            </SecondaryButton>
            <SecondaryButton v-if="appId"
                             :icon="simSteam"
                             label="Steam Store"
                             :href="`https://store.steampowered.com/app/${appId}`"
                             target="_blank" rel="noopener">
              <q-tooltip>View on Steam</q-tooltip>
            </SecondaryButton>
            <SecondaryButton v-if="appId"
                             :icon="simProtondb"
                             label="ProtonDB"
                             :href="`https://www.protondb.com/app/${appId}?device=steamDeck`"
                             target="_blank" rel="noopener">
              <q-tooltip>View on ProtonDB</q-tooltip>
            </SecondaryButton>
            <SecondaryButton v-if="gameName"
                             :icon="simPcgamingwiki"
                             label="PCGamingWiki"
                             :href="getPCGamingWikiUrlFromGameName(gameName)"
                             target="_blank" rel="noopener">
              <q-tooltip>View on PCGamingWiki</q-tooltip>
            </SecondaryButton>
            <SecondaryButton v-if="sdhqLink"
                             :href="sdhqLink"
                             target="_blank" rel="noopener">
              <q-avatar size="20px" class="q-mr-sm">
                <img :src="sdhqLogo" alt="Steam Deck HQ logo" />
              </q-avatar>
              <span>SteamDeckHQ</span>
              <q-tooltip>View Game Review on SteamDeckHQ</q-tooltip>
            </SecondaryButton>
          </div>
          <div v-else class="row justify-center">
            <PrimaryButton
              class="q-mt-sm"
              full-width
              icon="link"
              label="External Links"
              @click="externalLinksDialogOpen = true"
            />
            <q-dialog v-model="externalLinksDialogOpen" seamless no-refocus backdrop-filter="blur(2px)">
              <q-card class="dv-dialog-card">
                <q-card-section class="dv-dialog-content">
                  <q-card flat class="dv-dialog-inner-card">
                    <q-card-section class="dv-dialog-header row items-center justify-between no-wrap">
                      <div class="text-h6">
                        External Links
                      </div>
                    </q-card-section>

                    <q-separator dark />

                    <q-card-section class="dv-dialog-body scroll q-pa-lg q-gutter-lg">
                      <q-list>
                        <q-item
                          v-if="githubProjectSearchLink"
                          clickable v-ripple
                          class="dv-dialog-menu-list-button"
                          :href="githubProjectSearchLink"
                          target="_blank" rel="noopener"
                        >
                          <q-item-section avatar>
                            <q-avatar>
                              <q-icon :name="simGithub" />
                            </q-avatar>
                          </q-item-section>
                          <q-item-section>
                            <q-item-label class="text-body1 text-weight-medium">
                              GitHub Reports
                            </q-item-label>
                            <q-item-label caption class="text-grey-5">
                              <!-- No Caption  -->
                            </q-item-label>
                          </q-item-section>
                          <q-item-section side>
                            <q-icon name="open_in_new" />
                          </q-item-section>
                        </q-item>

                        <q-item
                          v-if="appId"
                          clickable v-ripple
                          class="dv-dialog-menu-list-button"
                          :href="`https://store.steampowered.com/app/${appId}`"
                          target="_blank" rel="noopener"
                        >
                          <q-item-section avatar>
                            <q-avatar>
                              <q-icon :name="simSteam" />
                            </q-avatar>
                          </q-item-section>
                          <q-item-section>
                            <q-item-label class="text-body1 text-weight-medium">
                              Steam Store
                            </q-item-label>
                            <q-item-label caption class="text-grey-5">
                              <!-- No Caption  -->
                            </q-item-label>
                          </q-item-section>
                          <q-item-section side>
                            <q-icon name="open_in_new" />
                          </q-item-section>
                        </q-item>

                        <q-item
                          v-if="appId"
                          clickable v-ripple
                          class="dv-dialog-menu-list-button"
                          :href="`https://www.protondb.com/app/${appId}?device=steamDeck`"
                          target="_blank" rel="noopener"
                        >
                          <q-item-section avatar>
                            <q-avatar>
                              <q-icon :name="simProtondb" />
                            </q-avatar>
                          </q-item-section>
                          <q-item-section>
                            <q-item-label class="text-body1 text-weight-medium">
                              ProtonDB
                            </q-item-label>
                            <q-item-label caption class="text-grey-5">
                              <!-- No Caption  -->
                            </q-item-label>
                          </q-item-section>
                          <q-item-section side>
                            <q-icon name="open_in_new" />
                          </q-item-section>
                        </q-item>

                        <q-item
                          v-if="gameName"
                          clickable v-ripple
                          class="dv-dialog-menu-list-button"
                          :href="getPCGamingWikiUrlFromGameName(gameName)"
                          target="_blank" rel="noopener"
                        >
                          <q-item-section avatar>
                            <q-avatar>
                              <q-icon :name="simPcgamingwiki" />
                            </q-avatar>
                          </q-item-section>
                          <q-item-section>
                            <q-item-label class="text-body1 text-weight-medium">
                              PCGamingWiki
                            </q-item-label>
                            <q-item-label caption class="text-grey-5">
                              <!-- No Caption  -->
                            </q-item-label>
                          </q-item-section>
                          <q-item-section side>
                            <q-icon name="open_in_new" />
                          </q-item-section>
                        </q-item>

                        <q-item
                          v-if="sdhqLink"
                          clickable v-ripple
                          class="dv-dialog-menu-list-button"
                          :href="sdhqLink"
                          target="_blank" rel="noopener"
                        >
                          <q-item-section avatar>
                            <q-avatar>
                              <img :src="sdhqLogo" alt="Steam Deck HQ logo" />
                            </q-avatar>
                          </q-item-section>
                          <q-item-section>
                            <q-item-label class="text-body1 text-weight-medium">
                              SteamDeckHQ
                            </q-item-label>
                            <q-item-label caption class="text-grey-5">
                              <!-- No Caption  -->
                            </q-item-label>
                          </q-item-section>
                          <q-item-section side>
                            <q-icon name="open_in_new" />
                          </q-item-section>
                        </q-item>
                      </q-list>
                    </q-card-section>

                    <q-card-actions align="right">
                      <primaryButton
                        dense
                        color="primary"
                        label="Close"
                        icon="close"
                        v-close-popup />
                    </q-card-actions>
                  </q-card>
                </q-card-section>
              </q-card>
            </q-dialog>
          </div>
          <!-- END EXTERNAL LINKS -->

          <!-- START SUBMIT REPORT BUTTON -->
          <div class="row justify-center">
            <PrimaryButton v-if="!useLocalReportForm"
                           icon="fas fa-file-invoice"
                           label="Submit Report"
                           :href="githubSubmitReportLink"
                           target="_blank" rel="noopener" />
            <PrimaryButton v-else
                           full-width
                           icon="fas fa-file-invoice"
                           label="Submit Report"
                           @click="openDialog" />
            <q-dialog class="q-ma-none q-pa-none report-dialog"
                      backdrop-filter="blur(2px)"
                      no-refocus
                      full-height
                      :full-width="$q.screen.lt.md"
                      :maximized="$q.screen.lt.md"
                      v-model="reportFormDialogOpen"
                      @hide="closeDialog">
              <ReportForm :game-name="gameName"
                          :app-id="appId ? appId : ''"
                          :game-banner="gameBanner ? gameBanner : ''"
                          :game-background="gameBackground ? gameBackground : ''"
                          :existing-report="highestRatedGameReport? highestRatedGameReport : {}"
                          @cancel="closeDialog"
              />
            </q-dialog>
          </div>
          <!-- END SUBMIT REPORT BUTTON -->
          <!-- START PAGE TEXT -->
          <div class="q-mt-lg text-left gt-sm">
            <div class="q-mt-md">
              <h3 class="text-h6">Discover Community Game Reports</h3>
              <p>
                Browse <strong>community-submitted reports</strong> for
                <strong>{{ gameName || 'this game' }}</strong>, including recommended
                <strong>performance settings</strong>, <strong>system configurations</strong>,
                and <strong>in-game options</strong>. Compare how different players optimise
                <strong>frame rates</strong>, <strong>battery life</strong>, and overall
                performance on Steam Deck and other Linux handhelds.
              </p>
              <p>
                Use the filters above to check for reports by <strong>device</strong> or
                <strong>launcher</strong>, and sort them by <strong>most liked</strong> or
                <strong>recently updated</strong>. Since this is a new community effort,
                some games may only have a few reports — your contribution can help others
                discover better ways to play {{ gameName || 'this title' }}.
              </p>
              <p>
                Have your own tested setup? Click <em>Submit Report</em> to share your
                configuration and help others discover the best way to play
                {{ gameName || 'this game' }} on your preferred handheld.
              </p>
            </div>
            <div v-if="gameReportsSummary">
              <h3 class="text-h6">Reports Summary</h3>
              <p>
                {{ gameReportsSummary }}
              </p>
            </div>
          </div>
          <!-- END PAGE TEXT -->
        </div>
      </div>
      <div class="col-xs-12 col-md-8 self-start q-pr-lg-sm q-px-md-sm q-px-xs-none">
        <div class="game-data-container q-mr-lg-sm">
          <div v-if="isLoading">
            <div class="game-data-filters row justify-between items-center">
              <div class="filters col-xs-12 col-md-8">
                <q-skeleton type="QInput" width="210px" height="56px" class="filter-select q-my-xs-sm q-mr-xs" />
                <q-skeleton type="QInput" width="210px" height="56px" class="filter-select q-my-xs-sm q-ml-xs" />
              </div>
            </div>
            <q-list separator>
              <q-item class="game-data-item q-mb-sm q-px-sm q-py-sm q-px-sm-md q-py-sm-sm">
                <q-tooltip
                  transition-show="scale" transition-hide="scale"
                  anchor="bottom end" self="bottom right" :offset="[-30, -10]">
                  Click to Show/Hide Report
                </q-tooltip>
                <q-item-section class="gt-xs">
                  <!-- Wrapper for the layout -->
                  <div class="row items-center q-gutter-sm">
                    <!-- Avatar Section -->
                    <div class="col-auto q-ml-md">
                      <q-avatar>
                        <q-skeleton type="circle" height="20px" width="80px" />
                      </q-avatar>
                    </div>
                    <!-- Report Summary Section -->
                    <div class="col q-ml-md">
                      <q-item-label class="text-h6 text-secondary">
                        <q-skeleton type="text" width="70%" />
                      </q-item-label>
                    </div>
                    <!-- Reporter-->
                    <div class="col-auto">
                      <q-item-label>
                        <q-skeleton type="QChip" height="20px" width="100px" />
                      </q-item-label>
                    </div>
                  </div>
                  <!-- Report Description Section -->
                  <div class="row">
                    <div class="col-4">
                      <q-item-label caption lines="1" class="q-pt-sm">
                        <q-skeleton type="text" width="30%" />
                      </q-item-label>
                      <q-item-label caption lines="1" class="q-pt-sm">
                        <q-skeleton type="text" width="30%" />
                      </q-item-label>
                    </div>
                    <div class="col-4">
                      <q-item-label caption lines="1" class="q-pt-sm">
                        <q-skeleton type="text" width="30%" />
                      </q-item-label>
                      <q-item-label caption lines="1" class="q-pt-sm">
                        <q-skeleton type="text" width="30%" />
                      </q-item-label>
                    </div>
                    <div class="col-4">
                      <q-item-label caption lines="1" class="q-pt-sm">
                        <q-skeleton type="text" width="30%" />
                      </q-item-label>
                      <q-item-label caption lines="1" class="q-pt-sm">
                        <q-skeleton type="text" width="30%" />
                      </q-item-label>
                    </div>
                  </div>
                </q-item-section>
                <q-item-section class="lt-sm">
                  <!-- Wrapper for the layout -->
                  <div class="row items-center">
                    <!-- Avatar Section -->
                    <div class="col-auto">
                      <q-avatar>
                        <q-skeleton type="circle" height="20px" width="80px" />
                      </q-avatar>
                    </div>
                    <!-- Report Summary Section -->
                    <div class="col q-ml-md">
                      <q-item-label class="text-secondary">
                        <q-skeleton type="text" width="70%" />
                      </q-item-label>
                    </div>
                  </div>
                  <!-- Report Description Section -->
                  <div class="row q-pt-sm">
                    <div class="col-12 q-mt-xs">
                      <q-item-label caption lines="1">
                        <q-skeleton type="text" width="30%" />
                      </q-item-label>
                    </div>
                    <div class="col-12 q-mt-xs">
                      <q-item-label caption lines="1">
                        <q-skeleton type="text" width="30%" />
                      </q-item-label>
                      <q-item-label caption lines="1">
                        <q-skeleton type="text" width="30%" />
                      </q-item-label>
                    </div>
                    <div class="col-12 q-mt-xs">
                      <q-item-label caption lines="1">
                        <q-skeleton type="text" width="30%" />
                      </q-item-label>
                      <q-item-label caption lines="1">
                        <q-skeleton type="text" width="30%" />
                      </q-item-label>
                    </div>
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
          </div>
          <div v-else-if="gameData">
            <div v-if="hasReports"
                 class="game-data-filters row justify-between items-center">
              <div v-if="$q.screen.lt.md && $q.platform.isMobileUi" class="col-12">
                <div class="row no-wrap items-center q-col-gutter-sm q-mb-sm">
                  <div class="col-6" style="max-width:100px">
                    <SecondaryButton
                      v-if="!hasActiveFilters"
                      color="primary"
                      icon="filter_alt"
                      label="Filter"
                      full-width
                      dense
                      size="sm"
                      @click="filterDialogOpen = true" />
                    <PrimaryButton
                      v-else
                      color="primary"
                      icon="filter_alt"
                      label="Filter"
                      full-width
                      dense
                      size="sm"
                      @click="filterDialogOpen = true" />
                  </div>
                  <q-space />
                  <div class="col-6" style="max-width:100px">
                    <SecondaryButton
                      v-if="!hasActiveSort"
                      color="primary"
                      icon="sort"
                      label="Sort"
                      full-width
                      dense
                      size="sm"
                      @click="sortDialogOpen = true" />
                    <PrimaryButton
                      v-else
                      color="primary"
                      icon="sort"
                      label="Sort"
                      full-width
                      dense
                      size="sm"
                      @click="sortDialogOpen = true" />
                  </div>
                </div>

                <q-dialog v-model="filterDialogOpen" seamless no-refocus backdrop-filter="blur(2px)">
                  <q-card class="dv-dialog-card">
                    <q-card-section class="dv-dialog-content">
                      <q-card flat class="dv-dialog-inner-card">
                        <q-card-section class="dv-dialog-header row items-center justify-between no-wrap">
                          <div class="text-h6">
                            Filters
                          </div>
                        </q-card-section>

                        <q-separator dark />

                        <q-card-section class="dv-dialog-body scroll q-pa-lg q-gutter-lg">
                          <div v-if="hasGlobalDeviceFilter" class="text-body2 text-grey-4">
                            Device filter is controlled by App Settings: {{ preferredDeviceSummary }}
                          </div>
                          <q-select v-else v-model="selectedDevice" label="Device"
                                    dense outlined emit-value map-options
                                    :options="deviceOptions" />
                          <q-select v-model="selectedLauncher" label="Launcher"
                                    dense outlined emit-value map-options
                                    :options="launcherOptions" />
                          <q-toggle
                            v-if="hasDuplicateReports"
                            v-model="hideDuplicateReports"
                            dense
                            color="warning"
                            label="Hide duplicates" />
                        </q-card-section>
                        <q-card-actions align="between">
                          <SecondaryButton dense color="primary" label="Clear"
                                           @click="selectedDevice = 'all'; selectedLauncher = 'all'; hideDuplicateReports = false" />
                          <primaryButton dense color="primary" label="Apply" icon="filter_alt"
                                         v-close-popup />
                        </q-card-actions>
                      </q-card>
                    </q-card-section>
                  </q-card>
                </q-dialog>

                <q-dialog v-model="sortDialogOpen" seamless no-refocus backdrop-filter="blur(2px)">
                  <q-card class="dv-dialog-card">
                    <q-card-section class="dv-dialog-content">
                      <q-card flat class="dv-dialog-inner-card">
                        <q-card-section class="dv-dialog-header row items-center justify-between no-wrap">
                          <div class="text-h6">
                            Sort
                          </div>
                        </q-card-section>

                        <q-separator dark />

                        <q-card-section class="dv-dialog-body scroll q-pa-lg q-gutter-lg">
                          <q-list bordered separator>
                            <q-item clickable v-ripple @click="toggleSortOrder('updated')">
                              <q-item-section>Last Updated</q-item-section>
                              <q-item-section side>
                                <q-icon
                                  :name="(sortOrder === 'asc' && sortOption === 'updated') ? 'arrow_upward' : ((sortOrder === 'desc' && sortOption === 'updated') ? 'arrow_downward' : 'sort')"
                                  :color="(sortOption === 'updated' && sortOrder !== 'off') ? 'primary' : 'grey-5'" />
                              </q-item-section>
                            </q-item>
                            <q-item clickable v-ripple @click="toggleSortOrder('reactions')">
                              <q-item-section>Most Liked</q-item-section>
                              <q-item-section side>
                                <q-icon
                                  :name="(sortOrder === 'asc' && sortOption === 'reactions') ? 'arrow_upward' : ((sortOrder === 'desc' && sortOption === 'reactions') ? 'arrow_downward' : 'sort')"
                                  :color="(sortOption === 'reactions' && sortOrder !== 'off') ? 'primary' : 'grey-5'" />
                              </q-item-section>
                            </q-item>
                          </q-list>
                        </q-card-section>
                        <q-card-actions align="between">
                          <SecondaryButton dense color="primary" label="Clear"
                                           @click="clearSort" />
                          <primaryButton dense color="primary" label="Apply" icon="segment"
                                         v-close-popup />
                        </q-card-actions>
                      </q-card>
                    </q-card-section>
                  </q-card>
                </q-dialog>
              </div>
              <template v-else>
                <!-- Filters (Top Left) -->
                <div class="filters col-xs-12 col-md-8">
                  <div v-if="!hasGlobalDeviceFilter" class="filter-container help-highlight-element">
                    <q-select v-model="selectedDevice" label="Device"
                              dense square borderless
                              class="filter-select"
                              :options="deviceOptions" emit-value map-options />
                    <span class="help-tooltip help-tooltip-top">Filter the list of reports</span>
                  </div>
                  <div v-else class="filter-container filter-container-global-device">
                    <div class="text-caption text-grey-4">
                      Device filter from App Settings: {{ preferredDeviceSummary }}
                    </div>
                  </div>
                  <div class="filter-container">
                    <q-select v-model="selectedLauncher" label="Launcher"
                              dense square borderless
                              class="filter-select"
                              :options="launcherOptions" emit-value map-options />
                  </div>
                  <div v-if="hasDuplicateReports" class="filter-container">
                    <q-toggle
                      v-model="hideDuplicateReports"
                      dense
                      color="warning"
                      class="hide-duplicates-toggle"
                      label="Hide duplicates" />
                  </div>
                </div>

                <!-- Sorting (Top Right) -->
                <div class="sorting col-md-shrink q-pt-sm q-pt-md-none">
                  <div class="sorting-container">
                    <!-- Sort by Updated -->
                    <q-btn dense round flat @click="toggleSortOrder('updated')"
                           :color="(sortOrder !== 'off' && sortOption === 'updated') ? 'primary' : 'white'">
                      <q-icon name="event" />
                      <q-icon
                        :name="(sortOrder === 'asc' && sortOption === 'updated') ? 'arrow_upward' : ((sortOrder === 'desc' && sortOption === 'updated') ? 'arrow_downward' : 'sort')"
                        :color="(sortOrder !== 'off' && sortOption === 'updated') ? 'primary' : 'white'" />
                      <q-tooltip>Sort by Last Updated</q-tooltip>
                    </q-btn>
                    <!-- Sort by Most Liked -->
                    <q-btn dense round flat @click="toggleSortOrder('reactions')"
                           :color="(sortOrder !== 'off' && sortOption === 'reactions') ? 'primary' : 'white'">
                      <q-icon name="thumb_up" />
                      <q-icon
                        :name="(sortOrder === 'asc' && sortOption === 'reactions') ? 'arrow_upward' : ((sortOrder === 'desc' && sortOption === 'reactions') ? 'arrow_downward' : 'sort')"
                        :color="(sortOrder !== 'off' && sortOption === 'reactions') ? 'primary' : 'white'" />
                      <q-tooltip v-if="sortOption !== 'reactions' || sortOrder === 'off'">
                        Sort by Most Liked
                      </q-tooltip>
                      <q-tooltip v-else-if="sortOrder === 'asc'">
                        Sorting by Most Liked Ascending
                      </q-tooltip>
                      <q-tooltip v-else-if="sortOrder === 'desc'">
                        Sorting by Most Liked Descending
                      </q-tooltip>
                    </q-btn>
                  </div>
                </div>
              </template>
            </div>
            <div v-if="filteredReports.length > 0">
              <q-list separator>
                <q-item
                  v-for="report in filteredReports" :key="report.id"
                  class="game-data-item q-mb-sm q-px-sm q-py-sm q-px-sm-md q-py-sm-sm"
                  :class="getAppreciationTier(report)?.itemClass">
                  <q-expansion-item :model-value="isExpanded(report.id)"
                                    @update:model-value="(v) => setExpanded(report.id, v)"
                                    dense class="full-width"
                                    expand-icon-class="self-end game-data-item-expand-button"
                                    header-class="full-width q-ma-none q-pa-none q-pa-sm-xs q-pb-sm-sm q-pb-xs-xs">
                    <template v-slot:header>
                      <q-tooltip
                        transition-show="scale" transition-hide="scale"
                        anchor="bottom end" self="bottom right" :offset="[-35, -8]">
                        Click to Show/Hide Report
                      </q-tooltip>
                      <div class="report-status-cluster" v-if="getReportStatusChips(report).length > 0">
                        <q-chip
                          v-for="(chip, chipIndex) in getReportStatusChips(report)"
                          :key="`${report.id}-${chip.key}`"
                          size="sm"
                          square
                          :dense="$q.screen.lt.sm"
                          class="report-corner-chip report-status-chip q-ma-none"
                          :class="getReportStatusChipClasses(getReportStatusChips(report), chip, chipIndex)"
                          :color="chip.color"
                          text-color="black"
                          :aria-label="chip.ariaLabel"
                        >
                          <q-avatar :icon="chip.icon" :color="chip.avatarColor" text-color="black" />
                          <span :class="{ 'duplicate-chip-text': chip.kind === 'duplicate' }">
                            {{ chip.shortLabel }}
                          </span>
                          <span v-if="chip.count" class="report-status-chip__count">
                            {{ chip.count }}
                          </span>
                          <q-tooltip anchor="center left" self="center right" :offset="[5, 0]">
                            {{ chip.tooltip }}
                          </q-tooltip>
                        </q-chip>
                      </div>
                      <q-btn
                        class="compare-select-btn help-highlight-element"
                        :class="{ 'compare-select-btn-selected': isReportSelectedForCompare(report.id) }"
                        round dense flat
                        size="sm"
                        :icon="getCompareButtonIcon(report.id)"
                        @mouseenter="hoveredCompareReportId = report.id"
                        @mouseleave="hoveredCompareReportId = null"
                        @click.stop="addReportToCompare(report)"
                        :aria-label="isReportSelectedForCompare(report.id) ? 'Report added to compare' : 'Add report to compare'"
                      >
                        <q-tooltip anchor="center right" self="center left">
                          <span v-if="isReportSelectedForCompare(report.id)">Already in comparison list</span>
                          <span v-else>Add to comparison</span>
                        </q-tooltip>
                        <span class="help-tooltip help-tooltip-right">Add report for comparison</span>
                      </q-btn>
                      <q-item-section class="gt-xs">
                        <!-- Wrapper for the layout -->
                        <div class="row items-center q-gutter-sm">
                          <!-- Avatar Section -->
                          <div class="col-auto q-ml-md">
                            <q-avatar>
                              <DeviceImage
                                :device="report.data.device ? report.data.device : ''"
                                :dropShadow="false"
                                size="small" width="80px" />
                            </q-avatar>
                          </div>
                          <!-- Report Summary Section -->
                          <div class="col q-ml-md">
                            <q-item-label class="text-h6 text-secondary">
                              {{ report.data.summary }}
                            </q-item-label>
                          </div>
                          <!-- Reporter-->
                          <div class="col-auto">
                            <q-item-label>
                              <q-chip size="sm"
                                      color="brown"
                                      text-color="white">
                                <q-avatar color="red" text-color="white">
                                  <img :src="report.user.avatar_url">
                                </q-avatar>
                                {{ report.user.login }}
                              </q-chip>
                            </q-item-label>
                          </div>
                        </div>
                        <!-- Report Description Section -->
                        <div class="row">
                          <div class="col-3">
                            <q-item-label caption lines="1" class="q-pt-sm">
                              <b>Rating: </b>{{ report.data.performance_rating ?? 'Unrated' }}
                            </q-item-label>
                            <q-item-label caption lines="1" class="q-pt-sm">
                              <b>Device: </b>{{ report.data.device }}
                            </q-item-label>
                          </div>
                          <div class="col-3">
                            <q-item-label caption lines="1" class="q-pt-sm">
                              <b>OS: </b>{{ report.data.os_version }}
                            </q-item-label>
                            <q-item-label caption lines="1" class="q-pt-sm">
                              <b>Launcher: </b>{{ report.data.launcher }}
                            </q-item-label>
                          </div>
                          <div class="col-3">
                            <q-item-label caption lines="1" class="q-pt-sm">
                              <b>Target Framerate: </b>{{ report.data.target_framerate }}
                            </q-item-label>
                            <q-item-label caption lines="1" class="q-pt-sm">
                              <b>Likes: </b>{{ report.reactions.reactions_thumbs_up }}
                            </q-item-label>
                          </div>
                          <div class="col-3">
                            <q-item-label caption lines="1" class="q-pt-sm">
                              <b>Average Battery Life: </b>
                              <template v-if="report.data.calculated_battery_life_minutes">
                                {{ Math.floor(report.data.calculated_battery_life_minutes / 60) }} hours
                                {{ report.data.calculated_battery_life_minutes % 60 }} mins
                              </template>
                              <template v-else>
                                unknown
                              </template>
                            </q-item-label>
                          </div>
                        </div>
                      </q-item-section>
                      <q-item-section class="lt-sm">
                        <!-- Wrapper for the layout -->
                        <div class="row items-center">
                          <!-- Avatar Section -->
                          <div class="col-auto">
                            <q-avatar>
                              <DeviceImage
                                :device="report.data.device ? report.data.device : ''"
                                :dropShadow="false"
                                size="small" width="80px" />
                            </q-avatar>
                          </div>
                          <!-- Report Summary Section -->
                          <div class="col q-ml-md">
                            <q-item-label class="text-secondary">
                              {{ report.data.summary }}
                            </q-item-label>
                          </div>
                        </div>
                        <!-- Report Description Section -->
                        <div class="row q-pt-sm">
                          <div class="col-12 q-mt-xs">
                            <q-item-label caption lines="1">
                              <b>Device: </b>{{ report.data.device }}
                            </q-item-label>
                          </div>
                          <div class="col-12 q-mt-xs">
                            <q-item-label caption lines="1">
                              <b>OS: </b>{{ report.data.os_version }}
                            </q-item-label>
                            <q-item-label caption lines="1">
                              <b>Launcher: </b>{{ report.data.launcher }}
                            </q-item-label>
                          </div>
                          <div class="col-12 q-mt-xs">
                            <q-item-label caption lines="1">
                              <b>Target Framerate: </b>{{ report.data.target_framerate }}
                            </q-item-label>
                            <q-item-label caption lines="1">
                              <b>Likes: </b>{{ report.reactions.reactions_thumbs_up }}
                            </q-item-label>
                          </div>
                          <div class="col-12 q-mt-xs">
                            <q-item-label caption lines="1">
                              <b>Average Battery Life: </b>
                              <template v-if="report.data.calculated_battery_life_minutes">
                                {{ Math.floor(report.data.calculated_battery_life_minutes / 60) }} hours
                                {{ report.data.calculated_battery_life_minutes % 60 }} mins
                              </template>
                              <template v-else>
                                unknown
                              </template>
                            </q-item-label>
                          </div>
                        </div>
                      </q-item-section>
                    </template>

                    <div class="report q-mt-md">
                      <div class="row q-col-gutter-md">
                        <!-- System Configuration Card -->
                        <div class="col-xs-12 col-md-6">
                          <q-card v-if="hasSystemConfig(report)" class="config-card">
                            <q-card-section>
                              <div class="text-h6">System Configuration</div>
                            </q-card-section>
                            <q-separator />
                            <q-card-section class="q-pa-sm q-pa-sm-md">
                              <div class="config-list">
                                <div v-if="report.data.undervolt_applied" class="config-item">
                                  <span>Undervolt Applied:</span>
                                  <span>{{ report.data.undervolt_applied }}</span>
                                </div>
                                <div
                                  v-if="report.data.steam_play_compatibility_tool_used && report.data.compatibility_tool_version"
                                  class="config-item">
                                  <span>Compatibility Tool:</span>
                                  <span>
                                    {{ report.data.steam_play_compatibility_tool_used
                                    }}: {{ report.data.compatibility_tool_version }}
                                  </span>
                                </div>
                                <div v-if="report.data.game_resolution" class="config-item">
                                  <span>Game Resolution:</span>
                                  <span>{{ report.data.game_resolution }}</span>
                                </div>
                                <div v-if="report.data.custom_launch_options" class="config-item">
                                  <span>Launch Options:</span>
                                  <span>{{ report.data.custom_launch_options }}</span>
                                </div>
                              </div>
                            </q-card-section>
                          </q-card>
                        </div>
                        <!-- Performance Settings Card -->
                        <div class="col-xs-12 col-md-6">
                          <q-card v-if="hasPerformanceSettings(report)" class="config-card">
                            <q-card-section>
                              <div class="text-h6">Performance Settings</div>
                            </q-card-section>
                            <q-separator />
                            <q-card-section class="q-pa-sm q-pa-sm-md">
                              <div class="config-list">
                                <div v-if="report.data.frame_limit" class="config-item">
                                  <span v-if="report.data.disable_frame_limit === 'On'">Refresh Rate:</span>
                                  <span v-else>Frame Limit:</span>
                                  <span v-if="report.data.disable_frame_limit === 'On'">
                                    {{ report.data.frame_limit }}Hz
                                  </span>
                                  <span v-else>
                                    {{ report.data.frame_limit }}FPS
                                  </span>
                                </div>
                                <div v-if="report.data.disable_frame_limit" class="config-item">
                                  <span>Disable Frame Limit:</span>
                                  <span>{{ report.data.disable_frame_limit }}</span>
                                </div>
                                <div v-if="report.data.enable_vrr" class="config-item">
                                  <span>Enable VRR:</span>
                                  <span>{{ report.data.enable_vrr }}</span>
                                </div>
                                <div v-if="report.data.allow_tearing" class="config-item">
                                  <span>Allow Tearing:</span>
                                  <span>{{ report.data.allow_tearing }}</span>
                                </div>
                                <div v-if="report.data.half_rate_shading" class="config-item">
                                  <span>Half Rate Shading:</span>
                                  <span>{{ report.data.half_rate_shading }}</span>
                                </div>
                                <div v-if="report.data.tdp_limit" class="config-item">
                                  <span>TDP Limit:</span>
                                  <span>{{ report.data.tdp_limit }}W</span>
                                </div>
                                <div v-if="report.data.manual_gpu_clock" class="config-item">
                                  <span>Manual GPU Clock:</span>
                                  <span>{{ report.data.manual_gpu_clock }}MHz</span>
                                </div>
                                <div v-if="report.data.scaling_mode" class="config-item">
                                  <span>Scaling Mode:</span>
                                  <span>{{ report.data.scaling_mode }}</span>
                                </div>
                                <div v-if="report.data.scaling_filter" class="config-item">
                                  <span>Scaling Filter:</span>
                                  <span>{{ report.data.scaling_filter }}</span>
                                </div>
                              </div>
                            </q-card-section>
                          </q-card>
                        </div>
                      </div>
                      <div class="row q-ma-none q-pa-none">
                        <div class="col q-ma-none q-pa-none">
                          <q-card v-if="report.data.game_display_settings"
                                  class="config-card q-mt-md q-ma-none q-pa-none">
                            <q-card-section>
                              <div class="text-h6">Game Display Settings</div>
                            </q-card-section>
                            <q-separator />
                            <q-card-section class="q-pa-sm q-pa-sm-md">
                              <GameReportMarkdown :markdown="report.data.game_display_settings" />
                            </q-card-section>
                          </q-card>
                          <q-card v-if="report.data.game_graphics_settings"
                                  class="config-card q-mt-md q-ma-none q-pa-none">
                            <q-card-section>
                              <div class="text-h6">Game Graphics Settings</div>
                            </q-card-section>
                            <q-separator />
                            <q-card-section class="q-pa-sm q-pa-sm-md">
                              <GameReportMarkdown :markdown="report.data.game_graphics_settings" />
                            </q-card-section>
                          </q-card>
                          <q-card v-if="report.data.additional_notes"
                                  class="config-card q-mt-md q-ma-none q-pa-none">
                            <q-card-section>
                              <div class="text-h6">Additional Notes</div>
                            </q-card-section>
                            <q-separator />
                            <q-card-section class="q-pa-sm q-pa-sm-md">
                              <GameReportMarkdown :markdown="report.data.additional_notes"
                                                  :inline-images="true"
                                                  keep-standard-list-format />
                            </q-card-section>
                          </q-card>
                        </div>
                      </div>

                      <div class="report-footer row items-center justify-between q-mt-lg q-mb-md q-pa-none">
                        <!-- Left: Author/Report section -->
                        <div class="row items-center author-block author-source-row">
                          <!-- Author group (entire block clickable when report is not external) -->
                          <q-item
                            v-if="!report.external"
                            class="author-group q-ma-none q-pa-none author-link"
                            clickable
                            v-ripple
                            tag="a"
                            :href="`${githubListReportsLink}+author%3A${encodeURIComponent(report.user.login)}`"
                            target="_blank"
                            rel="noopener"
                            :aria-label="`View reports by ${report.user.login} on GitHub`"
                            style="display:flex; align-items:center; flex:0 1 auto; min-width:0;"
                          >
                            <q-item-section side class="author-avatar-col">
                              <q-avatar rounded class="author-avatar">
                                <img :src="report.user.avatar_url" alt="Author avatar" />
                              </q-avatar>
                            </q-item-section>
                            <q-item-section class="author-meta-col">
                              <q-item-label class="author-name" :title="report.user.login">{{ report.user.login }}
                              </q-item-label>
                              <q-item-label caption class="author-count">{{ report.user.report_count }} reports
                              </q-item-label>
                            </q-item-section>
                          </q-item>

                          <q-item
                            v-else
                            class="author-group q-ma-none q-pa-none"
                            style="display:flex; align-items:center; flex:0 1 auto; min-width:0;"
                          >
                            <q-item-section side class="author-avatar-col">
                              <q-avatar rounded class="author-avatar">
                                <img :src="report.user.avatar_url" alt="Author avatar" />
                              </q-avatar>
                            </q-item-section>

                            <q-item-section class="author-meta-col">
                              <q-item-label class="author-name" :title="report.user.login">{{ report.user.login }}
                              </q-item-label>
                              <q-item-label caption class="author-count">{{ report.user.report_count }} reports
                              </q-item-label>
                            </q-item-section>
                          </q-item>
                          <q-space />
                          <q-separator v-if="$q.screen.gt.sm" vertical inset class="q-mr-sm" />
                          <!-- Source group -->
                          <div class="source-col">
                            <q-item class="q-ma-none q-pa-none">
                              <q-item-section>
                                <q-item-label caption>
                                  <a v-if="!report.external"
                                     :href="report.html_url" target="_blank" rel="noopener"
                                     style="text-decoration: none;">
                                    <q-chip square clickable class="q-ma-none q-pr-xs q-pl-xs">
                                      <q-avatar icon="fab fa-github" text-color="white" />
                                      source
                                    </q-chip>
                                  </a>
                                  <a v-else
                                     :href="report.html_url" target="_blank" rel="noopener"
                                     style="text-decoration: none;">
                                    <q-chip square clickable class="q-ma-none q-pr-xs q-pl-xs">
                                      <q-avatar text-color="white">
                                        <img :src="report.user.avatar_url">
                                      </q-avatar>
                                      source
                                    </q-chip>
                                  </a>
                                </q-item-label>
                                <q-item-label caption class="q-pt-xs q-pr-xs">
                                  <b>Last updated:</b> {{ lastUpdated(report.updated_at) }}
                                </q-item-label>
                                <q-item-label v-if="getVerificationPresentation(report)" caption
                                              class="q-pt-sm q-pr-xs">
                                  <q-chip
                                    square
                                    dense
                                    class="q-ma-none verification-chip"
                                    :color="getVerificationPresentation(report)?.color"
                                    text-color="white"
                                  >
                                    <q-avatar :icon="getVerificationPresentation(report)?.icon" text-color="white" />
                                    {{ getVerificationPresentation(report)?.label }}
                                    <span class="verification-chip__score">
                                      {{ getVerificationPresentation(report)?.likes }}
                                    </span>
                                    <q-tooltip>{{ getVerificationPresentation(report)?.tooltip }}</q-tooltip>
                                  </q-chip>
                                </q-item-label>
                              </q-item-section>
                            </q-item>
                          </div>
                        </div>

                        <!-- Right: Social action group -->
                        <div class="col-auto row items-center social-buttons q-gutter-sm">
                          <q-btn
                            v-if="false"
                            flat round
                            size="sm"
                            icon="chat_bubble"
                            aria-label="Open comments"
                            @click.stop="openCommentsDialog(report.id)">
                            <q-tooltip>Open comments</q-tooltip>
                            <q-badge color="blue" floating>
                              {{ report.comments }}
                            </q-badge>
                          </q-btn>

                          <q-btn
                            flat round
                            size="sm"
                            icon="thumb_up"
                            :color="hasUserReacted(report, 'up') ? 'positive' : 'grey-4'"
                            :loading="isReactionLoading(report.id)"
                            :disable="report.external"
                            aria-label="Like report"
                            @click.stop="handleReportReaction(report, 'up')">
                            <q-tooltip>
                              {{ hasUserReacted(report, 'up') ? 'Remove like' : 'Like this report' }}
                            </q-tooltip>
                            <q-badge
                              v-if="report.reactions.reactions_thumbs_up > 0"
                              color="green"
                              floating
                              style="transform: translate(6px, 3px);">
                              {{ report.reactions.reactions_thumbs_up }}
                            </q-badge>
                          </q-btn>

                          <q-btn-dropdown
                            flat round
                            size="sm"
                            dropdown-icon="share"
                            no-icon-animation
                            :content-style="{
                              minWidth: '100px',
                              backgroundColor: 'color-mix(in srgb, var(--q-dark) 95%, transparent)',
                              border: '1px solid rgba(255, 255, 255, 0.5)',
                              borderRadius: '0px 0px 3px 3px',
                              boxShadow: '2px 2px 10px rgba(0, 0, 0, 0.9)',
                            }"
                            aria-label="Share report"
                          >
                            <q-tooltip>Share this report</q-tooltip>
                            <q-list>
                              <q-item clickable v-close-popup @click="copyReportLink(report.id)">
                                <q-item-section avatar>
                                  <q-avatar icon="content_copy" />
                                </q-item-section>
                                <q-item-section>Copy link</q-item-section>
                                <q-item-section side>
                                  <q-icon name="open_in_new" />
                                </q-item-section>
                              </q-item>

                              <q-separator />

                              <q-item clickable v-close-popup @click="shareToReddit(report)">
                                <q-item-section avatar>
                                  <q-avatar>
                                    <q-avatar :icon="simReddit" />
                                  </q-avatar>
                                </q-item-section>
                                <q-item-section>Share to Reddit</q-item-section>
                                <q-item-section side>
                                  <q-icon name="open_in_new" />
                                </q-item-section>
                              </q-item>

                              <q-item clickable v-close-popup @click="shareToX(report)">
                                <q-item-section avatar>
                                  <q-avatar :icon="simX" />
                                </q-item-section>
                                <q-item-section>Share to X</q-item-section>
                                <q-item-section side>
                                  <q-icon name="open_in_new" />
                                </q-item-section>
                              </q-item>

                              <q-item clickable v-close-popup @click="shareToBluesky(report)">
                                <q-item-section avatar>
                                  <q-avatar :icon="simBluesky" />
                                </q-item-section>
                                <q-item-section>Share to Bluesky</q-item-section>
                                <q-item-section side>
                                  <q-icon name="open_in_new" />
                                </q-item-section>
                              </q-item>

                              <q-item clickable v-close-popup @click="shareToFacebook(report)">
                                <q-item-section avatar>
                                  <q-avatar :icon="simFacebook" />
                                </q-item-section>
                                <q-item-section>Share to Facebook</q-item-section>
                                <q-item-section side>
                                  <q-icon name="open_in_new" />
                                </q-item-section>
                              </q-item>
                            </q-list>
                          </q-btn-dropdown>

                          <q-btn flat round icon="flag" size="sm" aria-label="Flag report"
                                 @click.stop="openReportIssueDialog(report)">
                            <q-tooltip>Flag this report</q-tooltip>
                          </q-btn>
                        </div>
                      </div>

                      <!-- Comments dialog (PLACEHOLDER) -->
                      <q-dialog v-model="commentsDialogOpen" class="q-ma-none q-pa-none report-comments-dialog"
                                seamless no-refocus persistent>
                        <q-card>
                          <q-card-section>
                            <div class="text-h6">Comments</div>
                          </q-card-section>

                          <q-separator />

                          <q-card-section>
                            <!-- Placeholder for comments UI; will be implemented later -->
                            <p class="text-caption">Comments UI coming soon. This dialog will show the conversation for
                              this report (report id: {{ commentsTargetReportId }}).</p>
                          </q-card-section>

                          <q-card-actions align="right">
                            <q-btn flat label="Close" color="primary" @click="closeCommentsDialog" />
                          </q-card-actions>
                        </q-card>
                      </q-dialog>

                      <LoginPromptDialog :show="loginPromptDialogOpen" @update:show="loginPromptDialogOpen = $event" />

                      <!-- Flag / Report Issue dialog -->
                      <q-dialog v-model="reportIssueDialogOpen" class="q-ma-none q-pa-none report-issue-dialog"
                                seamless no-refocus persistent>
                        <q-card style="min-width: 320px; max-width: 720px;">
                          <q-card-section>
                            <div class="text-h6">Flag report</div>
                          </q-card-section>

                          <q-separator />

                          <q-card-section>
                            <div class="q-gutter-sm">
                              <q-select
                                v-model="reportIssueSelectedOption"
                                :options="reportIssueOptionsEffective"
                                option-value="value"
                                option-label="label"
                                label="Reason"
                                emit-value
                                map-options
                                outlined
                              />

                              <div v-if="reportIssueDescription" class="q-my-lg q-mx-md">
                                <div class="text-subtitle2">Explanation:</div>
                                <div class="text-caption q-mt-sm">{{ reportIssueDescription }}</div>
                              </div>

                              <div v-if="reportIssueSelectedOption === 'mark-duplicate'">
                                <q-select
                                  v-model="reportIssueDuplicateTarget"
                                  :options="reportIssueDuplicateOptions"
                                  option-value="value"
                                  option-label="label"
                                  label="Select duplicate report"
                                  emit-value
                                  map-options
                                  outlined
                                />
                              </div>

                              <div v-if="reportIssueSelectedOption !== 'mark-duplicate'">
                                <q-input
                                  v-model="reportIssueMessage"
                                  type="textarea"
                                  rows="3"
                                  label="Brief Message (explain why you're raising this)"
                                  outlined
                                  :rules="[val => !!val || 'Message is required']"
                                  hint="Be specific so the report author knows what to change"
                                />
                              </div>
                            </div>
                          </q-card-section>

                          <q-card-actions align="right">
                            <q-btn flat label="Cancel" color="primary" @click="closeReportIssueDialog" />
                            <q-btn
                              flat
                              label="Submit"
                              color="primary"
                              :disable="(reportIssueSelectedOption !== 'mark-duplicate' && !reportIssueMessage) || (reportIssueSelectedOption === 'mark-duplicate' && !reportIssueDuplicateTarget)"
                              @click="submitReportIssue"
                            />
                          </q-card-actions>
                        </q-card>
                      </q-dialog>
                    </div>
                  </q-expansion-item>
                </q-item>
              </q-list>

            </div>
            <div v-else class="no-reports-container">
              <div class="no-reports-card">
                <p class="text-center text-body1">No reports found for this game.</p>
                <p class="text-center text-body1">Would you like to be the first?</p>
                <!--                <div class="text-center q-mt-md">
                                  <q-btn
                                    class="full-width-sm"
                                    icon="fab fa-github"
                                    :href="githubSubmitReportLink"
                                    target="_blank" rel="noopener"
                                    label="Submit a Report"
                                    color="white"
                                    text-color="black"
                                    no-caps
                                  />
                                </div>-->
              </div>
            </div>

            <!-- START MOBILE-ONLY PAGE TEXT -->
            <div class="mobile-reports-insight lt-sm q-mt-xl">
              <div class="mobile-reports-insight__badge">Insights</div>
              <div class="mobile-reports-insight__content q-mt-md">
                <h3 class="mobile-reports-insight__title">Help out</h3>
                <p>
                  Dialed in a great setup? Tap the <em>Submit Report</em> button above to share
                  your configuration and help fellow players discover the best way to enjoy
                  {{ gameName || 'this game' }} on your preferred handheld.
                </p>
              </div>
              <div v-if="gameReportsSummary" class="mobile-reports-insight__summary q-mt-lg">
                <h3 class="mobile-reports-insight__title">Reports Summary</h3>
                <p>
                  {{ gameReportsSummary }}
                </p>
              </div>
            </div>
            <!-- END MOBILE-ONLY PAGE TEXT -->
          </div>
        </div>
      </div>
    </div>
  </div>

  <q-dialog class="q-ma-none q-pa-none comparison-dialog"
            backdrop-filter="blur(2px)"
            seamless
            no-refocus
            full-height
            :full-width="$q.screen.lt.md"
            :maximized="$q.screen.lt.md"
            v-model="comparisonDialogOpen">
    <GameReportComparison
      :reports="compareReports"
      @clear="clearCompareReports"
      @close="comparisonDialogOpen = false"
    />
  </q-dialog>
</template>

<style scoped>

.side-prompt-stack {
  position: fixed;
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.side-prompt-stack-web {
  top: 100px;
}

.side-prompt-stack-mobile {
  top: 70px;
}

.compare-dialog-trigger {
  border-radius: 16px 0 0 16px;
}

.compare-dialog-trigger-button {
  border-radius: 16px 0 0 16px;
  padding: 6px 12px;
  display: flex;
  align-items: center;
  gap: 0;
}

.compare-dialog-trigger-button .compare-trigger-label {
  max-width: 0;
  opacity: 0;
  margin-left: 0;
  overflow: hidden;
  white-space: nowrap;
  transition: max-width 0.2s ease, opacity 0.2s ease, margin-left 0.2s ease;
}

.compare-dialog-trigger-button:hover .compare-trigger-label,
.compare-dialog-trigger-button:focus-visible .compare-trigger-label {
  max-width: 200px;
  opacity: 1;
  margin-left: 8px;
}

.game-data-item {
  position: relative;
}

.background-container {
  background-size: cover;
  background-position: center;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 800px;
  z-index: 0;
}

.background-container-mobile::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: /* Top fade */ linear-gradient(to bottom, transparent 20%, rgba(0, 0, 0, 0.6) 50%, var(--q-dark) 100%),
    /* Left fade */ linear-gradient(to right, var(--q-dark) 0%, transparent 30%, transparent 70%, var(--q-dark) 100%),
    /* Right fade */ linear-gradient(to left, var(--q-dark) 0%, transparent 30%, transparent 70%, var(--q-dark) 100%);
  mix-blend-mode: darken; /* Ensures darker areas blend naturally with the image */
  z-index: 1; /* Place it above the background image */
}

.page-content-container {
  position: relative;
}

.verification-chip {
  letter-spacing: 0.01em;
}

.verification-chip__score {
  margin-left: 6px;
  font-weight: 700;
}

.verification-dialog-trigger {
  max-width: min(320px, calc(100vw - 24px));
}

.verification-dialog-trigger-card {
  border-radius: 16px 0 0 16px;
  background: color-mix(in srgb, var(--q-dark) 88%, rgba(255, 255, 255, 0.12));
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(10px);
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.25);
  border-right: 0;
}

.verification-dialog-trigger-content {
  padding: 10px 12px 10px 14px;
}

.verification-dialog-trigger-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.verification-dialog-trigger-title {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.92);
}

.verification-dialog-trigger-header :deep(.q-btn) {
  margin-left: auto;
}

.verification-dialog-trigger-copy {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.86);
}

.verification-dialog-trigger-actions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  flex-wrap: nowrap;
  margin-top: 12px;
}

.verification-dialog-trigger-actions :deep(.q-btn) {
  flex: 0 0 auto;
  min-width: auto;
  padding: 4px 8px;
}

.game-title {
  margin-top: 0;
  margin-bottom: 15px;
  text-shadow: 2px 2px 4px black;
}

.game-image-container {
  margin-left: auto;
  margin-right: auto;
  margin-bottom: 20px;
  box-shadow: 5px 5px 10px black;
  overflow: hidden;
}

.game-banner {
  max-width: 100%;
  height: auto;
}

.filters,
.sorting {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
}

.filters {
  flex-wrap: wrap;
  gap: 8px;
}

.filter-container,
.sorting-container {
  background-color: color-mix(in srgb, var(--q-dark) 80%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 3px;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
  min-height: 42px;
  padding-left: 10px;
  padding-right: 3px;
}

.sorting-container {
  padding: 3px;
}

.filter-container {
  flex: 0 1 220px;
  min-width: 210px;
}

.sorting {
  margin-left: auto;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}

.filter-select {
  width: 210px;
}

.hide-duplicates-toggle {
  white-space: nowrap;
  width: 100%;
  margin-top: 10px;
}

/* Report Body */
.top-right {
  position: absolute;
  top: 10px;
  right: 10px;
}

.no-reports-container {
  height: 400px;
}

.no-reports-card {
  background-color: color-mix(in srgb, var(--q-dark) 80%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 3px;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
  padding: 50px 20px;
  text-align: center;
}

.game-data-item {
  background-color: color-mix(in srgb, var(--q-dark) 80%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 3px;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
  padding: 10px;
  border-left-width: 6px;
}

.report-status-cluster {
  position: absolute;
  top: -11px;
  right: -11px;
  z-index: 10;
  display: flex;
  align-items: stretch;
  gap: 0;
}

.report-status-cluster :deep(.q-chip) {
  margin: 0 !important;
}

.report-corner-chip {
  position: relative;
}

.report-status-chip {
  margin-right: -1px;
}

.report-status-chip :deep(.q-avatar) {
  font-size: 14px;
}

.report-status-chip :deep(.q-chip__content) {
  gap: 4px;
}

.report-status-chip__count {
  margin-left: 6px;
}

.report-corner-chip-left {
  border-radius: 0 0 0 12px;
}

.report-corner-chip-single {
  border-radius: 0 3px 0 12px;
}

.report-tier-gold {
  border-left-color: #d4a017;
  box-shadow: 0 0 0 1px rgba(212, 160, 23, 0.2), 2px 2px 10px rgba(0, 0, 0, 0.2);
}

.report-tier-silver {
  border-left-color: #b0bec5;
  box-shadow: 0 0 0 1px rgba(176, 190, 197, 0.2), 2px 2px 10px rgba(0, 0, 0, 0.2);
}

.report-tier-bronze {
  border-left-color: #c97843;
  box-shadow: 0 0 0 1px rgba(201, 120, 67, 0.2), 2px 2px 10px rgba(0, 0, 0, 0.2);
}

.report-tier-standard {
  border-left-color: #8bc34a;
}

.report-tier-none {
  border-left-color: rgba(255, 255, 255, 0.25);
}

.report-corner-chip-right {
  border-radius: 0 0 0 0;
}

.report-status-chip--duplicate :deep(.q-avatar) {
  font-size: 13px;
}

.compare-select-btn {
  position: absolute;
  top: -11px;
  left: -11px;
  z-index: 10;
  padding: 0;
  color: var(--q-primary) !important;
  background-color: color-mix(in srgb, var(--q-primary) 25%, transparent);
  border: 1px solid color-mix(in srgb, var(--q-primary) 60%, transparent);
  border-radius: 3px 0 12px 0;
  transition: background-color 0.15s ease, border-color 0.15s ease;
  text-decoration: none !important;
}

.compare-select-btn:hover,
.compare-select-btn:focus-visible {
  background-color: color-mix(in srgb, var(--q-primary) 32%, transparent);
  border-color: color-mix(in srgb, var(--q-primary) 70%, transparent);
}

.compare-select-btn-selected {
  color: var(--q-positive) !important;
  background-color: color-mix(in srgb, var(--q-positive) 28%, transparent);
  border-color: color-mix(in srgb, var(--q-positive) 70%, transparent);
}

.compare-select-btn-selected:hover,
.compare-select-btn-selected:focus-visible {
  background-color: color-mix(in srgb, var(--q-positive) 36%, transparent);
  border-color: color-mix(in srgb, var(--q-positive) 80%, transparent);
}

.compare-select-btn :deep(.q-icon) {
  transition: color 0.2s ease;
}

::v-deep(.game-data-item-expand-button) {
  padding: 0;
  color: var(--q-primary) !important;
  background-color: color-mix(in srgb, var(--q-primary) 25%, transparent);
  border: 1px solid color-mix(in srgb, var(--q-primary) 60%, transparent);
  border-radius: 16px;
  transition: background-color 0.15s ease, border-color 0.15s ease;
  text-decoration: none !important;
}

::v-deep(.game-data-item-expand-button):hover,
::v-deep(.game-data-item-expand-button):focus {
  background-color: color-mix(in srgb, var(--q-primary) 32%, transparent);
  border-color: color-mix(in srgb, var(--q-primary) 70%, transparent);
}

.mobile-reports-insight {
  background-color: color-mix(in srgb, var(--q-dark) 80%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 3px;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
  padding: 10px 10px 10px 18px;
  backdrop-filter: blur(6px);
  position: relative;
}

.mobile-reports-insight__badge {
  position: absolute;
  top: 14px;
  right: 14px;
  display: inline-block;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 6px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--q-primary) 20%, transparent);
  color: color-mix(in srgb, white 90%, transparent);
}

.mobile-reports-insight__summary {
  border-top: 1px solid color-mix(in srgb, white 12%, transparent);
  padding-top: 14px;
}

.mobile-reports-insight__title {
  font-size: 1.05rem;
  margin-bottom: 10px;
  font-weight: 600;
}

.mobile-reports-insight strong {
  color: color-mix(in srgb, white 97%, transparent);
}

.mobile-reports-insight em {
  font-style: italic;
  font-weight: 600;
  color: var(--q-secondary);
}

.config-card {
  background-color: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
}

.config-card .config-list {
  display: flex;
  flex-direction: column;
}

.config-card .config-item {
  display: flex;
  justify-content: space-between;
  padding: 12px 5px;
  border-bottom: 1px solid #ddd;
}

.config-card .config-item:last-child {
  border-bottom: none;
}

.config-card .config-item span:first-child {
  font-weight: bold;
  flex: 1;
}

.config-card .config-item span:last-child {
  text-align: right;
  min-width: 100px;
}

.rotate-down {
  transform: rotate(0deg);
  transition: transform 0.3s ease;
}

.rotate-right {
  transform: rotate(-90deg);
  transition: transform 0.3s ease;
}

.game-config.hidden {
  display: none;
}

.game-config {
  transition: all 0.3s ease-in-out;
}

.report-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: nowrap;
}

.report-footer .author-block {
  display: flex;
  align-items: center;
  gap: 12px;
}

.report-footer .author-source-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.report-footer .author-avatar-col {
  flex: 0 0 auto;
  padding: 0;
}

.report-footer .author-avatar {
  width: 48px;
  height: 48px;
  display: inline-block;
  overflow: hidden;
  border-radius: 6px;
}

.report-footer .author-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.report-footer .author-meta-col {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  flex: 1 1 0;
  overflow: hidden;
  margin-top: 6px;
}

.report-footer .author-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 auto;
  min-width: 0;
  width: auto;
}

.report-footer .author-link {
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  min-width: 0;
}

.report-footer .author-name {
  font-weight: 600;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.report-footer .author-count {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 10px;
}

.report-footer .source-col {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  flex: 0 0 auto;
  text-align: left;
}

.report-footer .social-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.report-footer .social-buttons .q-badge {
  transform-origin: center;
}

@media (max-width: 299.98px) {
  .game-banner-badges {
    display: none !important;
  }
}

@media (max-width: 599.98px) {
  .side-prompt-stack {
    gap: 8px;
  }

  .verification-dialog-trigger {
    max-width: min(280px, calc(100vw - 16px));
  }

  .verification-dialog-trigger-content {
    padding: 10px 10px 10px 12px;
  }

  .verification-dialog-trigger-copy {
    font-size: 0.86rem;
  }

  .verification-dialog-trigger-actions {
    gap: 6px;
  }

  .duplicate-chip-text {
    display: none;
  }

  .report-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .report-footer .author-block {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    width: 100%;
    gap: 12px;
    padding-bottom: 8px;
  }

  .report-footer .social-buttons {
    order: 2;
    display: flex;
    justify-content: space-around;
    width: 100%;
    padding-top: 8px;
    padding-bottom: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
  }

  .report-footer .social-buttons q-btn {
    flex: 1 1 auto;
    justify-content: center;
  }

  .report-footer .author-avatar {
    width: 40px;
    height: 40px;
  }

  .report-footer .author-name {
    font-size: 0.95rem;
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
  }
}

@media (max-width: 1023.98px) {
  .sorting {
    width: 100%;
    margin-left: 0;
    margin-top: 8px;
  }

  .report-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .report-footer .author-block {
    order: 1;
    width: 100%;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 12px;
    padding-bottom: 8px;
    flex-wrap: nowrap;
  }

  .report-footer .source-col {
    text-align: right;
  }

  .report-footer .social-buttons {
    order: 2;
    width: 100%;
    display: flex;
    justify-content: space-around;
    gap: 12px;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.03);
  }

  .report-footer .social-buttons q-btn {
    flex: 1 1 auto;
    justify-content: center;
  }
}

/* -sm- */
@media (min-width: 600px) {
  .background-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: /* Top fade */ linear-gradient(to bottom, transparent 20%, rgba(0, 0, 0, 0.6) 50%, var(--q-dark) 100%),
      /* Left fade */ linear-gradient(to right, var(--q-dark) 0%, transparent 30%, transparent 70%, var(--q-dark) 100%),
      /* Right fade */ linear-gradient(to left, var(--q-dark) 0%, transparent 30%, transparent 70%, var(--q-dark) 100%);
    mix-blend-mode: darken; /* Ensures darker areas blend naturally with the image */
    z-index: 1; /* Place it above the background image */
  }

  .game-image-container {
    max-width: 400px;
  }

  .config-card .config-item {
    padding: 12px 16px;
  }
}

/* -md- */
@media (min-width: 1024px) {
  .game-links {
    position: sticky;
    top: 120px;
  }
}


/* -lg- */
@media (min-width: 1440px) {
  .game-image-container {
    max-width: 500px;
  }
}

/* -xl- */
@media (min-width: 1920px) {
  .game-image-container {
    max-width: 600px;
  }
}

</style>
