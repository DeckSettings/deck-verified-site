import { defineBoot } from '#q-app/wrappers'
import { useAuthStore } from 'src/stores/auth-store'

/**
 * Boot file to initialize the authentication store.
 * - Loads tokens from localStorage on client.
 * - Schedules token refresh if needed.
 * - Optionally fetches the GitHub user profile if access token exists.
 */
export default defineBoot(({ store }) => {
  // Ensure this only runs in the browser (avoids SSR issues with localStorage/window)
  if (typeof window === 'undefined') {
    return
  }

  const auth = useAuthStore(store)
  auth.initialize()
})