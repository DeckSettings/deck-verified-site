import { defineStore } from 'pinia'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { fetchGameData, fetchLabels } from 'src/services/gh-reports'
import type { GameDetails, GitHubIssueLabel } from '../../../shared/src/game'

export const useGameStore = defineStore('game', {
  state: () => ({
    isLoaded: false as boolean,
    appId: null as string | null,
    gameName: '' as string,
    gameData: null as GameDetails | null,
    deviceLabels: [] as GitHubIssueLabel[],
    launcherLabels: [] as GitHubIssueLabel[],
    gameBackground: null as string | null,
    gamePoster: null as string | null,
    gameBanner: null as string | null,
    githubProjectSearchLink: null as string | null,
    githubSubmitReportLink: 'https://github.com/DeckSettings/game-reports-steamos/issues/new?assignees=&labels=&projects=&template=GAME-REPORT.yml&title=%28Placeholder+-+Issue+title+will+be+automatically+populated+with+the+information+provided+below%29&game_display_settings=-%20%2A%2ADisplay%20Resolution%3A%2A%2A%201280x800',
  }),

  actions: {
    async ensureLoaded(currentRoute: RouteLocationNormalizedLoaded): Promise<void> {
      if (this.isLoaded && this.gameData) return

      // Labels
      const labels = await fetchLabels()
      this.deviceLabels = labels.filter((l) => l.name.startsWith('device:'))
      this.launcherLabels = labels.filter((l) => l.name.startsWith('launcher:'))

      // Parse route
      let parsedGameName: string | null = null
      let parsedAppId: string | null = null
      if (currentRoute.path.startsWith('/app/')) {
        parsedAppId = String(currentRoute.params.appId || '')
        this.appId = parsedAppId
      } else if (currentRoute.path.startsWith('/game/')) {
        parsedGameName = decodeURIComponent(String(currentRoute.params.gameName || ''))
        this.gameName = parsedGameName
      }

      // Fetch game data
      const fetched = (parsedAppId || parsedGameName)
        ? await fetchGameData(parsedGameName, parsedAppId)
        : null
      if (fetched) {
        this.gameData = fetched

        if (fetched.gameName) {
          this.gameName = fetched.gameName
          this.githubSubmitReportLink = `${this.githubSubmitReportLink}&game_name=${encodeURIComponent(this.gameName)}`
        }
        if (fetched.projectNumber) {
          this.githubProjectSearchLink = `https://github.com/DeckSettings/game-reports-steamos/issues?q=is%3Aopen+is%3Aissue+project%3Adecksettings%2F${fetched.projectNumber}`
        }
        if (fetched.metadata) {
          this.gameBackground = fetched.metadata.hero || null
          this.gamePoster = fetched.metadata.poster || null
          this.gameBanner = fetched.metadata.banner || null
          if (this.appId) {
            this.githubSubmitReportLink = `${this.githubSubmitReportLink}&app_id=${this.appId}`
          }
        }
      }

      this.isLoaded = true
    },
  },
})
