import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { Member } from '../types';
import { supabase } from '../lib/supabase';
import * as db from '../lib/database';
import { useDataStore } from './dataStore';
import { useUiStore } from './uiStore';

// Serialise bootstraps so an old account's slower response cannot overwrite a
// newly selected account in the shared Zustand stores.
let initPromise: Promise<void> | null = null;
let initUserId: string | null = null;
let authEpoch = 0;
// Wakes initData retry sleeps whose load a new epoch has superseded, so the
// next load (which awaits the previous one) does not wait out their delay.
const retrySleepers = new Set<() => void>();

function nextAuthEpoch(): number {
  authEpoch += 1;
  for (const wake of [...retrySleepers]) wake();
  return authEpoch;
}

// Retrying a first load whose profile request failed (typically a network blip
// right after the session was confirmed): 2s, 4s, 8s, 16s — about half a minute
// — before reporting an error. While the browser says it is offline the wait
// does not count; it ends early as soon as the browser is back online.
const INIT_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000];
const INIT_OFFLINE_RECHECK_MS = 30_000;

function waitBeforeRetry(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener('online', done);
      retrySleepers.delete(done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    window.addEventListener('online', done);
    retrySleepers.add(done);
  });
}

export interface AuthSessionSnapshot {
  epoch: number;
  authUserId: string | null;
  profileId: string | null;
  accessScope: Member['accessScope'] | null;
}

/**
 * Why a Telegram user can be turned away: the Mini App identifies a Telegram
 * account, and mapping it to a profile needs a telegram_links row. There is no
 * password path to offer them, so these states get their own screen.
 */
export type TelegramGateState = 'not_linked' | 'no_access';

/**
 * Thrown by reloadData() when the refreshed bundle was not fully loaded, so the
 * caller can retry. `profile`: the caller's own profile could not be read, so
 * nothing was reconciled and task access is unverified. `partial`: the profile
 * and access scope were confirmed, but some slices failed and kept their
 * previous value.
 */
export class DataReloadError extends Error {
  readonly reason: 'profile' | 'partial';

  constructor(reason: 'profile' | 'partial') {
    super(reason === 'profile' ? 'Could not load the signed-in profile' : 'Some workspace data failed to reload');
    this.name = 'DataReloadError';
    this.reason = reason;
  }
}

interface AuthState {
  session: Session | null;
  currentUser: Member | null;
  isLoading: boolean;
  // The stored session could not be confirmed because the network or auth server
  // is unreachable; useAuth keeps retrying while the loading screen says so.
  isReconnecting: boolean;
  profileError: string | null;
  needsPasswordSetup: boolean;
  telegramGate: TelegramGateState | null;

