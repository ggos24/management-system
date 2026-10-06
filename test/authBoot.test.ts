import { act, cleanup, renderHook } from '@testing-library/react';
import {
  AuthApiError,
  AuthRetryableFetchError,
  FunctionsFetchError,
  FunctionsHttpError,
  type AuthChangeEvent,
  type Session,
} from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../stores/authStore';

const telegram = vi.hoisted(() => ({ webview: false }));
vi.mock('../lib/telegram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/telegram')>()),
  isTelegramWebview: () => telegram.webview,
  readInitData: () => (telegram.webview ? 'signed-init-data' : null),
  initTelegramChrome: async () => undefined,
}));

type GetSessionResult = Awaited<ReturnType<typeof supabase.auth.getSession>>;

const session = { user: { id: 'auth-1' }, access_token: 'jwt' } as Session;
const signedIn: GetSessionResult = { data: { session }, error: null };
const noSession: GetSessionResult = { data: { session: null }, error: null };
// What auth-js returns when the stored access token has expired and the refresh
// request failed because the network is down. The session is still in storage.
const networkDown = { data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) } as never;
const refreshRejected = {
  data: { session: null },
  error: new AuthApiError('Invalid Refresh Token: Already Used', 400, 'refresh_token_already_used'),
} as never;

let emitAuthEvent: (event: AuthChangeEvent, next: Session | null) => void;
const originalInitData = useAuthStore.getState().initData;
const initData = vi.fn<(authUserId: string) => Promise<void>>();

function mockAuth(...results: Array<GetSessionResult | Error>) {
  const getSession = vi.spyOn(supabase.auth, 'getSession');
  for (const result of results) {
    if (result instanceof Error) getSession.mockRejectedValueOnce(result);
    else getSession.mockResolvedValueOnce(result);
  }
  getSession.mockResolvedValue(signedIn);
  const signOut = vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({ error: null });
  vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((callback) => {
    emitAuthEvent = (event, next) => void callback(event, next);
    return { data: { subscription: { id: 'sub', callback, unsubscribe: vi.fn() } } } as never;
  });
  return { getSession, signOut };
}

/**
 * Records every moment AuthGuard would have redirected to /login (no session,
 * not loading). In the app that redirect unmounts AuthGuard and with it the
 * auth listener, so a session that arrives afterwards is lost.
 */
function watchLoginRedirects() {
  const redirect = vi.fn();
  const unsubscribe = useAuthStore.subscribe((state) => {
    if (!state.session && !state.isLoading) redirect();
  });
  return { redirect, unsubscribe };
}

/** Lets the boot promise chain settle without moving the clock. */
const settle = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  initData.mockReset().mockResolvedValue(undefined);
  useAuthStore.setState({ session: null, currentUser: null, isLoading: true, isReconnecting: false, initData });
});

afterEach(() => {
  cleanup();
  telegram.webview = false;
  vi.useRealTimers();
  vi.restoreAllMocks();
  useAuthStore.setState({ initData: originalInitData });
  useAuthStore.getState().clearSessionState();
});

