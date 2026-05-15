import { defineBoot } from '#q-app/wrappers'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { Dialog } from 'quasar'

const PLAY_STORE_APP_ID = 'nz.co.streamingtech.deckverified'
const DISMISS_KEY_PREFIX = 'dv.play-store-update.dismissed.v1:'
const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_APP_ID}`

interface PlayStoreUpdateAvailability {
  available: boolean;
  availableVersionCode?: number;
  immediateAllowed?: boolean;
  updatePriority?: number;
  stalenessDays?: number;
}

interface PlayStoreUpdatePlugin {
  getUpdateAvailability(): Promise<PlayStoreUpdateAvailability>;

  openPlayStoreListing(options?: { appId?: string }): Promise<void>;
}

const PlayStoreUpdate = registerPlugin<PlayStoreUpdatePlugin>('PlayStoreUpdate')

export default defineBoot(async () => {
  if (typeof window === 'undefined' || !globalThis.isCapacitor || Capacitor.getPlatform() !== 'android') {
    return
  }

  try {
    const updateAvailability = await PlayStoreUpdate.getUpdateAvailability()
    if (!updateAvailability.available) {
      return
    }

    const dismissedKey = `${DISMISS_KEY_PREFIX}${updateAvailability.availableVersionCode ?? 'unknown'}`
    if (window.localStorage.getItem(dismissedKey) === '1') {
      return
    }

    Dialog.create({
      title: 'Update available',
      message: 'A new version of Deck Verified is available. Update from Google Play to get the latest fixes and improvements.',
      ok: {
        label: 'Update',
        color: 'primary',
      },
      cancel: {
        label: 'Later',
        flat: true,
      },
      persistent: true,
    }).onOk(async () => {
      try {
        await PlayStoreUpdate.openPlayStoreListing({ appId: PLAY_STORE_APP_ID })
      } catch (error) {
        console.warn('[play-store-update] Failed to open Play Store listing', error)
        window.open(PLAY_STORE_WEB_URL, '_blank', 'noopener')
      }
    }).onCancel(() => {
      window.localStorage.setItem(dismissedKey, '1')
    })
  } catch (error) {
    // Sideloaded builds and devices without Play services should fail closed.
    console.warn('[play-store-update] Update check unavailable', error)
  }
})
