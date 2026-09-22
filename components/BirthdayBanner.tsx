import React, { useEffect, useMemo, useState } from 'react';
import { Cake, X } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { isBirthdayOn } from '../lib/birthday';
import { Avatar } from './Avatar';

/** Past this the faces just crowd the strip — the message still names everyone. */
const MAX_AVATARS = 3;

/** The local calendar day as `YYYY-MM-DD`: what "today" means here, and what a dismissal records. */
function dayKeyOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A few seconds past the next local midnight, so the timer can never land back on the same day. */
function msUntilTomorrow(from: Date): number {
  const tomorrow = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, 0, 0, 5);
  return tomorrow.getTime() - from.getTime();
}

function readDismissal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "Ada", "Ada and Grace", "Ada, Grace and Alan". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Thin celebratory strip naming whoever has a birthday today, in the same in-flow slot as
 * OfflineBanner and ClockSkewBanner. On every other day of the year it renders nothing and
 * costs no layout space.
 *
 * Birthdays are already on every profile and already loaded into the data store, so this
 * reads them rather than fetching: see lib/birthday.ts for the stored format and for why
 * 29 February is congratulated on the 28th in a common year.
 */
export const BirthdayBanner: React.FC = () => {
  const members = useDataStore((s) => s.members);
  const currentUser = useAuthStore((s) => s.currentUser);

  // "Today" has to be state rather than a plain render-time clock read: this is a long-lived
  // SPA, and a tab left open overnight would otherwise keep showing yesterday's birthday.
  const [today, setToday] = useState(() => new Date());
  const dayKey = dayKeyOf(today);

  // The key carries the user id because these entries are never cleared on sign-out, and the
  // stored value is the day itself — which is what makes the dismissal expire on its own.
  const dismissalKey = `birthday-banner-dismissed-${currentUser?.id ?? 'anon'}`;
  const [dismissedOn, setDismissedOn] = useState(() => readDismissal(dismissalKey));
  const [prevDismissalKey, setPrevDismissalKey] = useState(dismissalKey);

  // Signing in as someone else swaps the key; re-read rather than inherit the other dismissal.
  if (prevDismissalKey !== dismissalKey) {
    setPrevDismissalKey(dismissalKey);
    setDismissedOn(readDismissal(dismissalKey));
  }

  useEffect(() => {
    const sync = () => setToday((prev) => (dayKeyOf(prev) === dayKeyOf(new Date()) ? prev : new Date()));
    const timer = window.setTimeout(sync, msUntilTomorrow(new Date()));
    // A sleeping laptop can sail straight past that timeout, so also catch up when the tab wakes.
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [dayKey]);

  const celebrants = useMemo(() => members.filter((m) => isBirthdayOn(m.birthday, today)), [members, today]);

  if (celebrants.length === 0 || dismissedOn === dayKey) return null;

  const isOwnBirthday = celebrants.length === 1 && celebrants[0].id === currentUser?.id;
  const message = isOwnBirthday
    ? `Happy birthday, ${firstName(celebrants[0].name)}!`
    : celebrants.length === 1
      ? `Today is ${celebrants[0].name}'s birthday`
      : `Birthdays today: ${joinNames(celebrants.map((m) => firstName(m.name)))}`;

  const onDismiss = () => {
    setDismissedOn(dayKey);
    try {
      localStorage.setItem(dismissalKey, dayKey);
    } catch {
      // A private window can refuse to store — hiding it for this session is enough.
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-1.5 text-xs font-medium bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200 border-b border-fuchsia-200 dark:border-fuchsia-900"
    >
      <Cake className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="flex flex-shrink-0 items-center -space-x-1.5">
        {celebrants.slice(0, MAX_AVATARS).map((member) => (
          <Avatar
            key={member.id}
            src={member.avatar}
            alt={member.name}
            size="sm"
            className="!w-5 !h-5 !border-fuchsia-100 dark:!border-fuchsia-950"
          />
        ))}
      </span>
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss birthday banner"
        className="ml-1 flex-shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 hover:bg-fuchsia-200/70 dark:hover:bg-fuchsia-900/70"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
