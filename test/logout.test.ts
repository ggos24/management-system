import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as supabaseModule from '../lib/supabase';
import { AUTH_STORAGE_KEY, supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

const storedKeys = [AUTH_STORAGE_KEY, `${AUTH_STORAGE_KEY}-code-verifier`, `${AUTH_STORAGE_KEY}-user`];

function storeSession() {
  for (const key of storedKeys) localStorage.setItem(key, '{"stored":true}');
}

const stillStored = () => storedKeys.filter((key) => localStorage.getItem(key) !== null);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  storeSession();
  useAuthStore.setState({ session: { user: { id: 'auth-1' } } as never, isLoading: false });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of storedKeys) localStorage.removeItem(key);
  useAuthStore.getState().clearSessionState();
  useAuthStore.setState({ isSigningOut: false });
});

describe('logout', () => {
  it('uses the storage key supabase-js itself would use, so existing sessions survive', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    // A client left to pick its own key, for whatever URL this run is configured with.
    const reference = createClient(import.meta.env.VITE_SUPABASE_URL, 'key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    expect(AUTH_STORAGE_KEY).toBe((reference.auth as unknown as { storageKey: string }).storageKey);
    expect((supabase.auth as unknown as { storageKey: string }).storageKey).toBe(AUTH_STORAGE_KEY);
  });

  it('leaves the app at once and keeps the login form waiting until the sign-out is done', async () => {
    let finish!: () => void;
    vi.spyOn(supabase.auth, 'signOut').mockImplementation(
      () => new Promise((resolve) => (finish = () => resolve({ error: null }))),
    );

    const logout = useAuthStore.getState().logout();

    expect(useAuthStore.getState()).toMatchObject({ session: null, isSigningOut: true });
    finish();
    await logout;
    expect(useAuthStore.getState().isSigningOut).toBe(false);
  });

  it('ignores a second click while the first sign-out is still running', async () => {
    let finish!: () => void;
    const signOut = vi
      .spyOn(supabase.auth, 'signOut')
      .mockImplementation(() => new Promise((resolve) => (finish = () => resolve({ error: null }))));

    const first = useAuthStore.getState().logout();
    await useAuthStore.getState().logout();
    finish();
    await first;

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out on this device straight away while token refreshes are failing', async () => {
    vi.spyOn(supabaseModule, 'signOutMustWaitForRefresh').mockReturnValue(true);
    const signOut = vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({ error: null });

    await useAuthStore.getState().logout();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(stillStored()).toEqual([]);
  });

  it('signs out on every device when the server is reachable', async () => {
    const signOut = vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({ error: null });

    await useAuthStore.getState().logout();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith();
    expect(useAuthStore.getState().session).toBeNull();
  });

  it('still removes the session from this device when the server cannot be reached', async () => {
    // auth-js returns this without removing anything from storage.
    const signOut = vi
      .spyOn(supabase.auth, 'signOut')
      .mockResolvedValueOnce({ error: new AuthRetryableFetchError('Failed to fetch', 0) })
      .mockResolvedValue({ error: null });

    await useAuthStore.getState().logout();

    expect(stillStored()).toEqual([]);
    // The follow-up local sign-out has nothing left to refresh or revoke; it only
    // emits SIGNED_OUT here and in other tabs.
    expect(signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    expect(useAuthStore.getState().session).toBeNull();
  });

  it('goes straight to this device when the browser is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const signOut = vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({ error: null });

    await useAuthStore.getState().logout();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(stillStored()).toEqual([]);
    expect(useAuthStore.getState().session).toBeNull();
  });

  it('falls back to this device when the sign-out throws', async () => {
    vi.spyOn(supabase.auth, 'signOut')
      .mockRejectedValueOnce(new Error('lock not acquired'))
      .mockResolvedValue({ error: null });

    await useAuthStore.getState().logout();

    expect(stillStored()).toEqual([]);
    expect(useAuthStore.getState().session).toBeNull();
  });

  it('really clears an expired stored session with the real auth client, offline', async () => {
    vi.useFakeTimers();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    // Any request reaching the network fails: the device is offline. auth-js would
    // try to refresh this expired session before signing out, fail, and keep it.
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')));
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        access_token: 'expired-jwt',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) - 60,
        user: { id: 'auth-1' },
      }),
    );

    const logout = useAuthStore.getState().logout();
    await vi.advanceTimersByTimeAsync(31_000);
    await logout;
    vi.unstubAllGlobals();
    vi.useRealTimers();

    expect(stillStored()).toEqual([]);
  });
});
