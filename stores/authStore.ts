import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { Member } from '../types';
import { supabase } from '../lib/supabase';
import * as db from '../lib/database';
import { useDataStore } from './dataStore';
import { useUiStore } from './uiStore';

// Concurrency guard — prevents parallel initData calls
let initPromise: Promise<void> | null = null;

interface AuthState {
  session: Session | null;
  currentUser: Member | null;
  isLoading: boolean;
  profileError: string | null;
  needsPasswordSetup: boolean;

  setSession: (session: Session | null) => void;
  setCurrentUser: (user: Member | null) => void;
  setIsLoading: (loading: boolean) => void;
  setProfileError: (error: string | null) => void;
  setNeedsPasswordSetup: (needs: boolean) => void;
  initData: (authUserId: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, _get) => ({
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

  setSession: (session) => set({ session }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setProfileError: (error) => set({ profileError: error }),
  setNeedsPasswordSetup: (needs) => set({ needsPasswordSetup: needs }),

  initData: (authUserId: string) => {
    // If already running, return existing promise (dedup)
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        set({ profileError: null });
        const profile = await useDataStore.getState().loadAllData(authUserId);
        if (!profile) {
          set({ profileError: 'No profile found for this account. Please contact an administrator.' });
          return;
        }
        set({ currentUser: profile });
        useUiStore.getState().loadNotifications();
      } catch {
        set({ profileError: 'Failed to load application data. Please try refreshing.' });
      } finally {
        set({ isLoading: false });
        initPromise = null;
      }
    })();

    return initPromise;
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ session: null, currentUser: null, profileError: null });
  },
}));

export async function loadProfile(authUserId: string): Promise<Member | null> {
  return db.findProfileByAuthId(authUserId);
}
