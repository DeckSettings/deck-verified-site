<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { detectAndroidClientKind } from 'src/utils/mobile-client'
import googlePlayBadgeUrl from 'src/assets/GetItOnGooglePlay_Badge_Web_color_English.svg'
import PrimaryButton from 'components/elements/PrimaryButton.vue'
import { useAuthStore } from 'src/stores/auth-store'

const props = defineProps<{
  gameKey: string
}>()
const authStore = useAuthStore()
const route = useRoute()

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=nz.co.streamingtech.deckverified'
const BROWSER_DISMISS_KEY = 'dv.android-app-upsell.browser.dismissed.v1'
const BROWSER_REMIND_LATER_KEY = 'dv.android-app-upsell.browser.remind-later.v1'
const WEBVIEW_DISMISS_PREFIX = 'dv.android-app-upsell.webview.dismissed.v1:'
const INTERNAL_NAVIGATION_SESSION_KEY = 'dv.session.has-internal-navigation.v1'
// Seven days in milliseconds. Used when a browser user clicks "Remind me later".
const BROWSER_REMIND_LATER_MS = 7 * 24 * 60 * 60 * 1000
// Twenty-four hours in milliseconds. Used to snooze the stronger third-party WebView prompt per game.
const WEBVIEW_REMIND_LATER_MS = 24 * 60 * 60 * 1000

const dialogOpen = ref(false)
const displayTimer = ref<number | null>(null)
const clientKind = ref(detectAndroidClientKind())

