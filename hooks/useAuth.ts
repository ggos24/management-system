import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';

export function useAuth() {
  const { session, setSession, setCurrentUser, setIsLoading, setProfileError, currentUser } = useAuthStore();
  const loadAllData = useDataStore((s) => s.loadAllData);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        initData(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session && !currentUser) {
        initData(session.user.id);
      } else if (!session) {
        setCurrentUser(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function initData(authUserId: string) {
    try {
      const profile = await loadAllData(authUserId);
      if (!profile) {
        setProfileError('No profile found for this account. Please contact an administrator.');
        setIsLoading(false);
        return;
      }
      setCurrentUser(profile);
    } catch {
      setProfileError('Failed to load application data. Please try refreshing.');
    } finally {
      setIsLoading(false);
    }
  }

  return { session, initData };
}
