declare module '@app/api' {
  import type { FetchServiceResponse } from 'src/utils/api/types'

  export const fetchService: (url: string, options?: RequestInit) => Promise<FetchServiceResponse>
}