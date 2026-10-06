import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuthServerUnavailableError,
  createSessionGuardedFetch,
  SessionUnavailableError,
} from '../lib/sessionGuardedFetch';

const SUPABASE_URL = 'https://project.supabase.co';
const ANON_KEY = 'anon-key';

function guardedFetch(hasSession: boolean) {
  const realFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response('[]'));
  vi.stubGlobal('fetch', realFetch);
  const guarded = createSessionGuardedFetch({
    supabaseUrl: SUPABASE_URL,
    anonKey: ANON_KEY,
    hasSession: () => hasSession,
  });
  return { guarded, realFetch };
}

const withAuthorization = (token: string): RequestInit => ({
  headers: new Headers({ apikey: ANON_KEY, Authorization: `Bearer ${token}` }),
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('session-guarded Supabase fetch', () => {
  it('refuses a REST read that fell back to the anon key while a session exists', async () => {
    // The shape supabase-js sends after a failed token refresh: an empty 200 from
    // RLS is what used to wipe the task board.
    const { guarded, realFetch } = guardedFetch(true);

    await expect(guarded(`${SUPABASE_URL}/rest/v1/tasks?select=*`, withAuthorization(ANON_KEY))).rejects.toBeInstanceOf(
      SessionUnavailableError,
    );
    await expect(
      guarded(`${SUPABASE_URL}/storage/v1/object/sign/private`, withAuthorization(ANON_KEY)),
    ).rejects.toBeInstanceOf(SessionUnavailableError);
    await expect(
      guarded(`${SUPABASE_URL}/functions/v1/send-telegram`, withAuthorization(ANON_KEY)),
    ).rejects.toBeInstanceOf(SessionUnavailableError);
    expect(realFetch).not.toHaveBeenCalled();
  });

  it('sends requests that carry the user token', async () => {
    const { guarded, realFetch } = guardedFetch(true);

    await guarded(`${SUPABASE_URL}/rest/v1/tasks?select=*`, withAuthorization('user-jwt'));

    expect(realFetch).toHaveBeenCalledTimes(1);
  });

  it('leaves auth endpoints alone, which always use the anon key', async () => {
    const { guarded, realFetch } = guardedFetch(true);

    await guarded(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, withAuthorization(ANON_KEY));

    expect(realFetch).toHaveBeenCalledTimes(1);
  });

  it('allows anon requests when nobody is signed in', async () => {
    // e.g. the Telegram Mini App exchanging initData before any session exists.
    const { guarded, realFetch } = guardedFetch(false);

    await guarded(`${SUPABASE_URL}/functions/v1/equipment-auth`, withAuthorization(ANON_KEY));

    expect(realFetch).toHaveBeenCalledTimes(1);
  });

  it('turns the downgraded supabase-js query into an error instead of an empty result', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const { guarded, realFetch } = guardedFetch(true);
    // No session can be produced, so supabase-js falls back to the anon key — the
    // same thing it does when a token refresh fails on the network.
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: guarded },
    });

    const { data, error } = await client.from('tasks').select('*');

    expect(data).toBeNull();
    expect(error?.message).toContain('SessionUnavailableError');
    expect(realFetch).not.toHaveBeenCalled();
  });
});

const REFRESH_URL = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;
const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function refreshFetch(...responses: Response[]) {
  const realFetch = vi.fn<typeof fetch>();
  for (const response of responses) realFetch.mockResolvedValueOnce(response);
  realFetch.mockResolvedValue(json({ access_token: 'new' }, 200));
  vi.stubGlobal('fetch', realFetch);
  const guarded = createSessionGuardedFetch({ supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY, hasSession: () => true });
  return { guarded, realFetch };
}

describe('token refresh through the session-guarded fetch', () => {
  it.each([500, 501, 520, 408])('reports a %i from the auth server as a network failure', async (status) => {
    const { guarded } = refreshFetch(json({ msg: 'upstream error' }, status));

    await expect(guarded(REFRESH_URL, { method: 'POST' })).rejects.toBeInstanceOf(AuthServerUnavailableError);
  });

  it('passes a rejected refresh token through, so the session still ends', async () => {
    const { guarded } = refreshFetch(json({ error_code: 'refresh_token_already_used' }, 400));

    await expect(guarded(REFRESH_URL, { method: 'POST' })).resolves.toMatchObject({ status: 400 });
  });

  it('leaves other auth requests alone, including their errors', async () => {
    const { guarded } = refreshFetch(json({ msg: 'boom' }, 500));

    const response = await guarded(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST' });

    expect(response.status).toBe(500);
  });

  it('stops refreshing after a rate limit until Retry-After has passed', async () => {
    vi.useFakeTimers();
    const { guarded, realFetch } = refreshFetch(json({ msg: 'rate limited' }, 429, { 'Retry-After': '10' }));

    await expect(guarded(REFRESH_URL, { method: 'POST' })).rejects.toMatchObject({ status: 429 });
    // auth-js retries within the same tick; none of those may reach the server.
    vi.advanceTimersByTime(9_000);
    await expect(guarded(REFRESH_URL, { method: 'POST' })).rejects.toMatchObject({ status: 429 });
    expect(realFetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    await expect(guarded(REFRESH_URL, { method: 'POST' })).resolves.toMatchObject({ status: 200 });
    expect(realFetch).toHaveBeenCalledTimes(2);
  });

  it('pauses for 30 seconds after a rate limit that names no Retry-After', async () => {
    vi.useFakeTimers();
    const { guarded, realFetch } = refreshFetch(json({ msg: 'rate limited' }, 429));

    await expect(guarded(REFRESH_URL, { method: 'POST' })).rejects.toBeInstanceOf(AuthServerUnavailableError);
    vi.advanceTimersByTime(29_000);
    await expect(guarded(REFRESH_URL, { method: 'POST' })).rejects.toBeInstanceOf(AuthServerUnavailableError);
    vi.advanceTimersByTime(1_000);
    await guarded(REFRESH_URL, { method: 'POST' });

    expect(realFetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the stored session through an auth server error, where auth-js alone would delete it', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const expiredSession = JSON.stringify({
      access_token: 'expired-jwt',
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) - 60,
      user: { id: 'auth-1' },
    });
    const storedAfterRefresh = async (useGuard: boolean) => {
      vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(json({ code: 500, msg: 'database error' }, 500)));
      const store = new Map([['session-key', expiredSession]]);
      const client = createClient(SUPABASE_URL, ANON_KEY, {
        auth: {
          storageKey: 'session-key',
          storage: {
            getItem: (key) => store.get(key) ?? null,
            setItem: (key, value) => void store.set(key, value),
            removeItem: (key) => void store.delete(key),
          },
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: useGuard
          ? {
              fetch: createSessionGuardedFetch({
                supabaseUrl: SUPABASE_URL,
                anonKey: ANON_KEY,
                hasSession: () => true,
              }),
            }
          : {},
      });
      // With the guard auth-js retries the refresh for up to ~30s within the call.
      const pending = client.auth.getSession();
      await vi.advanceTimersByTimeAsync(31_000);
      const { error } = await pending;
      return { stored: store.has('session-key'), error };
    };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.useFakeTimers();

    const withoutGuard = await storedAfterRefresh(false);
    const withGuard = await storedAfterRefresh(true);

    expect(withoutGuard.stored).toBe(false);
    expect(withGuard.stored).toBe(true);
    expect(withGuard.error?.name).toBe('AuthRetryableFetchError');
  });
});
