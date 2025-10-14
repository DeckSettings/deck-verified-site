<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useAuthStore } from 'src/stores/auth-store'
import { useUserReportsStore } from 'src/stores/user-reports-store'
import type { UserGameReport, HomeReport } from 'src/utils/api'
import ReportForm from 'src/components/ReportForm.vue'
import ReportList from 'components/elements/ReportList.vue'
import { QAjaxBar, useQuasar } from 'quasar'
import PageHeader from 'components/elements/PageHeader.vue'
import { updateIssueState, deleteIssue } from 'src/utils/gh-api'

const ajaxBar = ref<QAjaxBar | null>(null)
const $q = useQuasar()

const authStore = useAuthStore()
const userReportsStore = useUserReportsStore()

const reports = computed(() => userReportsStore.reports)
const isLoading = computed(() => userReportsStore.isLoading)

const reportFormDialogOpen = ref<boolean>(false)
const selectedReport = ref<UserGameReport | null>(null)
const searchTerm = ref('')

const homeReports = computed<HomeReport[]>(() => {
  return reports.value.map(report => ({
    id: report.issueId,
    // Attach the full GitHub issue object for user reports.
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
      report_count: null, // Not available
    },
    reviewScore: 'neutral', // Not calculated
  }))
})

const filteredReports = computed(() => {
  if (!searchTerm.value) {
    return homeReports.value
  }
  return homeReports.value.filter(report => {
    const gameName = report.data.game_name.toLowerCase()
    const summary = report.data.summary.toLowerCase()
    const search = searchTerm.value.toLowerCase()
    return gameName.includes(search) || summary.includes(search)
  })
})

const fetchReports = async () => {
  if (!authStore.isLoggedIn || !authStore.accessToken || !authStore.dvToken) {
    return
  }
  if (ajaxBar.value) {
    ajaxBar.value.start()
  }
  try {
    await userReportsStore.fetchReports(authStore.accessToken, authStore.dvToken)
  } finally {
    // Ensure we stop the ajax bar after loading
    if (ajaxBar.value) {
      ajaxBar.value.stop()
    }
  }
}

const editReport = (issueNumber: number) => {
  const report = reports.value.find(r => r.issue?.number === issueNumber)
  if (report) {
    selectedReport.value = report
    reportFormDialogOpen.value = true
  }
}

const handleUpdateReportState = async ({ issueNumber, state }: { issueNumber: number, state: 'open' | 'closed' }) => {
  if (!authStore.isLoggedIn || !authStore.accessToken || !authStore.dvToken) {
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
  if (!authStore.isLoggedIn || !authStore.accessToken || !authStore.dvToken) {
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

const refreshVersion = ref(0)
const handleRefresh = async (done: () => void) => {
  fetchReports().finally(async () => {
    refreshVersion.value++
    await nextTick()
    done()
  })
}

watch(() => authStore.isLoggedIn, (isLoggedIn) => {
  if (isLoggedIn) {
    fetchReports()
  }
}, { immediate: true })
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
      <PageHeader v-if="!$q.platform.isMobileUi" title="My Reports" :show-nav-back-button="true" />
      <div class="page-content-container">
        <template v-if="!authStore.isLoggedIn">
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
            <q-card-section v-if="$q.platform.isMobileUi" class="row items-center justify-between">
              <h4 class="text-h6 q-ma-none">My Reports</h4>
            </q-card-section>
            <q-card-section class="q-mb-sm q-mt-sm q-pt-none q-px-sm-sm q-px-xs" :class="{ 'no-padding': $q.platform.is.mobile }">
              <q-input
                v-model="searchTerm"
                filled
                dense
                placeholder="Filter by game name or summary"
              >
                <template v-slot:append>
                  <q-icon name="filter_alt" />
                </template>
              </q-input>
            </q-card-section>
            <q-card-section class="q-pt-none q-px-sm-sm q-px-xs" :class="{ 'no-padding': $q.platform.is.mobile }">
              <ReportList
                :key="`recentlyCreated-${refreshVersion}`"
                :reports-list="filteredReports"
                :edit-mode="true"
                @edit-report="editReport"
                @update-report-state="handleUpdateReportState"
                @delete-report="handleDeleteReport" />
              <div v-if="isLoading" class="flex flex-center q-mt-md">
                <q-spinner-dots color="primary" size="40px" />
              </div>
              <div v-if="!isLoading && filteredReports.length === 0" class="flex flex-center q-mt-md">
                <p>No reports found.</p>
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

</style>
