import { useEffect, useState } from 'react';

/**
 * A clock that ticks, held in state.
 *
 * Overdue is a moving target with no cron behind the UI, and reading Date.now()
 * during render is impure — it would freeze "2h overdue" at whatever the last
 * unrelated render happened to observe.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
