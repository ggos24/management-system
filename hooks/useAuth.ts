import { useEffect } from 'react';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import { skewSecondsFromToken } from '../lib/clockSkew';
import { initTelegramChrome, isTelegramWebview, readInitData } from '../lib/telegram';

/**
 * Inside a Telegram Mini App there is no stored session and no password flow to
 * fall back on — Telegram hands us a freshly signed initData on every open, and
 * equipment-auth trades it for the user's own Supabase session.
 *
 * This has to run BEFORE the app concludes it is logged out, otherwise AuthGuard
 * redirects to /login and the Mini App dead-ends on a form its user cannot fill.
 *
 * The exchange happens once, at open. initData is not refreshed while the app
 * stays open, so a crew scanning for twenty minutes is holding a stale payload
 * by design — the minted session then lives on the normal refresh cycle, and a
 * re-exchange only ever happens on the next open. Never wire this to a 401.
 */
async function exchangeTelegramSession(): Promise<void> {
  const initData = readInitData();
  if (!initData) return;

  void initTelegramChrome();

  try {
    const { data, error } = await supabase.functions.invoke('equipment-auth', { body: { initData } });
    if (error) {
      console.error('equipment-auth invoke failed', error);
      return;
    }
    if (data?.status === 'ok' && data.session?.access_token) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      return;
    }
    if (data?.status === 'not_linked' || data?.status === 'no_access') {
      useAuthStore.getState().setTelegramGate(data.status);
    }
  } catch (error) {
    console.error('equipment-auth exchange failed', error);
  }
}

// Backoff for re-checking a stored session whose refresh failed on the network:
// 2s, 4s, 8s, 16s, then every 30s — and immediately when the browser comes back online.
const SESSION_RETRY_BASE_MS = 2_000;
const SESSION_RETRY_MAX_MS = 30_000;

export function useAuth() {
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    // Track which user we've already loaded data for. onAuthStateChange fires on
    // every token refresh (TOKEN_REFRESHED) and user update, and re-running the
    // ~20-query loadAllData() each time amplifies a refresh storm (e.g. from a
    // skewed device clock) into a request flood. Realtime sync keeps data current,
    // so we only do the full load once per signed-in user.
    let initialisedUserId: string | null = null;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAttempt = 0;

    const stopRetrying = () => {
      clearTimeout(retryTimer);
      retryTimer = undefined;
      retryAttempt = 0;
      window.removeEventListener('online', retryNow);
      if (useAuthStore.getState().isReconnecting) useAuthStore.getState().setIsReconnecting(false);
    };

    const applySession = (next: Session | null) => {
      // Any definitive answer from auth-js — a session, or a real sign-out —
      // ends a wait for the network.
      stopRetrying();
      const state = useAuthStore.getState();
      if (next) {
        if (initialisedUserId !== next.user.id) {
          if (initialisedUserId !== null) state.clearSessionState();
          initialisedUserId = next.user.id;
          state.setSession(next);
          state.setIsLoading(true);
          state.initData(next.user.id);
        } else {
          state.setSession(next);
        }
      } else {
        initialisedUserId = null;
        state.clearSessionState();
      }
    };

    const boot = async () => {
      if (isTelegramWebview()) {
        const { data } = await supabase.auth.getSession();
        // A session already in webview storage is reused; only a cold open pays
        // for the exchange.
        if (!data.session) await exchangeTelegramSession();
      }
      return supabase.auth.getSession();
    };

    // The stored session could not be confirmed, but nothing says it is invalid —
    // typically its access token expired while the app was closed and the refresh
    // request failed because the network is not back yet. auth-js keeps such a
    // session and refreshes it on its own once it can (TOKEN_REFRESHED reaches
    // applySession above). Keep the user on the loading screen and check again,
    // rather than sending them to /login: AuthGuard unmounts there, and with it
    // this listener, so the recovered session would never reach the app.
    const waitForNetwork = (reason: unknown) => {
      console.error('Could not confirm the stored session, retrying', reason);
      if (!useAuthStore.getState().isReconnecting) useAuthStore.getState().setIsReconnecting(true);
      const delay = Math.min(SESSION_RETRY_BASE_MS * 2 ** retryAttempt, SESSION_RETRY_MAX_MS);
      retryAttempt += 1;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(retryNow, delay);
      window.addEventListener('online', retryNow);
    };

    const runBoot = () => {
      boot().then(
        ({ data: { session: current }, error }) => {
          if (disposed) return;
          if (!error) {
            applySession(current);
            return;
          }
          if (isAuthRetryableFetchError(error)) {
            waitForNetwork(error);
            return;
          }
          // The server rejected the stored session (e.g. a revoked or already
          // used refresh token) and auth-js has dropped it. Clear any leftovers
          // locally and force a fresh login. Never a global sign-out here: that
          // would revoke the user's sessions on every other device too.
          supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          applySession(null);
        },
        (thrown) => {
          // An unexpected failure says nothing about the session itself.
          if (!disposed) waitForNetwork(thrown);
        },
      );
    };

    const retryNow = () => {
      clearTimeout(retryTimer);
      window.removeEventListener('online', retryNow);
      runBoot();
    };

    runBoot();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') {
        useAuthStore.getState().setNeedsPasswordSetup(true);
        return;
      }

      // An absent initial session is boot()'s call to make. auth-js reports
      // INITIAL_SESSION as null not only when nobody is signed in but also when
      // the stored token's refresh failed on the network, with the session still
      // in storage — clearing state on that would sign a signed-in user out.
      if (event === 'INITIAL_SESSION' && !next) return;

      // Measure device-vs-server clock skew, but ONLY from a provably just-minted
      // token. TOKEN_REFRESHED always carries a brand-new token, so `now - iat` is
      // pure clock skew. We deliberately do NOT measure on SIGNED_IN: auth-js
      // re-emits it on tab refocus with the EXISTING (possibly 40+ min old) token,
      // and an aged token's `now - iat` is indistinguishable from clock drift — that
      // produced false "your clock is N min ahead" banners for healthy users. The
      // genuine login path measures a fresh token in LoginPage instead.
      if (event === 'TOKEN_REFRESHED' && next) {
        useUiStore.getState().setClockSkew(skewSecondsFromToken(next.access_token));
      }

      applySession(next);
    });

    return () => {
      disposed = true;
      stopRetrying();
      subscription.unsubscribe();
    };
  }, []);

  return { session };
}
