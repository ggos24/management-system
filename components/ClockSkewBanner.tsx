import React, { useState } from 'react';
import { AlarmClockOff, RefreshCw } from 'lucide-react';
import { useUiStore } from '../stores/uiStore';
import { CLOCK_SKEW_WARN_SECONDS, CLOCK_SKEW_CRITICAL_SECONDS, recheckClockSkew } from '../lib/clockSkew';

const variantClasses = {
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-amber-200 dark:border-amber-900',
  error: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200 border-red-200 dark:border-red-900',
};

/**
 * Thin full-width strip warning the user when their device clock is far enough off
 * real time to cause repeated sign-outs (see lib/clockSkew.ts for the mechanism).
 *
 * The skew is a snapshot taken at the last sign-in / token refresh — it can only be
 * measured from a freshly-issued token — so after the user corrects their clock the
 * stale value lingers until the next refresh. The "recheck" button forces a fresh
 * measurement so the banner clears immediately once the clock is fixed.
 */
export const ClockSkewBanner: React.FC = () => {
  const skew = useUiStore((s) => s.clockSkewSeconds);
  const setClockSkew = useUiStore((s) => s.setClockSkew);
  const [checking, setChecking] = useState(false);

  if (skew == null || Math.abs(skew) < CLOCK_SKEW_WARN_SECONDS) return null;

  const minutes = Math.max(1, Math.round(Math.abs(skew) / 60));
  const direction = skew > 0 ? 'ahead of' : 'behind';
  const isCritical = skew >= CLOCK_SKEW_CRITICAL_SECONDS;

  const message = isCritical
    ? `Your computer's clock is about ${minutes} min ahead of real time, which keeps signing you out. Turn on "Set time automatically" in your system Date & Time settings.`
    : `Your computer's clock is about ${minutes} min ${direction} real time. Enable "Set time automatically" in your system Date & Time settings to avoid sign-in problems.`;

  const onRecheck = async () => {
    setChecking(true);
    try {
      // Keep the existing reading if the recheck can't confirm (e.g. rate-limited),
      // so a genuinely-wrong clock never gets a false all-clear.
      const fresh = await recheckClockSkew();
      if (fresh != null) setClockSkew(fresh);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-1.5 text-xs font-medium border-b ${
        variantClasses[isCritical ? 'error' : 'warning']
      }`}
    >
      <AlarmClockOff className="h-3.5 w-3.5 flex-shrink-0" />
      <span>{message}</span>
      <button
        type="button"
        onClick={onRecheck}
        disabled={checking}
        className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline disabled:opacity-60"
      >
        <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
        {checking ? 'Checking…' : 'I fixed it — recheck'}
      </button>
    </div>
  );
};
