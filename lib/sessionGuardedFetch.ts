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
 * A `fetch` for the Supabase client that refuses to send a REST, Storage or
 * Functions request with the anon key while a user session exists.
 *
 * supabase-js attaches the user's access token to every such request, and when it
 * cannot produce one it silently falls back to the anon key. That happens when the
 * token expired while the tab slept or the laptop was closed and the refresh
 * request failed because the network was not back yet: auth-js keeps the session
 * (the failure is retryable) but `getSession()` hands back none. PostgREST then
 * answers as `anon` and RLS hides every row, so a read is a successful, empty 200
 * rather than an error. A `fetchTasks()` that "succeeds" with zero rows empties
 * every board and table until the page is reloaded.
 *
 * Rejecting the request turns that into an ordinary failure, which every fetch*
 * in lib/database.ts rethrows and every caller treats as "keep what you have".
 * Auth endpoints are never touched: they legitimately use the anon key.
 */
export function createSessionGuardedFetch(options: {
  supabaseUrl: string;
  anonKey: string;
  hasSession: () => boolean;
}): typeof fetch {
  const base = options.supabaseUrl.replace(/\/+$/, '');
  const guardedPrefixes = ['rest/v1/', 'storage/v1/', 'functions/v1/'].map((path) => `${base}/${path}`);
  const anonAuthorization = `Bearer ${options.anonKey}`;

  return (input, init) => {
    if (options.hasSession()) {
      const url = input instanceof Request ? input.url : String(input);
      if (guardedPrefixes.some((prefix) => url.startsWith(prefix))) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (headers.get('Authorization') === anonAuthorization) {
          return Promise.reject(new SessionUnavailableError());
        }
      }
    }
    return globalThis.fetch(input, init);
  };
}
