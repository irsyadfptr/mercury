// Google sign-in (token flow) for the browser. The access token lives in memory only, never in storage.
import type { AccessToken } from '@/types'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
/** Only files this app creates or opens; never the rest of the user's Drive. */
export const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID
/** Treat the token as expired a minute early so a request never races its expiry. */
const EXPIRY_MARGIN_MS = 60_000

let client: google.accounts.oauth2.TokenClient | undefined
let token: AccessToken | undefined
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | undefined
let loading: Promise<void> | undefined

export const isConfigured = (): boolean => Boolean(CLIENT_ID)

/** Pure: is this token still usable at `now`? */
export const isFresh = (t: AccessToken | undefined, now: number): t is AccessToken => Boolean(t && t.expiresAt - EXPIRY_MARGIN_MS > now)

/** A usable token, or undefined when the user must tap "Connect" again. */
export const currentToken = (now = Date.now()): string | undefined => (isFresh(token, now) ? token.value : undefined)

/**
 * Loads the Google script and prepares the token client. Call early (on page mount):
 * the sign-in popup must open inside the user's tap, so nothing slow may run between tap and request.
 */
export function prepareGoogle(): Promise<void> {
  if (!CLIENT_ID) return Promise.reject(new Error('VITE_GOOGLE_CLIENT_ID is not set'))
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => {
      client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (r) => {
          if (r.error) pending?.reject(new Error(r.error_description ?? r.error))
          else {
            token = { value: r.access_token, expiresAt: Date.now() + r.expires_in * 1000 }
            pending?.resolve(r.access_token)
          }
          pending = undefined
        },
        error_callback: (e) => {
          pending?.reject(new Error(e.message ?? e.type))
          pending = undefined
        },
      })
      resolve()
    }
    script.onerror = () => {
      loading = undefined
      reject(new Error('Could not load Google sign-in'))
    }
    document.head.append(script)
  })
  return loading
}

/** Opens Google's popup. Must be called directly from a click handler, after prepareGoogle() resolved. */
export function signIn(): Promise<string> {
  if (!client) return Promise.reject(new Error('Google sign-in is still loading'))
  pending?.reject(new Error('Replaced by a newer sign-in'))
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject }
    // '' = only show the consent screen the first time; later taps are quick.
    client!.requestAccessToken({ prompt: '' })
  })
}

export function signOut(): void {
  if (token) google.accounts.oauth2.revoke(token.value)
  token = undefined
}

/** Called when Google rejects the token (401) so the next action asks to connect again. */
export function forgetToken(): void {
  token = undefined
}
