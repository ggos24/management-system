/**
 * Raised instead of sending a data request that would go out with the anon key
 * while the user is still signed in.
 */
export class SessionUnavailableError extends Error {
  constructor() {
    super('The access token could not be refreshed, so the request was not sent as anon');
    this.name = 'SessionUnavailableError';
  }
}

/**
 * Raised in place of a token-refresh response the auth server could not give —
 * a 5xx, a request timeout or a rate limit — so auth-js treats the refresh like a
 * network failure: it keeps the session and tries again later.
 */
export class AuthServerUnavailableError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`The auth server answered the token refresh with ${status}; keeping the session to retry`);
    this.name = 'AuthServerUnavailableError';
    this.status = status;
  }
}

// How long to stop sending token refreshes after a 429 that names no Retry-After,
// and the most a Retry-After can make us wait.
const RATE_LIMIT_PAUSE_MS = 30_000;
const MAX_RATE_LIMIT_PAUSE_MS = 5 * 60_000;

function rateLimitPauseMs(response: Response): number {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RATE_LIMIT_PAUSE_MS);
    const until = Date.parse(retryAfter);
    if (!Number.isNaN(until)) return Math.min(Math.max(until - Date.now(), 0), MAX_RATE_LIMIT_PAUSE_MS);
  }
  return RATE_LIMIT_PAUSE_MS;
}

/**
 * The `fetch` the Supabase client uses. It changes two things, both so that a
 * flaky network or auth server never costs a signed-in user their session or
 * their data:
 *
 * 1. It refuses to send a REST, Storage or Functions request with the anon key
 *    while a user session exists. supabase-js attaches the user's access token
 *    to every such request, and when it cannot produce one it silently falls back
 *    to the anon key. That happens when the token expired while the tab slept or
 *    the laptop was closed and the refresh request failed because the network was
 *    not back yet: auth-js keeps the session (the failure is retryable) but
 *    `getSession()` hands back none. PostgREST then answers as `anon` and RLS
 *    hides every row, so a read is a successful, empty 200 rather than an error —
 *    a `fetchTasks()` that "succeeds" with zero rows empties every board and table
 *    until the page is reloaded. Rejecting the request turns that into an ordinary
 *    failure, which every fetch* in lib/database.ts rethrows and every caller
 *    treats as "keep what you have".
 *
 * 2. It reports a token refresh that the auth server failed to answer (408, 429,
 *    any 5xx) as a network failure. auth-js retries only network errors and
 *    502/503/504; a 500, a rate limit or a proxy's error page made it delete the
 *    stored session and sign the user out, although nothing was wrong with the
 *    session. After a 429 no refresh is sent until Retry-After (30s if absent) has
 *    passed, so the retries cannot add to the rate limiting. A rejected refresh
 *    token (400/401/403) still passes through and ends the session as it should.
 *
 * Other auth endpoints — sign-in, sign-out, password changes — pass through
 * untouched: they legitimately use the anon key, and their errors are the user's
 * to see.
 */
export function createSessionGuardedFetch(options: {
  supabaseUrl: string;
  anonKey: string;
  hasSession: () => boolean;
}): typeof fetch {
  const base = options.supabaseUrl.replace(/\/+$/, '');
  const guardedPrefixes = ['rest/v1/', 'storage/v1/', 'functions/v1/'].map((path) => `${base}/${path}`);
  const tokenEndpoint = `${base}/auth/v1/token?`;
  const anonAuthorization = `Bearer ${options.anonKey}`;
  let refreshPausedUntil = 0;

  const isTokenRefresh = (url: string) =>
    url.startsWith(tokenEndpoint) && new URL(url).searchParams.get('grant_type') === 'refresh_token';

  const refreshToken: typeof fetch = async (input, init) => {
    if (Date.now() < refreshPausedUntil) throw new AuthServerUnavailableError(429);
    const response = await globalThis.fetch(input, init);
    if (response.status === 429) {
      refreshPausedUntil = Date.now() + rateLimitPauseMs(response);
      throw new AuthServerUnavailableError(429);
    }
    if (response.status === 408 || response.status >= 500) throw new AuthServerUnavailableError(response.status);
    return response;
  };

  return (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (isTokenRefresh(url)) return refreshToken(input, init);
    if (options.hasSession() && guardedPrefixes.some((prefix) => url.startsWith(prefix))) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (headers.get('Authorization') === anonAuthorization) {
        return Promise.reject(new SessionUnavailableError());
      }
    }
    return globalThis.fetch(input, init);
  };
}
