import { describe, expect, it } from 'vitest';
import { versionAtLeast } from '../lib/telegram';

// A string compare says "6.10" < "6.4", and the SDK's own version can be a
// stale "6.0" default when the launch fragment was lost — both produce a
// "update your Telegram" message on a perfectly current phone.
describe('versionAtLeast', () => {
  it('compares numerically, not lexically', () => {
    expect(versionAtLeast('6.10', '6.4')).toBe(true);
    expect(versionAtLeast('6.4', '6.10')).toBe(false);
  });

  it('accepts equal and newer versions', () => {
    expect(versionAtLeast('6.4', '6.4')).toBe(true);
    expect(versionAtLeast('8.0', '6.4')).toBe(true);
    expect(versionAtLeast('7', '6.4')).toBe(true);
  });

  it('rejects genuinely older clients', () => {
    expect(versionAtLeast('6.0', '6.4')).toBe(false);
    expect(versionAtLeast('5.9', '6.4')).toBe(false);
  });

  it('treats missing segments as zero rather than NaN', () => {
    expect(versionAtLeast('6', '6.0')).toBe(true);
    expect(versionAtLeast('6', '6.4')).toBe(false);
  });
});
