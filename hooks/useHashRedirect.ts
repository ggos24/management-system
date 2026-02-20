import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const KNOWN_VIEWS: Record<string, string> = {
  dashboard: '/dashboard',
  'my-workspace': '/workspace',
  schedule: '/schedule',
};

/**
 * Redirects legacy hash-based URLs to the new path-based routes.
 * e.g. /#dashboard → /dashboard, /#<teamId>?task=<id> → /teams/<teamId>?task=<id>
 * Skips Supabase auth hashes (access_token, type=invite).
 */
export function useHashRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || hash.length <= 1) return;

    const raw = hash.slice(1); // remove leading #

    // Skip Supabase auth callback hashes
    if (raw.includes('access_token') || raw.includes('type=invite') || raw.includes('type=recovery')) {
      return;
    }

    const [view, queryString] = raw.split('?');
    if (!view) return;

    const newPath = KNOWN_VIEWS[view] || `/teams/${view}`;
    const search = queryString ? `?${queryString}` : '';

    // Clear the hash and navigate to the new path
    window.history.replaceState({}, '', window.location.pathname);
    navigate(`${newPath}${search}`, { replace: true });
  }, [navigate]);
}