describe('session check on app start', () => {
  it('keeps a user signed in when the token refresh fails on the network', async () => {
    const { getSession, signOut } = mockAuth(networkDown);

    renderHook(() => useAuth());
    // auth-js reports the unconfirmed session as a null INITIAL_SESSION.
    act(() => emitAuthEvent('INITIAL_SESSION', null));
    await settle();

    expect(signOut).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ isLoading: true, isReconnecting: true });

    // Network back: the retry confirms the session and the app loads.
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(initData).toHaveBeenCalledWith('auth-1');
    expect(useAuthStore.getState()).toMatchObject({ session, isReconnecting: false });
  });

  it('backs off between retries and stops once the session is confirmed', async () => {
    const { getSession } = mockAuth(networkDown, networkDown, networkDown);

    renderHook(() => useAuth());
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(getSession).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(3_999));
    expect(getSession).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(getSession).toHaveBeenCalledTimes(3);
    await act(() => vi.advanceTimersByTimeAsync(8_000));
    expect(getSession).toHaveBeenCalledTimes(4);

    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(getSession).toHaveBeenCalledTimes(4);
    expect(initData).toHaveBeenCalledTimes(1);
  });

  it('retries as soon as the browser is back online', async () => {
    const { getSession } = mockAuth(networkDown);

    renderHook(() => useAuth());
    await settle();
    act(() => void window.dispatchEvent(new Event('online')));
    await settle();

    expect(getSession).toHaveBeenCalledTimes(2);
    expect(initData).toHaveBeenCalledWith('auth-1');
    // The pending backoff timer was cancelled, not left to fire again.
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('picks up the session when auth-js refreshes it on its own', async () => {
    const { getSession } = mockAuth(networkDown);

    renderHook(() => useAuth());
    await settle();
    act(() => emitAuthEvent('TOKEN_REFRESHED', session));

    expect(initData).toHaveBeenCalledWith('auth-1');
    expect(useAuthStore.getState().isReconnecting).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('retries when the session check itself throws', async () => {
    const { getSession, signOut } = mockAuth(new Error('lock not acquired'));

    renderHook(() => useAuth());
    await settle();
    expect(signOut).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isReconnecting).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(initData).toHaveBeenCalledWith('auth-1');
  });

  it('signs out locally, never globally, when the server rejects the stored session', async () => {
    const { getSession, signOut } = mockAuth(refreshRejected);

    renderHook(() => useAuth());
    await settle();

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(useAuthStore.getState()).toMatchObject({ session: null, isLoading: false, isReconnecting: false });
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('sends a visitor without a session to the login screen', async () => {
    const { signOut } = mockAuth(noSession);

    renderHook(() => useAuth());
    act(() => emitAuthEvent('INITIAL_SESSION', null));
    await settle();

    expect(signOut).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ session: null, isLoading: false });
  });

  it('still clears the app on a real sign-out while waiting for the network', async () => {
    const { getSession } = mockAuth(networkDown);

    renderHook(() => useAuth());
    await settle();
    // e.g. auth-js's own refresh later gets a definitive "token revoked".
    act(() => emitAuthEvent('SIGNED_OUT', null));

    expect(useAuthStore.getState()).toMatchObject({ session: null, isLoading: false, isReconnecting: false });
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('lets the session check overrule a SIGNED_OUT that arrives while it runs', async () => {
    const { getSession } = mockAuth();
    let resolveCheck!: (result: GetSessionResult) => void;
    getSession.mockReset().mockImplementationOnce(() => new Promise((resolve) => (resolveCheck = resolve)));

    const { redirect, unsubscribe } = watchLoginRedirects();
    renderHook(() => useAuth());
    // auth-js drops a revoked stored session during its own start-up…
    act(() => emitAuthEvent('SIGNED_OUT', null));
    // …and the check still ends with whatever session exists by then.
    resolveCheck(signedIn);
    await settle();
    unsubscribe();

    expect(redirect).not.toHaveBeenCalled();
    expect(initData).toHaveBeenCalledWith('auth-1');
    expect(useAuthStore.getState().session).toEqual(session);
  });

  it('keeps a Telegram user in the app when their stored session was revoked', async () => {
    telegram.webview = true;
    const { getSession } = mockAuth();
    let resolveStored!: (result: GetSessionResult) => void;
    getSession
      .mockReset()
      // The stored session is rejected and dropped while this check runs…
      .mockImplementationOnce(() => new Promise((resolve) => (resolveStored = resolve)))
      // …then the initData exchange mints a fresh one.
      .mockResolvedValue(signedIn);
    // `supabase.functions` builds a new client on every access, so stub the shared prototype.
    vi.spyOn(Object.getPrototypeOf(supabase.functions), 'invoke').mockResolvedValue({
      data: { status: 'ok', session: { access_token: 'fresh', refresh_token: 'fresh-refresh' } },
      error: null,
    } as never);
    const setSession = vi.spyOn(supabase.auth, 'setSession').mockResolvedValue(signedIn as never);

    const { redirect, unsubscribe } = watchLoginRedirects();
    renderHook(() => useAuth());
    act(() => emitAuthEvent('SIGNED_OUT', null));
    resolveStored(noSession);
    await settle();
    unsubscribe();

    expect(setSession).toHaveBeenCalledWith({ access_token: 'fresh', refresh_token: 'fresh-refresh' });
    // Never bounced to /login on the way, which would unmount the listener.
    expect(redirect).not.toHaveBeenCalled();
    expect(initData).toHaveBeenCalledWith('auth-1');
    expect(useAuthStore.getState()).toMatchObject({ session, isLoading: true });
  });

  it('retries a Telegram cold open whose initData exchange could not reach the server', async () => {
    telegram.webview = true;
    const { getSession } = mockAuth();
    // No session until an exchange succeeds: two checks on the failed open, one on the retry.
    getSession
      .mockReset()
      .mockResolvedValueOnce(noSession)
      .mockResolvedValueOnce(noSession)
      .mockResolvedValueOnce(noSession)
      .mockResolvedValue(signedIn);
    const invoke = vi
      .spyOn(Object.getPrototypeOf(supabase.functions), 'invoke')
      .mockResolvedValueOnce({ data: null, error: new FunctionsFetchError(new TypeError('Failed to fetch')) } as never)
      .mockResolvedValue({
        data: { status: 'ok', session: { access_token: 'fresh', refresh_token: 'fresh-refresh' } },
        error: null,
      } as never);
    vi.spyOn(supabase.auth, 'setSession').mockResolvedValue(signedIn as never);
    const { redirect, unsubscribe } = watchLoginRedirects();

    renderHook(() => useAuth());
    await settle();
    expect(useAuthStore.getState().isReconnecting).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    unsubscribe();

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(redirect).not.toHaveBeenCalled();
    expect(initData).toHaveBeenCalledWith('auth-1');
  });

  it('does not retry a Telegram exchange the function rejected', async () => {
    telegram.webview = true;
    const { getSession } = mockAuth();
    getSession.mockReset().mockResolvedValue(noSession);
    const invoke = vi
      .spyOn(Object.getPrototypeOf(supabase.functions), 'invoke')
      .mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response('{}', { status: 401 })) } as never);

    renderHook(() => useAuth());
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(60_000));

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ session: null, isLoading: false, isReconnecting: false });
  });

  it('stops retrying when the guard unmounts', async () => {
    const { getSession } = mockAuth(networkDown);

    const { unmount } = renderHook(() => useAuth());
    await settle();
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    act(() => void window.dispatchEvent(new Event('online')));
    await settle();

    expect(getSession).toHaveBeenCalledTimes(1);
  });
});
