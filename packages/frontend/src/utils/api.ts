import { fetchService as aliasFetchService } from '@app/api'

import type { FetchServiceResponse } from 'src/utils/api/types'

export type { FetchServiceResponse } from 'src/utils/api/types'

/**
 * Shared API helpers. Platform-specific fetch implementations are injected via
 * Vite aliasing so that Capacitor builds can rely on CapacitorHttp while web
 * builds continue to use the native fetch API.
 */
export const apiUrl = (path: string) => {
  const backendApiOrigin = process.env.BACKEND_API_ORIGIN || 'https://deckverified.games'
  const isSsrBuild = globalThis.isSsr ?? typeof window === 'undefined'
  const isNativeBuild = globalThis.isMobile ?? false
  if (isSsrBuild || isNativeBuild) {
    return `${backendApiOrigin}${path}`
  }
  return path
}

export const fetchService = (url: string, options?: RequestInit): Promise<FetchServiceResponse> =>
  aliasFetchService(url, options)
