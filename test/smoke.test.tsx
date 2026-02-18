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
});
