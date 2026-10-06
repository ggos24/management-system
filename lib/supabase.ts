import { createClient } from '@supabase/supabase-js';
import { createSessionGuardedFetch } from './sessionGuardedFetch';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Whether auth-js holds a session, for the fetch guard. A sign-out or a refresh
// token the server rejects clears it; a refresh that only failed on the network
// mid-session keeps it, which is exactly when supabase-js would downgrade
// requests to the anon key. At app start the flag stays false until auth-js
// confirms the stored session (INITIAL_SESSION is null when that refresh fails),
// so the guard is off there — safe only because useAuth sends no data request
// until the session is confirmed. Anything that loads data before that point
// must not rely on this guard.
let hasSession = false;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: createSessionGuardedFetch({ supabaseUrl, anonKey: supabaseAnonKey, hasSession: () => hasSession }),
  },
});

supabase.auth.onAuthStateChange((_event, session) => {
  hasSession = session !== null;
});
