import { useCallback } from 'react';
import { useNavigate, type NavigateOptions, type To } from 'react-router-dom';

type StartViewTransition = (cb: () => void) => { finished: Promise<void> };

/**
 * Wraps react-router's `useNavigate` with the native View Transitions API
 * when supported. Falls back to plain navigation on unsupported browsers
 * (Firefox) or when the user prefers reduced motion.
 */
export function useViewTransitionNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (to: To, opts?: NavigateOptions) => {
      const doc = document as Document & { startViewTransition?: StartViewTransition };
      const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!doc.startViewTransition || reduced) {
        navigate(to, opts);
        return;
      }
      doc.startViewTransition(() => navigate(to, opts));
    },
    [navigate],
  );
}
