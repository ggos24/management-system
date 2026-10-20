import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_STORAGE_KEY, signOutMustWaitForRefresh, supabase } from '../lib/supabase';

// Its own file: the client's fetch keeps the outcome of the last token refresh
// for the life of the module, and these tests make that refresh fail.

const storeSession = (expiresInSeconds: number) =>
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      access_token: 'jwt',
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
      user: { id: 'auth-1' },
    }),
  );

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.removeItem(AUTH_STORAGE_KEY);
});

describe('signOutMustWaitForRefresh', () => {
  it('is false while token refreshes work', () => {
    storeSession(-60);

    expect(signOutMustWaitForRefresh()).toBe(false);
  });

  it('is true once a refresh of an expired token has failed, and false for a token still valid', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('{"msg":"database error"}', { status: 500 })),
    );
    storeSession(-60);

    // The real client refreshes the expired token and the auth server answers 500.
    const pending = supabase.auth.getSession();
    await vi.advanceTimersByTimeAsync(31_000);
    await pending;

    expect(signOutMustWaitForRefresh()).toBe(true);
    // With a token that does not need refreshing, /logout can still be tried.
    storeSession(30 * 60);
    expect(signOutMustWaitForRefresh()).toBe(false);
  });
});
