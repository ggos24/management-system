import { describe, expect, it } from 'vitest';
import { formatLateness } from '../api/equipment-overdue';

// The overdue cron runs once at 06:00, so most items it reports are late by
// hours rather than days. Rounding those up to "1d" overstates the problem in
// the one message people actually read.
describe('formatLateness', () => {
  const now = new Date('2026-08-24T06:00:00Z').getTime();
  const at = (iso: string) => formatLateness(iso, now);

  it('reports hours for a same-night overrun', () => {
    expect(at('2026-08-23T18:00:00Z')).toBe('12h overdue');
    expect(at('2026-08-24T04:30:00Z')).toBe('1h overdue');
  });

  it('softens anything under an hour rather than claiming a full hour', () => {
    expect(at('2026-08-24T05:30:00Z')).toBe('just overdue');
  });

  it('switches to whole days past 24 hours', () => {
    expect(at('2026-08-23T05:00:00Z')).toBe('1d overdue');
    expect(at('2026-08-21T06:00:00Z')).toBe('3d overdue');
  });

  it('does not round a 23-hour overrun up to a day', () => {
    expect(at('2026-08-23T07:00:00Z')).toBe('23h overdue');
  });
});
