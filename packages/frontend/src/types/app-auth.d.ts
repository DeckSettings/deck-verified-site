declare module '@app/auth' {
  import type { Tokens } from 'src/utils/auth/impl/web'
  import type { AuthState } from 'src/utils/auth/types'

  type LoginWithPkce = () => Promise<Tokens | null>
  type FetchAuthResult = (state: string) => Promise<Tokens>

  export type { Tokens }
  export const loginWithPkce: LoginWithPkce
  export const fetchAuthResult: FetchAuthResult
  export const persistToStorage: (snapshot: AuthState) => Promise<void>
  export const loadFromStorage: () => Promise<Partial<AuthState>>
  export const clearFromStorage: () => Promise<void>

  const authService: {
    loginWithPkce: LoginWithPkce
    fetchAuthResult: FetchAuthResult
  }

  export default authService
}
