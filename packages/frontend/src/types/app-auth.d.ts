declare module '@app/auth' {
  import type { Tokens } from 'src/utils/auth/impl/web'

  type LoginWithPkce = () => Promise<Tokens | null>
  type FetchAuthResult = (state: string) => Promise<Tokens>

  export type { Tokens }
  export const loginWithPkce: LoginWithPkce
  export const fetchAuthResult: FetchAuthResult

  const authService: {
    loginWithPkce: LoginWithPkce
    fetchAuthResult: FetchAuthResult
  }

  export default authService
}
