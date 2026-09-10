import { describe, expect, it } from 'vitest';
import { buildDigest, collectDue, digestKind } from '../api/renewal-reminders';

// The cron sends one digest per admin. These pin down which records make it in
// and what the lines say; the claim / send plumbing is exercised against the
// real database.
const now = new Date(2026, 8, 10).getTime(); // 10 Sep 2026
const inDays = (days: number) => {
  const date = new Date(2026, 8, 10 + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const accreditation = (overrides: Partial<Parameters<typeof collectDue>[0][number]> = {}) => ({
  id: 'acc-1',
  holder_name: 'Olena K.',
  issuer: 'Ministry of Defence',
  kind: 'military' as const,
  valid_until: inDays(7),
  ...overrides,
});

const subscription = (overrides: Partial<Parameters<typeof collectDue>[1][number]> = {}) => ({
  id: 'sub-1',
  service_name: 'Adobe CC',
  amount: '59.99',
  currency: 'USD' as const,
  billing_period: 'monthly' as const,
  next_payment_date: inDays(1),
  ...overrides,
});

describe('collectDue', () => {
  it('lists each record once with every offset it is now due for', () => {
    const entries = collectDue([accreditation()], [subscription()], now);
    expect(entries.map((entry) => [entry.kind, entry.id, entry.days, entry.offsets])).toEqual([
      ['subscription', 'sub-1', 1, [7, 1]],
      ['accreditation', 'acc-1', 7, [30, 7]],
    ]);
  });

  it('skips the 30-day offset for monthly plans but not for yearly ones', () => {
    const entries = collectDue(
      [],
      [
        subscription({ id: 'monthly', next_payment_date: inDays(25) }),
        subscription({ id: 'yearly', billing_period: 'yearly', next_payment_date: inDays(25) }),
      ],
      now,
    );
    expect(entries.map((entry) => entry.id)).toEqual(['yearly']);
    expect(entries[0].offsets).toEqual([30]);
  });

  it('ignores anything outside the window or already past', () => {
    const entries = collectDue(
      [accreditation({ id: 'far', valid_until: inDays(45) }), accreditation({ id: 'gone', valid_until: inDays(-1) })],
      [],
      now,
    );
    expect(entries).toEqual([]);
  });

  it('writes lines a person can act on', () => {
    const [sub, acc] = collectDue([accreditation()], [subscription()], now);
    expect(acc.line).toBe(
      `• Military accreditation — Olena K., Ministry of Defence (expires in 7 days, ${formatEU(inDays(7))})`,
    );
    expect(sub.line).toBe(`• Adobe CC — $59.99 due tomorrow (${formatEU(inDays(1))})`);
  });
});

describe('buildDigest / digestKind', () => {
  it('groups by kind with a count in each header', () => {
    const entries = collectDue(
      [accreditation(), accreditation({ id: 'acc-2', holder_name: 'Taras M.', valid_until: inDays(3) })],
      [subscription()],
      now,
    );
    const digest = buildDigest(entries);
    expect(digest).toContain('🪪 2 accreditations expiring');
    expect(digest).toContain('💳 Subscription payment due');
    expect(digest.split('\n\n')).toHaveLength(2);
    expect(digestKind(entries)).toBe('mixed');
  });

  it('names a single kind so the notification can deep-link to it', () => {
    const entries = collectDue([accreditation()], [], now);
    expect(digestKind(entries)).toBe('accreditation');
    expect(buildDigest(entries).startsWith('🪪 Accreditation expiring\n')).toBe(true);
  });
});

function formatEU(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-');
  return `${day}/${month}/${year}`;
}
