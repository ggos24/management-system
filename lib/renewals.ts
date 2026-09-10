import type {
  Accreditation,
  AccreditationKind,
  AccreditationStatus,
  BillingPeriod,
  Currency,
  Subscription,
  SubscriptionCategory,
  SubscriptionStatus,
} from '../types';

/**
 * Pure helpers shared by the Tools pages and the daily reminder cron under
 * api/. Nothing here touches React or Supabase on purpose: the cron bundle
 * must not drag the browser client in, and every rule about "how close is
 * close" lives in exactly one place.
 */

/** An accreditation this close to its end shows as "expiring". */
export const EXPIRING_SOON_DAYS = 30;
/** A payment this close shows as "due soon". Monthly plans are always within 30 days. */
export const DUE_SOON_DAYS = 7;
/** Days before a due date on which the digest cron reminds admins. */
export const REMINDER_OFFSETS = [30, 7, 1] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];

export type BadgeColor = 'zinc' | 'emerald' | 'red' | 'blue' | 'amber' | 'purple';

// --- Labels & ordered lists (pickers, chips, digest lines) ---

export const ACCREDITATION_KINDS: AccreditationKind[] = [
  'military',
  'government',
  'parliament',
  'event',
  'press_card',
  'other',
];
export const ACCREDITATION_KIND_LABEL: Record<AccreditationKind, string> = {
  military: 'Military',
  government: 'Government',
  parliament: 'Parliament',
  event: 'Event',
  press_card: 'Press card',
  other: 'Other',
};
export const ACCREDITATION_STATUSES: AccreditationStatus[] = ['active', 'pending', 'revoked'];
export const ACCREDITATION_STATUS_LABEL: Record<AccreditationStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  revoked: 'Revoked',
};

export const SUBSCRIPTION_CATEGORIES: SubscriptionCategory[] = [
  'software',
  'ai',
  'media',
  'hosting',
  'communication',
  'other',
];
export const SUBSCRIPTION_CATEGORY_LABEL: Record<SubscriptionCategory, string> = {
  software: 'Software',
  ai: 'AI',
  media: 'Media',
  hosting: 'Hosting',
  communication: 'Communication',
  other: 'Other',
};
export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ['active', 'paused', 'cancelled'];
export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  cancelled: 'Cancelled',
};
export const BILLING_PERIODS: BillingPeriod[] = ['monthly', 'quarterly', 'yearly', 'one_time'];
export const BILLING_PERIOD_LABEL: Record<BillingPeriod, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  one_time: 'One-time',
};
/** Short suffix after an amount: "$59.99 / month". */
export const BILLING_PERIOD_SUFFIX: Record<BillingPeriod, string> = {
  monthly: '/ month',
  quarterly: '/ quarter',
  yearly: '/ year',
  one_time: 'one-time',
};
export const CURRENCIES: Currency[] = ['UAH', 'USD', 'EUR'];

// --- Dates (YYYY-MM-DD strings, local midnight) ---

const DAY_MS = 86_400_000;

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateOnly(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Today as YYYY-MM-DD in the runtime's local zone. */
export function todayDateOnly(now: number = Date.now()): string {
  return formatDateOnly(new Date(now));
}

/** A YYYY-MM-DD string shifted by whole days. */
export function addDays(dateOnly: string, days: number): string {
  const date = parseDateOnly(dateOnly);
  if (!date) return dateOnly;
  date.setDate(date.getDate() + days);
  return formatDateOnly(date);
}

/**
 * Signed whole days from `now` (local midnight) to the date; negative means
 * past. Same arithmetic as getDateDiffFromToday in lib/utils.ts, with the
 * clock injected so useNow() and the tests drive it instead of Date.now().
 */
export function daysUntil(dateOnly: string | null | undefined, now: number): number | null {
  const target = parseDateOnly(dateOnly);
  if (!target) return null;
  const current = new Date(now);
  const today = new Date(current.getFullYear(), current.getMonth(), current.getDate());
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

export function describeCountdown(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Text colour for a date cell: red once past, amber inside the warning window. */
export function countdownClass(days: number | null, soonDays: number): string {
  if (days === null) return 'text-zinc-500';
  if (days < 0) return 'text-red-600 dark:text-red-400 font-medium';
  if (days <= soonDays) return 'text-amber-600 dark:text-amber-400 font-medium';
  return 'text-zinc-500';
}

// --- Derived states. Never stored: a stored "expired" would need a job to flip it. ---

export type AccreditationState = 'pending' | 'valid' | 'expiring' | 'expired' | 'revoked' | 'no_expiry';

export const ACCREDITATION_STATE_BADGE: Record<AccreditationState, { color: BadgeColor; label: string }> = {
  valid: { color: 'emerald', label: 'Valid' },
  no_expiry: { color: 'emerald', label: 'No expiry' },
  expiring: { color: 'amber', label: 'Expiring' },
  expired: { color: 'red', label: 'Expired' },
  pending: { color: 'blue', label: 'Pending' },
  revoked: { color: 'zinc', label: 'Revoked' },
};

export function deriveAccreditationState(
  accreditation: Pick<Accreditation, 'status' | 'validUntil'>,
  now: number,
): AccreditationState {
  if (accreditation.status === 'revoked') return 'revoked';
  if (accreditation.status === 'pending') return 'pending';
  const days = daysUntil(accreditation.validUntil, now);
  if (days === null) return 'no_expiry';
  if (days < 0) return 'expired';
  // Valid through the end of its last day.
  if (days <= EXPIRING_SOON_DAYS) return 'expiring';
  return 'valid';
}

export type SubscriptionState = 'scheduled' | 'due_soon' | 'overdue' | 'unscheduled' | 'paused' | 'cancelled';

export const SUBSCRIPTION_STATE_BADGE: Record<SubscriptionState, { color: BadgeColor; label: string }> = {
  scheduled: { color: 'emerald', label: 'Scheduled' },
  due_soon: { color: 'amber', label: 'Due soon' },
  overdue: { color: 'red', label: 'Overdue' },
  unscheduled: { color: 'zinc', label: 'No date' },
  paused: { color: 'blue', label: 'Paused' },
  cancelled: { color: 'zinc', label: 'Cancelled' },
};

export function deriveSubscriptionState(
  subscription: Pick<Subscription, 'status' | 'nextPaymentDate'>,
  now: number,
): SubscriptionState {
  if (subscription.status === 'cancelled') return 'cancelled';
  if (subscription.status === 'paused') return 'paused';
  const days = daysUntil(subscription.nextPaymentDate, now);
  if (days === null) return 'unscheduled';
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due_soon';
  return 'scheduled';
}

// --- Billing ---

const MONTHS_PER_PERIOD: Record<Exclude<BillingPeriod, 'one_time'>, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/** Month arithmetic that clamps to the last day, like Postgres `date + interval '1 month'`. */
function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getDate();
  const first = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, lastDay));
}

