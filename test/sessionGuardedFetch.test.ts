import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionGuardedFetch, SessionUnavailableError } from '../lib/sessionGuardedFetch';

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
