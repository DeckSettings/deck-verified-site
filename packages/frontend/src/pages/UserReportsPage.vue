<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useAuthStore } from 'src/stores/auth-store'
import { useUserReportsStore } from 'src/stores/user-reports-store'
import type { UserGameReport, HomeReport } from 'src/utils/api'
import ReportForm from 'src/components/ReportForm.vue'
import ReportList from 'components/elements/ReportList.vue'
import { QAjaxBar } from 'quasar'
import { useGithubActionsMonitor } from 'src/composables/useGithubActionsMonitor'
import PageHeader from 'components/elements/PageHeader.vue'

const ajaxBar = ref<QAjaxBar | null>(null)

const authStore = useAuthStore()
const userReportsStore = useUserReportsStore()
const { monitorIssue } = useGithubActionsMonitor()

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

const pendingMonitorPayload = ref<{ issueNumber: number; issueUrl: string; createdAt: string } | null>(null)
const handleReportSubmitted = (payload: { issueNumber: number; issueUrl: string; createdAt: string }) => {
  pendingMonitorPayload.value = payload
  reportFormDialogOpen.value = false
}

watch(reportFormDialogOpen, (open) => {
  if (!open && pendingMonitorPayload.value) {
    const payload = pendingMonitorPayload.value
    pendingMonitorPayload.value = null
    void monitorIssue(payload)
  }
})

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
    <q-page class="bg-dark text-white q-pb-xl" padding>
      <q-ajax-bar
        ref="ajaxBar"
        position="bottom"
        color="secondary"
        size="5px"
        skip-hijack
      />
      <PageHeader title="My Reports" :show-nav-back-button="true" />
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
          <div>
            <q-input
              v-model="searchTerm"
              filled
              dense
              placeholder="Filter by game name or summary"
              class="q-mb-md q-mt-none q-mt-sm-lg"
            >
              <template v-slot:append>
                <q-icon name="filter_alt" />
              </template>
            </q-input>
          </div>
          <div>
            <ReportList
              :key="`recent-${refreshVersion}`"
              :reports-list="filteredReports"
              :edit-mode="true"
              @edit-report="editReport" />
            <div v-if="isLoading" class="flex flex-center q-mt-md">
              <q-spinner-dots color="primary" size="40px" />
            </div>
            <div v-if="!isLoading && filteredReports.length === 0" class="flex flex-center q-mt-md">
              <p>No reports found.</p>
            </div>
          </div>
        </template>
        <q-dialog
          v-model="reportFormDialogOpen"
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
            :display-fullscreen="true"
            @submitted="handleReportSubmitted"
          />
        </q-dialog>
      </div>
    </q-page>
  </q-pull-to-refresh>
</template>