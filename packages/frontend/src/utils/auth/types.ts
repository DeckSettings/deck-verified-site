export interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  tokenType: string | null
  scope: string | null
  expiresAt: number | null
  refreshExpiresAt: number | null
  dvToken: string | null
}

export type PersistedAuth = Partial<AuthState>
