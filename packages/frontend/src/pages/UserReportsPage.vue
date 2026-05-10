<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useMeta, QAjaxBar, useQuasar } from 'quasar'
import { useAuthStore } from 'src/stores/auth-store'
import { useUserReportsStore } from 'src/stores/user-reports-store'
import type { ContributorSummary, HomeReport, UserGameReport } from 'src/utils/api'
import ReportForm from 'src/components/ReportForm.vue'
import ReportList from 'components/elements/ReportList.vue'
import PageHeader from 'components/elements/PageHeader.vue'
import { updateIssueState, deleteIssue } from 'src/utils/gh-api'

const ajaxBar = ref<QAjaxBar | null>(null)
const $q = useQuasar()
const route = useRoute()

const authStore = useAuthStore()
const userReportsStore = useUserReportsStore()

const reportFormDialogOpen = ref(false)
const selectedReport = ref<UserGameReport | null>(null)
const searchTerm = ref('')
const refreshVersion = ref(0)

const routeLogin = computed(() =>
  typeof route.params.login === 'string' && route.params.login.trim().length > 0
    ? route.params.login.trim()
    : null,
)
const viewerLogin = computed(() => authStore.user?.login || null)
const isOwnLoginRoute = computed(() =>
  Boolean(routeLogin.value && viewerLogin.value && routeLogin.value.toLowerCase() === viewerLogin.value.toLowerCase()),
)
const shouldUseOwnerView = computed(() =>
  Boolean(authStore.isLoggedIn && authStore.accessToken && authStore.dvToken && (route.name === 'user-reports' || isOwnLoginRoute.value)),
)
const needsLoginForSelfView = computed(() => route.name === 'user-reports' && !shouldUseOwnerView.value)

const pageData = computed(() => userReportsStore.pageData)
const reports = computed(() => userReportsStore.reports)
const isLoading = computed(() => userReportsStore.isLoading)
const displayLogin = computed(() => pageData.value?.user.login || routeLogin.value || viewerLogin.value || 'User')
const pageTitle = computed(() => shouldUseOwnerView.value ? 'My Reports' : `${displayLogin.value}'s Reports`)
const profileHeaderTitle = computed(() => shouldUseOwnerView.value ? displayLogin.value : `@${displayLogin.value}`)
const pageSubtitle = computed(() => shouldUseOwnerView.value
  ? 'Your contributor profile and submitted reports.'
  : 'Contributor profile and published reports.')
const stats = computed<ContributorSummary | null>(() => pageData.value?.stats || null)
const canManageReports = computed(() => shouldUseOwnerView.value)

useMeta(() => ({
  title: pageTitle.value,
}))

const homeReports = computed<HomeReport[]>(() => {
  return reports.value.map(report => ({
    id: report.issueId,
    issue: report.issue,
    data: report.parsedReport,
    metadata: report.metadata || {
      poster: null,
      hero: null,
      banner: null,
      background: null,
    },
    reactions: {
      reactions_thumbs_up: report.issue.reactions?.['+1'] || 0,
      reactions_thumbs_down: report.issue.reactions?.['-1'] || 0,
    },
    user: {
      login: report.issue.user.login,
      avatar_url: report.issue.user.avatar_url,
      report_count: null,
    },
    reviewScore: 'neutral',
  }))
})

const filteredReports = computed(() => {
  if (!searchTerm.value) {
    return homeReports.value
  }
  const search = searchTerm.value.toLowerCase()
  return homeReports.value.filter((report) => {
    const gameName = report.data.game_name.toLowerCase()
    const summary = report.data.summary.toLowerCase()
    return gameName.includes(search) || summary.includes(search)
  })
})

