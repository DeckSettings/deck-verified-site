export const OFFICIAL_ANDROID_APP_MARKER = 'DeckVerifiedAndroidApp'
export const OFFICIAL_ANDROID_CLIENT_HEADER = 'X-DeckVerified-Client'
export const OFFICIAL_ANDROID_CLIENT_VALUE = 'android-app'

export type AndroidClientKind = 'official-app' | 'android-browser' | 'android-webview' | 'other'

const hasKnownAndroidBrowserToken = (ua: string): boolean => (
  /Firefox\/|Chrome\/|CriOS\/|EdgA\/|OPR\/|SamsungBrowser\/|DuckDuckGo\//i.test(ua)
)

const isLikelyAndroidWebView = (ua: string): boolean => (
  /\bwv\b/i.test(ua)
  || /Version\/4\.0/i.test(ua)
  || /; wv\)/i.test(ua)
  || /FBAN\/|FBAV\/|Instagram|Line\/|Snapchat/i.test(ua)
)

export const detectAndroidClientKind = (userAgent?: string | null): AndroidClientKind => {
  if (globalThis.isCapacitor) {
    return 'official-app'
  }

  const ua = (userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')).trim()
  if (!ua) {
    return 'other'
  }

  if (ua.includes(OFFICIAL_ANDROID_APP_MARKER)) {
    return 'official-app'
  }

  if (!/Android/i.test(ua)) {
    return 'other'
  }

  if (isLikelyAndroidWebView(ua)) {
    return 'android-webview'
  }

  if (hasKnownAndroidBrowserToken(ua)) {
    return 'android-browser'
  }

  return 'other'
}
