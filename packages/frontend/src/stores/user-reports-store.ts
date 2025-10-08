import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getUserReports } from 'src/utils/api'
import type { UserGameReport } from 'src/utils/api'

export const useUserReportsStore = defineStore('user-reports', () => {
  const reports = ref<UserGameReport[]>([])
  const isLoading = ref(false)

  const fetchReports = async (githubToken: string, dvToken: string) => {
    if (isLoading.value) return
    isLoading.value = true
    try {
      reports.value = await getUserReports(githubToken, dvToken) || []
    } catch (error) {
      console.error('Failed to fetch reports:', error)
    } finally {
      isLoading.value = false
    }
  }

  return {
    reports,
    isLoading,
    fetchReports,
  }
})
