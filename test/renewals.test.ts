import { describe, expect, it } from 'vitest';
import {
  advanceByPeriod,
  daysUntil,
  deriveAccreditationState,
  deriveSubscriptionState,
  describeCountdown,
  dueOffsets,
  formatMoney,
  projectPayments,
  rollForward,
  summarizeSpend,
} from '../lib/renewals';

// Local midnight, so the arithmetic matches what the browser sees regardless
// of the zone the test runner happens to be in.
const now = new Date(2026, 8, 10).getTime(); // 10 Sep 2026
const inDays = (days: number) => {
  const date = new Date(2026, 8, 10 + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

describe('daysUntil', () => {
  it('counts whole days from local midnight', () => {
    expect(daysUntil(inDays(7), now)).toBe(7);
    expect(daysUntil(inDays(0), now)).toBe(0);
    expect(daysUntil(inDays(-3), now)).toBe(-3);
  });

  it('is null for a missing date', () => {
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil('', now)).toBeNull();
  });
});

describe('deriveAccreditationState', () => {
  const at = (validUntil: string | null) => deriveAccreditationState({ validUntil }, now);

  it('warns a month out and flags the day after expiry', () => {
    expect(at(inDays(31))).toBe('valid');
    expect(at(inDays(30))).toBe('expiring');
    expect(at(inDays(1))).toBe('expiring');
    expect(at(inDays(0))).toBe('expiring');
    expect(at(inDays(-1))).toBe('expired');
  });

  it('treats no date as never expiring', () => {
    expect(at(null)).toBe('no_expiry');
  });
});

describe('deriveSubscriptionState', () => {
  const at = (nextPaymentDate: string | null, status: 'active' | 'paused' | 'cancelled' = 'active') =>
    deriveSubscriptionState({ status, nextPaymentDate }, now);

  it('uses the shorter 7-day window for payments', () => {
    expect(at(inDays(8))).toBe('scheduled');
    expect(at(inDays(7))).toBe('due_soon');
    expect(at(inDays(0))).toBe('due_soon');
    expect(at(inDays(-1))).toBe('overdue');
    expect(at(null)).toBe('unscheduled');
  });

  it('ignores the date once paused or cancelled', () => {
    expect(at(inDays(-5), 'paused')).toBe('paused');
    expect(at(inDays(-5), 'cancelled')).toBe('cancelled');
  });
});

describe('advanceByPeriod', () => {
  it('clamps to the last day of the month like Postgres', () => {
    expect(advanceByPeriod('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(advanceByPeriod('2028-02-29', 'yearly')).toBe('2029-02-28');
    expect(advanceByPeriod('2026-11-30', 'quarterly')).toBe('2027-02-28');
  });

  it('keeps an ordinary day of month', () => {
    expect(advanceByPeriod('2026-09-15', 'monthly')).toBe('2026-10-15');
    expect(advanceByPeriod('2026-09-15', 'quarterly')).toBe('2026-12-15');
    expect(advanceByPeriod('2026-09-15', 'yearly')).toBe('2027-09-15');
  });

  it('has no next date for a one-time purchase', () => {
    expect(advanceByPeriod('2026-09-15', 'one_time')).toBeNull();
  });
});

describe('rollForward', () => {
  it('moves one cycle on from the existing due date, early or late', () => {
    expect(rollForward('2026-09-15', '2026-09-13', 'monthly')).toBe('2026-10-15');
    expect(rollForward('2026-09-15', '2026-09-20', 'monthly')).toBe('2026-10-15');
  });

  it('skips past every cycle a very late payment already covers', () => {
    expect(rollForward('2026-06-15', '2026-09-20', 'monthly')).toBe('2026-10-15');
  });

  it('starts from the payment date when nothing was scheduled', () => {
    expect(rollForward(null, '2026-09-20', 'yearly')).toBe('2027-09-20');
  });

  it('clears the date for a one-time purchase', () => {
    expect(rollForward('2026-09-15', '2026-09-15', 'one_time')).toBeNull();
  });
});

describe('projectPayments', () => {
  const plan = (overrides: Partial<Parameters<typeof projectPayments>[0]> = {}) =>
    ({ nextPaymentDate: '2026-09-15', billingPeriod: 'monthly', status: 'active', ...overrides }) as Parameters<
      typeof projectPayments
    >[0];

  it('repeats the cadence across the window', () => {
    expect(projectPayments(plan(), '2026-09-01', '2026-11-30')).toEqual(['2026-09-15', '2026-10-15', '2026-11-15']);
    expect(projectPayments(plan({ billingPeriod: 'quarterly' }), '2026-09-01', '2027-06-30')).toEqual([
      '2026-09-15',
      '2026-12-15',
      '2027-03-15',
      '2027-06-15',
    ]);
  });

  it('skips forward to the window instead of listing dates before it', () => {
    expect(projectPayments(plan(), '2027-01-01', '2027-01-31')).toEqual(['2027-01-15']);
  });

  it('keeps projecting from a date already overdue — the service still charges', () => {
    expect(projectPayments(plan({ nextPaymentDate: '2026-06-15' }), '2026-09-01', '2026-09-30')).toEqual([
      '2026-09-15',
    ]);
  });

  it('charges a one-time purchase once, and only inside the window', () => {
    const once = plan({ billingPeriod: 'one_time' });
    expect(projectPayments(once, '2026-09-01', '2026-09-30')).toEqual(['2026-09-15']);
    expect(projectPayments(once, '2026-10-01', '2026-10-31')).toEqual([]);
  });

  it('produces nothing without a date, or once paused or cancelled', () => {
    expect(projectPayments(plan({ nextPaymentDate: null }), '2026-09-01', '2026-09-30')).toEqual([]);
    expect(projectPayments(plan({ status: 'paused' }), '2026-09-01', '2026-09-30')).toEqual([]);
    expect(projectPayments(plan({ status: 'cancelled' }), '2026-09-01', '2026-09-30')).toEqual([]);
  });

  it('clamps month-end the way the due date itself rolls forward', () => {
    expect(projectPayments(plan({ nextPaymentDate: '2026-01-31' }), '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-28',
      '2026-04-28',
    ]);
  });
});

describe('summarizeSpend', () => {
  it('normalises every cycle to a monthly run rate per currency', () => {
    const summary = summarizeSpend([
      { amount: 59.99, currency: 'USD', billingPeriod: 'monthly', status: 'active' },
      { amount: 120, currency: 'USD', billingPeriod: 'yearly', status: 'active' },
      { amount: 300, currency: 'UAH', billingPeriod: 'quarterly', status: 'active' },
    ]);
    expect(summary).toEqual([
      { currency: 'UAH', monthly: 100, yearly: 1200, count: 1 },
      { currency: 'USD', monthly: 69.99, yearly: 839.88, count: 2 },
    ]);
  });

  it('leaves out paused, cancelled and one-time plans', () => {
    expect(
      summarizeSpend([
        { amount: 10, currency: 'EUR', billingPeriod: 'monthly', status: 'paused' },
        { amount: 10, currency: 'EUR', billingPeriod: 'monthly', status: 'cancelled' },
        { amount: 500, currency: 'EUR', billingPeriod: 'one_time', status: 'active' },
      ]),
    ).toEqual([]);
  });
});

describe('formatMoney', () => {
  it('uses the narrow symbol with two decimals', () => {
    expect(formatMoney(59.99, 'USD')).toBe('$59.99');
    expect(formatMoney(49, 'EUR')).toBe('€49.00');
    expect(formatMoney(1200, 'UAH')).toContain('1,200.00');
  });
});

describe('describeCountdown', () => {
  it('reads naturally around today', () => {
    expect(describeCountdown(0)).toBe('today');
    expect(describeCountdown(1)).toBe('tomorrow');
    expect(describeCountdown(-1)).toBe('yesterday');
    expect(describeCountdown(12)).toBe('in 12 days');
    expect(describeCountdown(-3)).toBe('3 days ago');
    expect(describeCountdown(null)).toBe('—');
  });
});

describe('dueOffsets', () => {
  it('claims every offset at or above the days remaining', () => {
    expect(dueOffsets(40)).toEqual([]);
    expect(dueOffsets(30)).toEqual([30]);
    expect(dueOffsets(12)).toEqual([30]);
    expect(dueOffsets(7)).toEqual([30, 7]);
    expect(dueOffsets(5)).toEqual([30, 7]);
    expect(dueOffsets(1)).toEqual([30, 7, 1]);
    expect(dueOffsets(0)).toEqual([30, 7, 1]);
  });

  it('never reminds about something already past', () => {
    expect(dueOffsets(-1)).toEqual([]);
    expect(dueOffsets(null)).toEqual([]);
  });

  it('can drop the 30-day offset for monthly plans', () => {
    expect(dueOffsets(29, { skip30: true })).toEqual([]);
    expect(dueOffsets(6, { skip30: true })).toEqual([7]);
  });
});