/** One billing cycle later; null for a one-time purchase, which has no next date. */
export function advanceByPeriod(dateOnly: string, period: BillingPeriod): string | null {
  if (period === 'one_time') return null;
  const date = parseDateOnly(dateOnly);
  if (!date) return null;
  return formatDateOnly(addMonthsClamped(date, MONTHS_PER_PERIOD[period]));
}

/**
 * Where a payment recorded on `paidAt` leaves the next due date. Mirrors
 * record_subscription_payment() in the database so the optimistic row lands
 * where the server row will: the cadence stays anchored on the existing due
 * date, and a payment recorded months late still moves the date into the
 * future rather than one cycle into the past.
 */
export function rollForward(nextPaymentDate: string | null, paidAt: string, period: BillingPeriod): string | null {
  if (period === 'one_time') return null;
  let next = advanceByPeriod(nextPaymentDate || paidAt, period);
  // YYYY-MM-DD compares correctly as text.
  while (next && next <= paidAt) next = advanceByPeriod(next, period);
  return next;
}

export function monthlyEquivalent(amount: number, period: BillingPeriod): number {
  switch (period) {
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount / 3;
    case 'yearly':
      return amount / 12;
    default:
      return 0;
  }
}

export interface SpendSummary {
  currency: Currency;
  monthly: number;
  yearly: number;
  count: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Recurring spend per currency across active subscriptions. One-time purchases
 * are not a run rate and paused / cancelled plans are not being paid, so both
 * stay out. No currency conversion: a UAH total and a USD total are two lines.
 */
export function summarizeSpend(
  subscriptions: Pick<Subscription, 'amount' | 'currency' | 'billingPeriod' | 'status'>[],
): SpendSummary[] {
  const totals = new Map<Currency, SpendSummary>();
  for (const subscription of subscriptions) {
    if (subscription.status !== 'active' || subscription.billingPeriod === 'one_time') continue;
    const monthly = monthlyEquivalent(subscription.amount, subscription.billingPeriod);
    const entry = totals.get(subscription.currency) ?? {
      currency: subscription.currency,
      monthly: 0,
      yearly: 0,
      count: 0,
    };
    entry.monthly += monthly;
    entry.yearly += monthly * 12;
    entry.count += 1;
    totals.set(subscription.currency, entry);
  }
  return CURRENCIES.filter((currency) => totals.has(currency)).map((currency) => {
    const entry = totals.get(currency)!;
    return { ...entry, monthly: round2(entry.monthly), yearly: round2(entry.yearly) };
  });
}

export function formatMoney(amount: number, currency: Currency): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(
      amount,
    );
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

// --- Reminder cron ---

/**
 * Which reminder offsets a record with `days` left is due for. Claimed as a
 * window (everything at or above the remaining days) rather than on the exact
 * day: a skipped cron run cannot lose a reminder, and a record added with 12
 * days left is reported on the next run instead of waiting for day 7. The
 * dedup table makes re-claiming a no-op.
 */
export function dueOffsets(days: number | null, options: { skip30?: boolean } = {}): ReminderOffset[] {
  if (days === null || days < 0) return [];
  return REMINDER_OFFSETS.filter((offset) => days <= offset && !(options.skip30 && offset === 30));
}