  setSession: (session: Session | null) => void;
  setCurrentUser: (user: Member | null) => void;
  setIsLoading: (loading: boolean) => void;
  setIsReconnecting: (reconnecting: boolean) => void;
  setProfileError: (error: string | null) => void;
  setNeedsPasswordSetup: (needs: boolean) => void;
  setTelegramGate: (gate: TelegramGateState | null) => void;
  initData: (authUserId: string) => Promise<void>;
  /** Resolves true once fresh data is committed, false when superseded or signed out. */
  reloadData: () => Promise<boolean>;
  clearSessionState: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  currentUser: null,
  isLoading: true,
  isReconnecting: false,
  profileError: null,
  needsPasswordSetup: (() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);
    const type = hashParams.get('type') || queryParams.get('type');
    return type === 'invite' || type === 'recovery';
  })(),
  telegramGate: null,

  setSession: (session) => set({ session }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setIsReconnecting: (isReconnecting) => set({ isReconnecting }),
  setProfileError: (error) => set({ profileError: error }),
  setNeedsPasswordSetup: (needs) => set({ needsPasswordSetup: needs }),
  setTelegramGate: (telegramGate) => set({ telegramGate }),

  initData: (authUserId: string) => {
    if (initPromise && initUserId === authUserId) return initPromise;

    const previousInit = initPromise;
    const generation = nextAuthEpoch();
    initUserId = authUserId;
    const shouldCommit = () => isAuthLoadCurrent(generation, authUserId);
    const nextInit = (async () => {
      if (previousInit) await previousInit.catch(() => undefined);
      if (!shouldCommit()) return;
      try {
        set({ profileError: null });
        let profile: Member | null = null;
        for (let failures = 0; ; ) {
          try {
            // A slice that fails here stays empty; the reload that follows once the
            // realtime access channel subscribes fills it in. Only the profile
            // lookup throws.
            ({ profile } = await useDataStore.getState().loadAllData(authUserId, shouldCommit));
            break;
          } catch (error) {
            if (!shouldCommit()) return;
            const offline = navigator.onLine === false;
            if (!offline && failures >= INIT_RETRY_DELAYS_MS.length) throw error;
            console.error('Failed to load the profile, retrying', error);
            set({ isReconnecting: true });
            await waitBeforeRetry(offline ? INIT_OFFLINE_RECHECK_MS : INIT_RETRY_DELAYS_MS[failures]);
            if (!offline) failures += 1;
            if (!shouldCommit()) return;
          }
        }
        if (!shouldCommit()) return;
        if (!profile) {
          set({
            profileError: 'No profile found for this account. Please contact an administrator.',
            isReconnecting: false,
          });
          return;
        }
        // Notifications are non-critical. Publish the authenticated profile and
        // release the loading screen before awaiting them, so a realtime reload
        // cannot supersede this epoch and leave the app stuck loading.
        set({ currentUser: profile, isLoading: false, isReconnecting: false });
        await useUiStore.getState().loadNotifications(shouldCommit);
      } catch {
        if (shouldCommit()) {
          set({ profileError: 'Failed to load application data. Please try refreshing.', isReconnecting: false });
        }
      } finally {
        if (shouldCommit()) {
          set({ isLoading: false });
          initPromise = null;
          initUserId = null;
        }
      }
    })();
    initPromise = nextInit;
    return nextInit;
  },

  reloadData: async () => {
    const authUserId = get().session?.user.id;
    if (!authUserId) return false;
    const generation = nextAuthEpoch();
    const shouldCommit = () => isAuthLoadCurrent(generation, authUserId);
    const previousScope = get().currentUser?.accessScope;
    const { profile, complete } = await useDataStore.getState().loadAllData(authUserId, shouldCommit);
    // Superseded by a newer reload or a sign-out: that one owns the outcome.
    if (!shouldCommit()) return false;
    if (!profile) throw new DataReloadError('profile');
    if (previousScope && previousScope !== profile.accessScope) {
      useUiStore.getState().resetSessionUi();
    }
    // This reload may have superseded a first load still retrying (its epoch is
    // now stale, so it will never release the loading screen); the profile and
    // data committed here are a complete substitute for it.
    set({ currentUser: profile, profileError: null, isLoading: false, isReconnecting: false });
    await useUiStore.getState().loadNotifications(shouldCommit);
    if (!complete) throw new DataReloadError('partial');
    return true;
  },

  clearSessionState: () => {
    nextAuthEpoch();
    initUserId = null;
    useDataStore.getState().resetData();
    useUiStore.getState().resetSessionUi();
    set({ session: null, currentUser: null, profileError: null, isLoading: false, isReconnecting: false });
  },

  logout: async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      get().clearSessionState();
    }
  },
}));

function isAuthLoadCurrent(epoch: number, authUserId: string): boolean {
  return authEpoch === epoch && useAuthStore.getState().session?.user.id === authUserId;
}

export function captureAuthSession(): AuthSessionSnapshot {
  const state = useAuthStore.getState();
  return {
    epoch: authEpoch,
    authUserId: state.session?.user.id ?? null,
    profileId: state.currentUser?.id ?? null,
    accessScope: state.currentUser?.accessScope ?? null,
  };
}

export function isAuthSessionCurrent(snapshot: AuthSessionSnapshot): boolean {
  const current = captureAuthSession();
  return (
    current.epoch === snapshot.epoch &&
    current.authUserId === snapshot.authUserId &&
    current.profileId === snapshot.profileId &&
    current.accessScope === snapshot.accessScope
  );
}

export async function loadProfile(authUserId: string): Promise<Member | null> {
  return db.findProfileByAuthId(authUserId);
}