const fetchReports = async () => {
  if (ajaxBar.value) {
    ajaxBar.value.start()
  }

  try {
    if (shouldUseOwnerView.value && authStore.accessToken && authStore.dvToken) {
      await userReportsStore.fetchOwnReports(authStore.accessToken, authStore.dvToken)
      return
    }

    if (routeLogin.value) {
      await userReportsStore.fetchPublicReports(routeLogin.value)
      return
    }

    userReportsStore.clear()
  } finally {
    if (ajaxBar.value) {
      ajaxBar.value.stop()
    }
  }
}

const editReport = (issueNumber: number) => {
  if (!canManageReports.value) return
  const report = reports.value.find(r => r.issue?.number === issueNumber)
  if (report) {
    selectedReport.value = report
    reportFormDialogOpen.value = true
  }
}

const handleUpdateReportState = async ({ issueNumber, state }: { issueNumber: number, state: 'open' | 'closed' }) => {
  if (!canManageReports.value || !authStore.isLoggedIn || !authStore.accessToken || !authStore.dvToken) {
    return
  }

  const report = reports.value.find(r => r.issue?.number === issueNumber)
  if (!report) {
    $q.notify({ type: 'negative', message: 'ERROR! Could not find report details to update.' })
    return
  }

  const ajax = ajaxBar.value
  if (ajax) ajax.start()
  try {
    await updateIssueState(issueNumber, state)
    $q.notify({
      type: 'positive',
      message: `Report successfully ${state === 'open' ? 're-opened' : 'closed'}.`,
    })
    await fetchReports()
  } catch (error) {
    console.error('Failed to update report state:', error)
    $q.notify({
      type: 'negative',
      message: `Failed to ${state === 'open' ? 're-open' : 'close'} report. Please try again.`,
    })
  } finally {
    if (ajax) ajax.stop()
  }
}

const handleDeleteReport = async (issueNumber: number) => {
  if (!canManageReports.value || !authStore.isLoggedIn || !authStore.accessToken || !authStore.dvToken) {
    return
  }

  const report = reports.value.find(r => r.issue?.number === issueNumber)
  if (!report) {
    $q.notify({ type: 'negative', message: 'ERROR! Could not find report details to delete.' })
    return
  }

  if (report.issue?.state !== 'closed') {
    $q.notify({ type: 'negative', message: 'Report must be closed before it can be deleted.' })
    return
  }

  const ajax = ajaxBar.value
  if (ajax) ajax.start()
  try {
    await deleteIssue(issueNumber)
    $q.notify({
      type: 'positive',
      message: 'The report has been marked to be permanently deleted.',
    })
    await fetchReports()
  } catch (error) {
    console.error('Failed to delete report:', error)
    $q.notify({
      type: 'negative',
      message: 'Failed to delete report. Please try again.',
    })
  } finally {
    if (ajax) ajax.stop()
  }
}

const handleRefresh = async (done: () => void) => {
  fetchReports().finally(async () => {
    refreshVersion.value++
    await nextTick()
    done()
  })
}

watch(
  () => [route.fullPath, authStore.isLoggedIn, authStore.accessToken, authStore.dvToken, authStore.user?.login],
  () => {
    void fetchReports()
  },
  { immediate: true },
)
</script>

