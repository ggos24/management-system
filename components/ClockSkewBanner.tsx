import React from 'react';
import { AlarmClockOff } from 'lucide-react';
import { useUiStore } from '../stores/uiStore';
import { CLOCK_SKEW_WARN_SECONDS, CLOCK_SKEW_CRITICAL_SECONDS } from '../lib/clockSkew';

const variantClasses = {
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-amber-200 dark:border-amber-900',
  error: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200 border-red-200 dark:border-red-900',
};

/**
 * Thin full-width strip warning the user when their device clock is far enough off
 * real time to cause repeated sign-outs (see lib/clockSkew.ts for the mechanism).
 * Reads the skew measured at sign-in / token refresh from uiStore. Renders nothing
 * when the clock is within tolerance.
 */
export const ClockSkewBanner: React.FC = () => {
  const skew = useUiStore((s) => s.clockSkewSeconds);

  if (skew == null || Math.abs(skew) < CLOCK_SKEW_WARN_SECONDS) return null;

  const minutes = Math.max(1, Math.round(Math.abs(skew) / 60));
  const direction = skew > 0 ? 'ahead of' : 'behind';
  const isCritical = skew >= CLOCK_SKEW_CRITICAL_SECONDS;

  const message = isCritical
    ? `Your computer's clock is about ${minutes} min ahead of real time, which keeps signing you out. Open your system Date & Time settings, turn on "Set time automatically", then reload this page.`
    : `Your computer's clock is about ${minutes} min ${direction} real time. Enable "Set time automatically" in your system Date & Time settings to avoid sign-in problems.`;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium border-b ${
        variantClasses[isCritical ? 'error' : 'warning']
      }`}
    >
      <AlarmClockOff className="h-3.5 w-3.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
};
