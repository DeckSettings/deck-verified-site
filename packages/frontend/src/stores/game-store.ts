import { defineStore } from 'pinia'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { fetchGameData, fetchLabels } from 'src/services/gh-reports'
import type { GameDetails, GitHubIssueLabel } from '../../../shared/src/game'

export const useGameStore = defineStore('game', {
  state: () => ({
    isLoaded: false as boolean,
    appId: null as string | null,
    gameName: '' as string,
    reportsSummary: null as string | null,
    gameData: null as GameDetails | null,
    deviceLabels: [] as GitHubIssueLabel[],
    launcherLabels: [] as GitHubIssueLabel[],
    gameBackground: null as string | null,
    gamePoster: null as string | null,
    gameBanner: null as string | null,
    githubProjectSearchLink: null as string | null,
    githubSubmitReportLink: 'https://github.com/DeckSettings/game-reports-steamos/issues/new?assignees=&labels=&projects=&template=GAME-REPORT.yml&title=%28Placeholder+-+Issue+title+will+be+automatically+populated+with+the+information+provided+below%29&game_display_settings=-%20%2A%2ADisplay%20Resolution%3A%2A%2A%201280x800',

    // Page-level SEO/social metadata (client-safe updates only)
    metadata: {
      title: '' as string,
      description: '' as string,
      image: '' as string,
      imageAlt: '' as string,
      imageType: '' as string,
      imageWidth: '' as string,
      imageHeight: '' as string,
    },
  }),

  actions: {
    // Clear per-game fields before loading a new target
    resetGameState() {
      this.isLoaded = false
      this.reportsSummary = null
      this.gameData = null
      this.gameBackground = null
      this.gamePoster = null
      this.gameBanner = null
      this.githubProjectSearchLink = null
      // keep githubSubmitReportLink default
      // keep device/launcher labels (global cache)
      this.metadata = {
        title: '',
        description: '',
        image: '',
        imageAlt: '',
        imageType: '',
        imageWidth: '',
        imageHeight: '',
      }
    },

    setMetadata(partial: Partial<{
      title: string
      description: string
      image: string
      imageAlt: string
      imageType: string
      imageWidth: string
      imageHeight: string
    }>) {
      this.metadata = { ...this.metadata, ...partial }
    },

    // Set reasonable defaults based on the current game name
    setDefaultGameMetadata() {
      const fallbackName = this.gameName || (this.appId ? `App ${this.appId}` : '')
      const title = fallbackName
        ? `${fallbackName} – Steam Deck settings & performance`
        : 'Game Report – Steam Deck settings'
      const description = `Best Steam Deck settings and community performance reports for ${fallbackName || 'this game'}. Graphics presets, frame rate targets, battery life tips, and tweaks that work on SteamOS handhelds.`
      this.setMetadata({ title, description })
    },

    // CLIENT ONLY: probe image for dimensions and MIME type
    updateImageMetadataFromUrl(url: string) {
      if (typeof window === 'undefined' || !url) return
      try {
        const img = new Image()
        img.onload = () => {
          const imageWidth = String((img as HTMLImageElement).naturalWidth)
          const imageHeight = String((img as HTMLImageElement).naturalHeight)
          let imageType = ''
          if (/\.(jpe?g)$/i.test(url)) imageType = 'image/jpeg'
          else if (/\.png$/i.test(url)) imageType = 'image/png'
          else if (/\.webp$/i.test(url)) imageType = 'image/webp'
          else if (/\.gif$/i.test(url)) imageType = 'image/gif'
          this.setMetadata({ imageWidth, imageHeight, imageType })
        }
        img.onerror = () => {
          this.setMetadata({ imageWidth: '', imageHeight: '', imageType: '' })
        }
        img.src = url
      } catch {
        // Do nothing
      }
    },

    async ensureLoaded(currentRoute: RouteLocationNormalizedLoaded): Promise<void> {
      // Parse intended target from route first
      let parsedGameName: string | null = null
      let parsedAppId: string | null = null
      if (currentRoute.path.startsWith('/app/')) {
        parsedAppId = String(currentRoute.params.appId || '')
      } else if (currentRoute.path.startsWith('/game/')) {
        parsedGameName = decodeURIComponent(String(currentRoute.params.gameName || ''))
      }

      // If we already have data for this exact target, skip re-fetch
      if (
        this.gameData && (
          (parsedAppId && this.appId === parsedAppId) ||
          (parsedGameName && this.gameName === parsedGameName)
        )
      ) {
        return
      }

      // Ensure labels are loaded once
      if (this.deviceLabels.length === 0 || this.launcherLabels.length === 0) {
        const labels = await fetchLabels()
        this.deviceLabels = labels.filter((l) => l.name.startsWith('device:'))
        this.launcherLabels = labels.filter((l) => l.name.startsWith('launcher:'))
      }

      // RESET state for new target BEFORE fetching
      this.resetGameState()

      // Update store keys from route
      this.appId = parsedAppId
      this.gameName = parsedGameName || ''

      // Fetch game data for the new target
      const fetched = (parsedAppId || parsedGameName)
        ? await fetchGameData(parsedGameName, parsedAppId)
        : null

      if (fetched) {
        this.gameData = fetched

        if (fetched.gameName) {
          this.gameName = fetched.gameName
        }

        if (fetched.projectNumber) {
          this.githubProjectSearchLink = `https://github.com/DeckSettings/game-reports-steamos/issues?q=is%3Aopen+is%3Aissue+project%3Adecksettings%2F${fetched.projectNumber}`
        }

        if (fetched.metadata) {
          this.gameBackground = fetched.metadata.hero || null
          this.gamePoster = fetched.metadata.poster || null
          this.gameBanner = fetched.metadata.banner || null

          // Seed metadata image fields so components have initial values (SSR-safe)
          const imgUrl = this.gameBanner || this.gameBackground || this.gamePoster || ''
          if (imgUrl) {
            let imageType = ''
            if (/\.(jpe?g)$/i.test(imgUrl)) imageType = 'image/jpeg'
            else if (/\.png$/i.test(imgUrl)) imageType = 'image/png'
            else if (/\.webp$/i.test(imgUrl)) imageType = 'image/webp'
            else if (/\.gif$/i.test(imgUrl)) imageType = 'image/gif'
            this.setMetadata({
              image: imgUrl,
              imageAlt: `${this.gameName || (this.appId ? `App ${this.appId}` : 'Game')} - Game Banner`,
              imageType,
            })
          }
        }

        this.reportsSummary = fetched.reports_summary ?? null

        // Initialise default page metadata now that core fields are known
        this.setDefaultGameMetadata()

        // Update submit link
        const baseSubmit = 'https://github.com/DeckSettings/game-reports-steamos/issues/new?assignees=&labels=&projects=&template=GAME-REPORT.yml&title=%28Placeholder+-+Issue+title+will+be+automatically+populated+with+the+information+provided+below%29&game_display_settings=-%20%2A%2ADisplay%20Resolution%3A%2A%2A%201280x800'
        const params: string[] = []
        if (this.gameName) params.push(`game_name=${encodeURIComponent(this.gameName)}`)
        if (this.appId) params.push(`app_id=${encodeURIComponent(this.appId)}`)
        this.githubSubmitReportLink = params.length ? `${baseSubmit}&${params.join('&')}` : baseSubmit
      }

      this.isLoaded = true
    },
  },
})
