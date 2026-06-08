// Detects when the device's system clock is far enough off real/server time to
// break Supabase auth. Supabase access tokens carry an absolute `expires_at`
// (= server-issued `iat` + ~1h TTL). @supabase/auth-js decides a token is expired
// with `(expires_at * 1000 - Date.now()) < 90_000`, comparing against the DEVICE's
// local wall-clock. So a clock running far enough AHEAD makes every freshly-minted
// token look already-expired, triggering an endless refresh loop that the Supabase
// auth endpoint rate-limits (429) — which forcibly signs the user out.
//
// We measure the skew from a FRESHLY issued token's `iat` (right after sign-in or a
// successful TOKEN_REFRESHED). At that instant `now - iat` is just network latency,
// so any large value is pure clock error. We never measure from a token loaded out
// of storage, since an old-but-valid token would look skewed by its own age.

// Show a gentle warning beyond this much drift (either direction).
export const CLOCK_SKEW_WARN_SECONDS = 120;

// Forward drift at/above this point born-expires every token and causes the
// repeated-logout loop. With a 3600s token TTL and auth-js's 90s expiry margin the
// real break-even is ~3510s; we warn a little earlier to leave headroom.
export const CLOCK_SKEW_CRITICAL_SECONDS = 3300;

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '==='.slice((base64.length + 3) % 4);
  return atob(padded);
}

/** Returns the JWT `iat` (issued-at, server unix seconds) or null if undecodable. */
export function getTokenIssuedAt(accessToken: string | undefined | null): number | null {
  if (!accessToken) return null;
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(decodeBase64Url(payload));
    return typeof claims.iat === 'number' ? claims.iat : null;
  } catch {
    return null;
  }
}

/**
 * Skew in seconds between the device clock and the server, measured from a freshly
 * issued token. Positive = device is AHEAD of real time (fast); negative = behind.
 * Returns null when the token can't be decoded (never blocks auth).
 */
export function skewSecondsFromToken(accessToken: string | undefined | null): number | null {
  const iat = getTokenIssuedAt(accessToken);
  if (iat == null) return null;
  return Math.round(Date.now() / 1000) - iat;
}

/**
 * Force a fresh skew measurement on demand (e.g. after the user corrects their
 * clock). Skew can only be measured reliably from a just-issued token — the stored
 * one can't be told apart from clock drift — so this mints a new token and reads it.
 * Returns null if the refresh fails (e.g. rate-limited), in which case the caller
 * should KEEP the previous reading rather than falsely clearing the warning.
 */
export async function recheckClockSkew(): Promise<number | null> {
  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) return null;
    return skewSecondsFromToken(data.session.access_token);
  } catch {
    return null;
  }
}
