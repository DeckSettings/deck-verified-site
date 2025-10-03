import type { FetchServiceResponse } from '../types'

export const fetchService = async (url: string, options?: RequestInit): Promise<FetchServiceResponse> => {
  const response = await fetch(url, options)

  return {
    ok: response.ok,
    status: response.status,
    text: response.text.bind(response),
    json: response.json.bind(response),
    headers: response.headers,
  }
}
