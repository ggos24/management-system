import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

export function useAuth() {
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    let initialised = false;

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      const state = useAuthStore.getState();
      if (error) {
        // Corrupted or expired session — clear local state and force fresh login
        supabase.auth.signOut().catch(() => {});
        state.setSession(null);
        state.setCurrentUser(null);
        state.setIsLoading(false);
        return;
      }
      state.setSession(session);
      if (session) {
        initialised = true;
        state.initData(session.user.id);
      } else {
        state.setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const state = useAuthStore.getState();

      if (event === 'PASSWORD_RECOVERY') {
        state.setNeedsPasswordSetup(true);
        return;
      }

      // INITIAL_SESSION fires right after getSession — skip to avoid double init
      if (event === 'INITIAL_SESSION' && initialised) return;

      state.setSession(session);
      if (session) {
        state.initData(session.user.id);
      } else {
        state.setCurrentUser(null);
        state.setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session };
}
