import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import { skewSecondsFromToken } from '../lib/clockSkew';

export function useAuth() {
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    // Track which user we've already loaded data for. onAuthStateChange fires on
    // every token refresh (TOKEN_REFRESHED) and user update, and re-running the
    // ~20-query loadAllData() each time amplifies a refresh storm (e.g. from a
    // skewed device clock) into a request flood. Realtime sync keeps data current,
    // so we only do the full load once per signed-in user.
    let initialisedUserId: string | null = null;

    const applySession = (next: Session | null) => {
      const state = useAuthStore.getState();
      state.setSession(next);
      if (next) {
        if (initialisedUserId !== next.user.id) {
          initialisedUserId = next.user.id;
          state.initData(next.user.id);
        }
      } else {
        initialisedUserId = null;
        state.setCurrentUser(null);
        state.setIsLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session: current }, error }) => {
      if (error) {
        // Corrupted or invalid stored session — clear local state, force fresh login.
        const state = useAuthStore.getState();
        supabase.auth.signOut().catch(() => {});
        state.setSession(null);
        state.setCurrentUser(null);
        state.setIsLoading(false);
        return;
      }
      applySession(current);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') {
        useAuthStore.getState().setNeedsPasswordSetup(true);
        return;
      }

      // Measure device-vs-server clock skew from freshly-minted tokens. A clock
      // running far enough ahead born-expires tokens and drives the repeated-logout
      // refresh loop; surfacing the skew turns that into an actionable warning.
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && next) {
        useUiStore.getState().setClockSkew(skewSecondsFromToken(next.access_token));
      }

      applySession(next);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session };
}
