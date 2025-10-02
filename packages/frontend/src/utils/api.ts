import { CapacitorHttp } from '@capacitor/core'
import type { HttpResponse, HttpOptions } from '@capacitor/core'

export const apiUrl = (path: string) => {
  const backendApiOrigin = process.env.BACKEND_API_ORIGIN || 'https://deckverified.games'
  const isSsrBuild = globalThis.isSsr ?? typeof window === 'undefined'
  const isNativeBuild = globalThis.isMobile ?? false
  if (isSsrBuild || isNativeBuild) {
    return `${backendApiOrigin}${path}`
  }
  return path
}

export const fetchService = async (url: string, options?: RequestInit): Promise<{
  ok: boolean,
  status: number,
  text: () => Promise<string>,
  json: () => Promise<unknown>,
  headers: unknown
}> => {
  if (globalThis.isCapacitor ?? false) {
    console.debug('Using CapacitorHttp for request:', url)
    try {
      const httpOptions: HttpOptions = {
        method: options?.method || 'GET',
        url: url,
        data: options?.body,
      }
      if (options?.headers) {
        httpOptions.headers = options.headers as { [key: string]: string }
      }
      const response: HttpResponse = await CapacitorHttp.request(httpOptions)

      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        text: async () => typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
        json: async () => typeof response.data === 'string' ? JSON.parse(response.data) : response.data,
        headers: response.headers,
      }
    } catch (error) {
      console.error('CapacitorHttp request failed', error)
      throw error
    }
  } else {
    const response = await fetch(url, options)
    return {
      ok: response.ok,
      status: response.status,
      text: response.text.bind(response),
      json: response.json.bind(response),
      headers: response.headers,
    }
  }
}