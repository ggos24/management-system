import { describe, it, expect } from 'vitest';

describe('Smoke test', () => {
  it('app module can be imported', async () => {
    // Verify the types module exports correctly
    const types = await import('../types');
    expect(types).toBeDefined();
  });

  it('constants module can be imported', async () => {
    const constants = await import('../constants');
    expect(constants.STATUS_COLORS).toBeDefined();
    expect(constants.PRIORITY_COLORS).toBeDefined();
  });

  it('formats normalized task dates in EU format without timezone shifts', async () => {
    const { formatDateEU, toDateOnly } = await import('../lib/utils');
    const dateOnly = toDateOnly('2026-04-24T00:00:00.000Z');
    expect(dateOnly).toBe('2026-04-24');
    expect(formatDateEU(dateOnly)).toBe('24/04/2026');
  });
});
