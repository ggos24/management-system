import { createClient } from '@supabase/supabase-js';
import { createSessionGuardedFetch } from './sessionGuardedFetch';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Whether auth-js holds a session, for the fetch guard. A sign-out or a refresh
// token the server rejects clears it; a refresh that only failed on the network
// keeps the session, which is exactly when supabase-js would downgrade requests
// to the anon key.
let hasSession = false;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: createSessionGuardedFetch({ supabaseUrl, anonKey: supabaseAnonKey, hasSession: () => hasSession }),
  },
});

supabase.auth.onAuthStateChange((_event, session) => {
  hasSession = session !== null;
});
