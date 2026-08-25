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

interface AuthState {
  session: Session | null;
  currentUser: Member | null;
  isLoading: boolean;
  profileError: string | null;
  needsPasswordSetup: boolean;
  telegramGate: TelegramGateState | null;

  setSession: (session: Session | null) => void;
  setCurrentUser: (user: Member | null) => void;
  setIsLoading: (loading: boolean) => void;
  setProfileError: (error: string | null) => void;
  setNeedsPasswordSetup: (needs: boolean) => void;
  setTelegramGate: (gate: TelegramGateState | null) => void;
  initData: (authUserId: string) => Promise<void>;
  reloadData: () => Promise<void>;
  clearSessionState: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  currentUser: null,
  isLoading: true,
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
  setProfileError: (error) => set({ profileError: error }),
  setNeedsPasswordSetup: (needs) => set({ needsPasswordSetup: needs }),
  setTelegramGate: (telegramGate) => set({ telegramGate }),

  initData: (authUserId: string) => {
    if (initPromise && initUserId === authUserId) return initPromise;

    const previousInit = initPromise;
    const generation = ++authEpoch;
    initUserId = authUserId;
    const shouldCommit = () => isAuthLoadCurrent(generation, authUserId);
    const nextInit = (async () => {
      if (previousInit) await previousInit.catch(() => undefined);
      if (!shouldCommit()) return;
      try {
        set({ profileError: null });
        const profile = await useDataStore.getState().loadAllData(authUserId, shouldCommit);
        if (!shouldCommit()) return;
        if (!profile) {
          set({ profileError: 'No profile found for this account. Please contact an administrator.' });
          return;
        }
        // Notifications are non-critical. Publish the authenticated profile and
        // release the loading screen before awaiting them, so a realtime reload
        // cannot supersede this epoch and leave the app stuck loading.
        set({ currentUser: profile, isLoading: false });
        await useUiStore.getState().loadNotifications(shouldCommit);
      } catch {
        if (shouldCommit()) {
          set({ profileError: 'Failed to load application data. Please try refreshing.' });
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
    if (!authUserId) return;
    const generation = ++authEpoch;
    const shouldCommit = () => isAuthLoadCurrent(generation, authUserId);
    const previousScope = get().currentUser?.accessScope;
    const profile = await useDataStore.getState().loadAllData(authUserId, shouldCommit);
    if (!profile || !shouldCommit()) return;
    if (previousScope && previousScope !== profile.accessScope) {
      useUiStore.getState().resetSessionUi();
    }
    set({ currentUser: profile, profileError: null });
    await useUiStore.getState().loadNotifications(shouldCommit);
  },

  clearSessionState: () => {
    authEpoch++;
    initUserId = null;
    useDataStore.getState().resetData();
    useUiStore.getState().resetSessionUi();
    set({ session: null, currentUser: null, profileError: null, isLoading: false });
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
