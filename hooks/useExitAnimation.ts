import { useEffect, useState } from 'react';

/**
 * Keeps a component mounted long enough to play a closing animation.
 * Components key animations off the returned `state` via `data-state` and
 * unmount only after `shouldRender` flips back to false.
 */
export function useExitAnimation(open: boolean, durationMs = 180) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
    }
  }

  useEffect(() => {
    if (!isClosing) return;
    const t = setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, durationMs);
    return () => clearTimeout(t);
  }, [isClosing, durationMs]);

  const state: 'open' | 'closed' = open && !isClosing ? 'open' : 'closed';
  return { shouldRender, state } as const;
}
