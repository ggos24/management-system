import { useEffect, useState } from 'react';

/**
 * Returns true on devices with a fine-pointer hover capability (desktop mice),
 * false on touch-only devices. Reacts to input-mode changes (iPad Magic
 * Keyboard attach/detach, Windows tablet mode).
 */
export function useHasHover(): boolean {
  const [hasHover, setHasHover] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(hover: hover)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover)');
    const handler = (e: MediaQueryListEvent) => setHasHover(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return hasHover;
}
