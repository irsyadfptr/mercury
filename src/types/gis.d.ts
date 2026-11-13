// Minimal types for Google Identity Services (https://accounts.google.com/gsi/client), token flow only.
declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string
    expires_in: number
    error?: string
    error_description?: string
  }
  interface TokenClient {
    requestAccessToken(overrides?: { prompt?: '' | 'none' | 'consent' | 'select_account' }): void
  }
  function initTokenClient(config: {
    client_id: string
    scope: string
    callback: (r: TokenResponse) => void
    error_callback?: (e: { type: string; message?: string }) => void
  }): TokenClient
  function revoke(token: string, done?: () => void): void
}
