import { describe, expect, it, vi, afterEach } from 'vitest';
import { initialTakeForm, resolveExpectedReturn, workdayEnd } from '../lib/equipment';

afterEach(() => vi.useRealTimers());

// Due date is required because overdue detection has nothing to work with
// otherwise — so the default must always resolve to a real, future time.
describe('take form defaults', () => {
  it('offers today while the working day is still ahead', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-25T09:00:00'));
    expect(initialTakeForm().preset).toBe('today');
    expect(new Date(resolveExpectedReturn(initialTakeForm())!).getTime()).toBeGreaterThan(Date.now());
  });

  it('rolls to tomorrow once the day is over, instead of defaulting to the past', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-25T21:30:00'));
    const form = initialTakeForm();
    expect(form.preset).toBe('tomorrow');
    expect(new Date(resolveExpectedReturn(form)!).getTime()).toBeGreaterThan(Date.now());
  });

  it('treats a long-term assignment as no due date at all', () => {
    expect(resolveExpectedReturn({ preset: 'longterm', customAt: '', purpose: '' })).toBeNull();
  });

  it('passes a custom pick straight through', () => {
    const resolved = resolveExpectedReturn({ preset: 'custom', customAt: '2026-09-01T12:30', purpose: '' });
    expect(new Date(resolved!).getHours()).toBe(12);
  });

  it('puts the workday end at 18:00 local, N days out', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-25T09:00:00'));
    expect(workdayEnd(1).getHours()).toBe(18);
    expect(workdayEnd(1).getDate()).toBe(26);
  });
});
