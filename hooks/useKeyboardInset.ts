import { useEffect, useState } from 'react';

/** Below this, the gap is the collapsing URL bar rather than a keyboard. */
const KEYBOARD_MIN_HEIGHT = 80;

/**
 * Height in CSS pixels that the on-screen keyboard currently covers.
 *
 * The app shell is `h-dvh overflow-hidden`, so the document never scrolls out
 * from under the keyboard. On browsers that honour
 * `interactive-widget=resizes-content` (set in index.html) the layout viewport
 * shrinks on its own and this returns 0; on the ones that do not — iOS Safari
 * among them — a bottom-docked bar such as the support composer would otherwise
 * sit behind the keyboard with its send button out of reach. Consumers pad
 * themselves by the returned value.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const covered = window.innerHeight - (vv.height + vv.offsetTop);
      setInset(covered > KEYBOARD_MIN_HEIGHT ? Math.round(covered) : 0);
    };
    // Deferred rather than called inline so the first measurement is not a
    // setState in the effect body.
    const raf = requestAnimationFrame(update);

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