const readStorage = (storage: Storage, key: string): string | null => {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

const writeStorage = (storage: Storage, key: string, value: string) => {
  try {
    storage.setItem(key, value)
  } catch {
    // Ignore browsers that block storage access.
  }
}

const hasExpandedId = computed(() => {
  const expandedId = route.query.expandedId
  return typeof expandedId === 'string' && expandedId.trim().length > 0
})

const isSharedLink = computed(() => route.query.shared === '1')

const hasInternalNavigationHistory = (): boolean => {
  if (typeof window === 'undefined') return false
  return readStorage(window.sessionStorage, INTERNAL_NAVIGATION_SESSION_KEY) === 'true'
}

const isInternalReferrer = (): boolean => {
  if (typeof document === 'undefined' || !document.referrer) return false

  try {
    return new URL(document.referrer).origin === window.location.origin
  } catch {
    return false
  }
}

const externalExpandedEntryPrompt = computed(() => (
  clientKind.value === 'android-browser'
  && hasExpandedId.value
  && !isSharedLink.value
  && !hasInternalNavigationHistory()
  && !isInternalReferrer()
))

const promptVariant = computed<'browser' | 'webview' | 'external-entry' | null>(() => {
  if (externalExpandedEntryPrompt.value) return 'external-entry'
  if (clientKind.value === 'android-webview') return 'webview'
  if (clientKind.value === 'android-browser') return 'browser'
  return null
})

const browserPrompt = computed(() => promptVariant.value === 'browser')
const webviewPrompt = computed(() => promptVariant.value === 'webview')
const externalEntryPrompt = computed(() => promptVariant.value === 'external-entry')
const strongPrompt = computed(() => webviewPrompt.value || externalEntryPrompt.value)

const gameScopedStorageKey = computed(() => `${WEBVIEW_DISMISS_PREFIX}${props.gameKey}`)

const clearDisplayTimer = () => {
  if (displayTimer.value !== null && typeof window !== 'undefined') {
    window.clearTimeout(displayTimer.value)
    displayTimer.value = null
  }
}

const readTimestamp = (key: string): number => {
  if (typeof window === 'undefined') return 0
  const raw = readStorage(window.localStorage, key)
  if (!raw) return 0
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

const shouldShowPrompt = (): boolean => {
  if (typeof window === 'undefined') return false
  if (authStore.isLoggedIn) return false

  if (browserPrompt.value) {
    if (readStorage(window.localStorage, BROWSER_DISMISS_KEY) === 'true') {
      return false
    }
    return readTimestamp(BROWSER_REMIND_LATER_KEY) <= Date.now()
  }

  if (strongPrompt.value) {
    return readTimestamp(gameScopedStorageKey.value) <= Date.now()
  }

  return false
}

const schedulePrompt = () => {
  clearDisplayTimer()
  dialogOpen.value = false
  clientKind.value = detectAndroidClientKind()

  if (!promptVariant.value || !shouldShowPrompt()) {
    return
  }

  const delayMs = strongPrompt.value ? 1000 : 5000
  displayTimer.value = window.setTimeout(() => {
    dialogOpen.value = true
  }, delayMs)
}

const dismissForBrowser = () => {
  if (typeof window !== 'undefined') {
    writeStorage(window.localStorage, BROWSER_DISMISS_KEY, 'true')
  }
  dialogOpen.value = false
}

const remindBrowserLater = () => {
  if (typeof window !== 'undefined') {
    writeStorage(window.localStorage, BROWSER_REMIND_LATER_KEY, String(Date.now() + BROWSER_REMIND_LATER_MS))
  }
  dialogOpen.value = false
}

const dismissStrongPrompt = () => {
  if (typeof window !== 'undefined') {
    writeStorage(window.localStorage, gameScopedStorageKey.value, String(Date.now() + WEBVIEW_REMIND_LATER_MS))
  }
  dialogOpen.value = false
}

watch(
  () => props.gameKey,
  () => {
    schedulePrompt()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearDisplayTimer()
})
</script>

<template>
  <q-dialog
    v-model="dialogOpen"
    persistent
    backdrop-filter="blur(6px)"
  >
    <q-card flat bordered class="android-app-upsell-card">
      <q-card-section>
        <div class="text-h6">
          {{ strongPrompt ? (webviewPrompt ? 'Opened inside another app?' : 'Opened from another app?') : 'Using Deck Verified on Android?'
          }}
        </div>
      </q-card-section>

      <q-card-section class="android-app-upsell-hero q-pt-none">
        <p class="android-app-upsell-copy q-mb-none">
          <span v-if="webviewPrompt">
            It looks like Deck Verified was opened through a third-party app wrapper.
            <br>
            The official Deck Verified Android app is free, open source, ad-free, and built for the full community experience.
          </span>
          <span v-else-if="externalEntryPrompt">
            It looks like this report was opened directly from another app or website.
            <br>
            The official Deck Verified Android app is free, open source, ad-free, and built for a smoother way to browse, compare, and contribute reports.
          </span>
          <span v-else>
            The website works well for browsing, searching, and reading reports, but there is also an official Android app built for a smoother experience.
          </span>
        </p>
      </q-card-section>

      <q-separator dark />

      <q-card-section class="android-app-upsell-points">
        <div class="android-app-upsell-point">
          <q-icon :name="strongPrompt ? 'thumb_up' : 'verified'" color="primary" size="22px" />
          <div>
            <div class="text-subtitle1 text-weight-bold">
              {{ strongPrompt ? 'Like useful reports' : 'Free, open source, and ad-free' }}
            </div>
            <div class="text-body2 text-grey-4">
              <span v-if="strongPrompt">
                Help other players find the most trusted settings and make the best reports stand out.
              </span>
              <span v-else>
                The official app is 100% free, has no ads, and its source code is public.
              </span>
            </div>
          </div>
        </div>
        <div class="android-app-upsell-point">
          <q-icon :name="strongPrompt ? 'rate_review' : 'smartphone'" color="primary" size="22px" />
          <div>
            <div class="text-subtitle1 text-weight-bold">
              {{ strongPrompt ? 'Submit and edit reports' : 'Made for your phone' }}
            </div>
            <div class="text-body2 text-grey-4">
              <span v-if="strongPrompt">
                Share your own handheld settings, improve existing submissions, and compare results directly from your phone.
              </span>
              <span v-else>
                Search reports, compare settings, and navigate Deck Verified with a more native app feel.
              </span>
            </div>
          </div>
        </div>
        <div class="android-app-upsell-point">
          <q-icon :name="strongPrompt ? 'favorite' : 'edit_note'" color="primary" size="22px" />
          <div>
            <div class="text-subtitle1 text-weight-bold">
              {{ strongPrompt ? 'Be part of what makes Deck Verified useful' : 'Contribute with less friction' }}
            </div>
            <div class="text-body2 text-grey-4">
              <span v-if="strongPrompt">
                Deck Verified works best when players do more than read reports. The official app makes it easier to react, contribute, and help the best submissions rise to the top.
              </span>
              <span v-else>
                Submit and edit handheld settings directly from your phone with less friction.
              </span>
            </div>
          </div>
        </div>
      </q-card-section>

      <q-card-section class="row justify-center q-pt-none">
        <q-btn
          flat
          unelevated
          padding="none"
          class="google-play-btn"
          :href="PLAY_STORE_URL"
          target="_blank"
        >
          <img
            :src="googlePlayBadgeUrl"
            alt="Get it on Google Play"
            class="google-play-badge">
        </q-btn>
      </q-card-section>

      <q-card-actions align="right" class="android-app-upsell-actions">
        <PrimaryButton
          :label="browserPrompt ? `Don't Show Again` : 'Dismiss'"
          color="grey"
          icon="close"
          @click="browserPrompt ? dismissForBrowser() : dismissStrongPrompt()"
        />
        <PrimaryButton
          v-if="browserPrompt"
          label="Remind Me Later"
          color="grey"
          icon="schedule"
          @click="remindBrowserLater"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.android-app-upsell-card {
  width: min(92vw, 680px);
  max-height: min(92vh, 760px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(160deg, color-mix(in srgb, var(--q-dark) 94%, #0f6d6d 6%) 0%, color-mix(in srgb, var(--q-dark) 96%, black 4%) 100%);
  border: 1px solid color-mix(in srgb, var(--q-primary) 28%, transparent);
  border-radius: 4px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
}

.android-app-upsell-hero {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.android-app-upsell-copy {
  color: rgba(255, 255, 255, 0.84);
  font-size: 1rem;
  line-height: 1.6;
}

.android-app-upsell-points {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  min-height: 0;
}

.android-app-upsell-point {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.google-play-badge {
  height: 64px;
  width: auto;
  display: block;
}

.android-app-upsell-actions {
  flex: 0 0 auto;
  padding: 0 16px 16px;
  gap: 12px;
  flex-wrap: nowrap;
}

@media (max-width: 599.98px) {
  .android-app-upsell-actions {
    gap: 8px;
  }

  .android-app-upsell-actions :deep(.q-btn) {
    white-space: nowrap;
  }
}
</style>