<template>
  <q-pull-to-refresh class="fit" no-mouse @refresh="handleRefresh">
    <q-page class="bg-dark text-white"
            :class="{'q-pb-xl q-pa-md':!$q.platform.isMobileUi}">
      <q-ajax-bar
        ref="ajaxBar"
        :position="$q.platform.isMobileUi ? 'top' : 'bottom'"
        color="secondary"
        size="5px"
        skip-hijack
      />
      <PageHeader
        v-if="!$q.platform.isMobileUi"
        :title="pageTitle"
        :subtitle="pageSubtitle"
        :show-nav-back-button="true"
      />
      <div class="page-content-container">
        <template v-if="needsLoginForSelfView">
          <q-card>
            <q-card-section>
              <div class="text-h6">Please log in</div>
              <p>You need to be logged in to manage your reports.</p>
              <q-btn color="primary" @click="authStore.startLogin">Log In</q-btn>
            </q-card-section>
          </q-card>
        </template>
        <template v-else>
          <q-card class="reports-card text-white q-pa-xs">
            <q-card-section class="reports-profile-header" :class="{ 'q-pb-sm': $q.platform.isMobileUi }">
              <div class="row items-center q-col-gutter-md">
                <div class="col-auto">
                  <q-avatar size="64px" class="reports-profile-avatar">
                    <img v-if="pageData?.user.avatar_url" :src="pageData.user.avatar_url" :alt="displayLogin">
                    <span v-else>{{ displayLogin.slice(0, 2).toUpperCase() }}</span>
                  </q-avatar>
                </div>
                <div class="col">
                  <div class="row items-center q-gutter-sm">
                    <h4 class="text-h6 q-ma-none">{{ profileHeaderTitle }}</h4>
                    <q-chip v-if="canManageReports" size="sm" color="primary" text-color="white" icon="edit_note">
                      Owner View
                    </q-chip>
                  </div>
                  <div v-if="stats" class="reports-profile-stats row q-gutter-sm q-mt-sm">
                    <q-chip size="sm" color="grey-9" text-color="white" icon="description">
                      {{ stats.report_count }} reports
                    </q-chip>
                    <q-chip size="sm" color="grey-9" text-color="white" icon="sports_esports">
                      {{ stats.games_covered }} games
                    </q-chip>
                    <q-chip size="sm" color="grey-9" text-color="white" icon="devices_other">
                      {{ stats.devices_covered }} devices
                    </q-chip>
                    <q-chip size="sm" color="grey-9" text-color="white" icon="thumb_up">
                      {{ stats.likes_received }} likes
                    </q-chip>
                  </div>
                </div>
              </div>
            </q-card-section>
            <q-card-section class="q-mb-sm q-mt-sm q-pt-none q-px-sm-sm q-px-xs"
                            :class="{ 'no-padding': $q.platform.is.mobile }">
              <q-input
                v-model="searchTerm"
                filled
                dense
                placeholder="Filter by game name or summary"
              >
                <template #append>
                  <q-icon name="filter_alt" />
                </template>
              </q-input>
            </q-card-section>
            <q-card-section class="q-pt-none q-px-sm-sm q-px-xs" :class="{ 'no-padding': $q.platform.is.mobile }">
              <ReportList
                :key="`user-reports-${refreshVersion}-${displayLogin}`"
                :reports-list="filteredReports"
                :edit-mode="canManageReports"
                @edit-report="editReport"
                @update-report-state="handleUpdateReportState"
                @delete-report="handleDeleteReport"
              />
              <div v-if="isLoading" class="flex flex-center q-mt-md">
                <q-spinner-dots color="primary" size="40px" />
              </div>
              <div v-if="!isLoading && filteredReports.length === 0" class="flex flex-center q-mt-md text-center">
                <p>
                  {{ canManageReports ? 'No reports found.' : `${displayLogin} does not have any public reports to show here yet.`
                  }}
                </p>
              </div>
            </q-card-section>
          </q-card>
        </template>
        <q-dialog
          v-model="reportFormDialogOpen"
          backdrop-filter="blur(2px)"
          full-height
          :full-width="$q.screen.lt.md"
          :maximized="$q.screen.lt.md"
          @hide="reportFormDialogOpen = false">
          <ReportForm
            v-if="selectedReport"
            :app-id="selectedReport.parsedReport.app_id?.toString() || ''"
            :game-name="selectedReport.parsedReport.game_name"
            :issue-number="selectedReport.issue.number"
            :existing-report="selectedReport.parsedReport"
            :game-banner="''"
            @cancel="reportFormDialogOpen = false"
          />
        </q-dialog>
      </div>
    </q-page>
  </q-pull-to-refresh>
</template>

<style scoped>
.reports-profile-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.reports-profile-avatar {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
}

.reports-profile-stats {
  row-gap: 8px;
}
</style>
