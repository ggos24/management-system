import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from '../lib/utils';

// AuthGuard now round-trips the intended destination through ?next=, which is
// attacker-controllable in a crafted login link. Only same-origin, path-only
// values may be followed.
describe('safeRedirectPath', () => {
  it('accepts same-origin paths, including query strings', () => {
    expect(safeRedirectPath('/equipment')).toBe('/equipment');
    expect(safeRedirectPath('/equipment?item=abc')).toBe('/equipment?item=abc');
  });

  it('rejects protocol-relative and absolute targets', () => {
    expect(safeRedirectPath('//evil.example')).toBeNull();
    expect(safeRedirectPath('https://evil.example')).toBeNull();
    expect(safeRedirectPath('http://evil.example')).toBeNull();
  });

  it('rejects backslash tricks browsers may normalise to a host', () => {
    expect(safeRedirectPath('/\\evil.example')).toBeNull();
    expect(safeRedirectPath('/path\\to')).toBeNull();
  });

  it('falls back to null for empty or relative input', () => {
    expect(safeRedirectPath(null)).toBeNull();
    expect(safeRedirectPath('')).toBeNull();
    expect(safeRedirectPath('workspace')).toBeNull();
  });
});
