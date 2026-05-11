import { CapacitorHttp } from '@capacitor/core'
import type { HttpOptions, HttpResponse } from '@capacitor/core'
import type { FetchServiceResponse } from '../types'
import {
  OFFICIAL_ANDROID_APP_MARKER,
  OFFICIAL_ANDROID_CLIENT_HEADER,
  OFFICIAL_ANDROID_CLIENT_VALUE,
} from 'src/utils/mobile-client'

const headersToRecord = (headers: RequestInit['headers']): Record<string, string> | undefined => {
  if (!headers) return undefined

  if (headers instanceof Headers) {
    const record: Record<string, string> = {}
    headers.forEach((value, key) => {
      record[key] = value
    })
    return record
  }

  if (Array.isArray(headers)) {
    return headers.reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value
      return acc
    }, {})
  }

  if (typeof headers === 'object') {
    return { ...(headers as Record<string, string>) }
  }

  return undefined
}

export const fetchService = async (url: string, options?: RequestInit): Promise<FetchServiceResponse> => {
  console.debug('[api] Using CapacitorHttp for request:', url)

  const headerRecord = headersToRecord(options?.headers) ?? {}
  headerRecord[OFFICIAL_ANDROID_CLIENT_HEADER] = OFFICIAL_ANDROID_CLIENT_VALUE
  headerRecord['User-Agent'] = headerRecord['User-Agent'] || `${OFFICIAL_ANDROID_APP_MARKER}/native-http`

  const httpOptions: HttpOptions = {
    method: options?.method ?? 'GET',
    url,
    data: options?.body,
    headers: headerRecord,
  }

  try {
    const response: HttpResponse = await CapacitorHttp.request(httpOptions)

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => (typeof response.data === 'string' ? response.data : JSON.stringify(response.data)),
      json: async () => (typeof response.data === 'string' ? JSON.parse(response.data) : response.data),
      headers: response.headers,
    }
  } catch (error) {
    console.error('[api] CapacitorHttp request failed', error)
    throw error
  }
}
