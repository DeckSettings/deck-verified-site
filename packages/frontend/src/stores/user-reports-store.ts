import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPublicUserReports, getUserReports } from 'src/utils/api'
import type { UserGameReport, UserReportsPageResponse } from 'src/utils/api'

export const useUserReportsStore = defineStore('user-reports', () => {
  const reports = ref<UserGameReport[]>([])
  const pageData = ref<UserReportsPageResponse | null>(null)
  const isLoading = ref(false)
  const currentLogin = ref<string | null>(null)

  const setPageData = (data: UserReportsPageResponse | null, login: string | null) => {
    pageData.value = data
    reports.value = data?.reports || []
    currentLogin.value = login
  }

  const fetchOwnReports = async (githubToken: string, dvToken: string) => {
    if (isLoading.value) return
    isLoading.value = true
    try {
      const data = await getUserReports(githubToken, dvToken)
      setPageData(data, data?.user.login || null)
    } catch (error) {
      console.error('Failed to fetch reports:', error)
    } finally {
      isLoading.value = false
    }
  }

  const fetchPublicReports = async (login: string) => {
    if (isLoading.value) return
    isLoading.value = true
    try {
      const data = await getPublicUserReports(login)
      setPageData(data, login)
    } catch (error) {
      console.error('Failed to fetch public reports:', error)
    } finally {
      isLoading.value = false
    }
  }

  const clear = () => {
    setPageData(null, null)
  }

  return {
    reports,
    pageData,
    isLoading,
    currentLogin,
    fetchOwnReports,
    fetchPublicReports,
    clear,
  }
})
