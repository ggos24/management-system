import { createClient } from '@supabase/supabase-js';
import { createSessionGuardedFetch } from './sessionGuardedFetch';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Whether auth-js holds a session, for the fetch guard. A sign-out or a refresh
// token the server rejects clears it; a refresh that only failed on the network
// mid-session keeps it, which is exactly when supabase-js would downgrade
// requests to the anon key. At app start the flag stays false until auth-js
// confirms the stored session (INITIAL_SESSION is null when that refresh fails),
// so the guard is off there — safe only because useAuth sends no data request
// until the session is confirmed. Anything that loads data before that point
// must not rely on this guard.
let hasSession = false;

// Where auth-js keeps the session: supabase-js's own default, spelled out so a
// sign-out that cannot reach the server can still clear it (signOutOnThisDevice).
// Changing it would sign every user out.
export const AUTH_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

const guardedFetch = createSessionGuardedFetch({
  supabaseUrl,
  anonKey: supabaseAnonKey,
  hasSession: () => hasSession,
});

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storageKey: AUTH_STORAGE_KEY },
  global: { fetch: guardedFetch },
});

supabase.auth.onAuthStateChange((_event, session) => {
  hasSession = session !== null;
});

/**
 * Ends the session on this device without needing the network.
 *
 * auth-js's signOut() — in either scope — first loads the session (refreshing an
 * expired token) and calls the server's /logout, and when either request fails
 * it returns an error *before* removing anything. Offline, a sign-out therefore
 * cleared the app's screen but left the session in storage: the next visit was
 * signed straight back in, and other tabs were never told. Removing the stored
 * session first leaves a local signOut nothing to refresh or revoke, so it only
 * emits SIGNED_OUT here and, through auth-js's BroadcastChannel, in other tabs.
 * The refresh token itself stays valid on the server until it expires: there is
 * no revoking it without a connection.
 */
// auth-js refreshes an access token that expires within this margin before it
// will use it (its EXPIRY_MARGIN_MS).
const REFRESH_MARGIN_MS = 90_000;

/**
 * Whether a sign-out that tells the server would first have to wait out failing
 * token refreshes. auth-js's signOut() refreshes an expired access token before it
 * calls /logout; while refreshes are failing (network, 408/429/5xx, or paused after
 * a rate limit) that is ~25s of retries ending in an error, so the only sign-out
 * that can work is the one on this device.
 */
export function signOutMustWaitForRefresh(): boolean {
  if (!guardedFetch.isTokenRefreshFailing()) return false;
  try {
    const stored = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? 'null') as { expires_at?: number } | null;
    return !stored?.expires_at || stored.expires_at * 1000 - Date.now() < REFRESH_MARGIN_MS;
  } catch {
    return true;
  }
}

export async function signOutOnThisDevice(): Promise<void> {
  try {
    for (const suffix of ['', '-code-verifier', '-user']) localStorage.removeItem(AUTH_STORAGE_KEY + suffix);
  } catch (error) {
    console.error('Could not clear the stored session', error);
  }
  await supabase.auth.signOut({ scope: 'local' }).catch((error) => console.error(error));
}
