import { describe, expect, it } from 'vitest';
import { extractAssetCode, deriveUnitState } from '../lib/equipment';
import type { EquipmentCheckout, EquipmentItem } from '../types';

// Telegram's scanner returns the raw QR text — the whole t.me URL — not the bare
// code. Getting this wrong is the obvious first-iteration bug in the field flow.
describe('extractAssetCode', () => {
  it('pulls the code out of a Main Mini App deep link', () => {
    expect(extractAssetCode('https://t.me/managment_system_bot?startapp=CAM-012')).toBe('CAM-012');
  });

  it('still accepts a bare code from manual entry, case-insensitively', () => {
    expect(extractAssetCode('cam-012')).toBe('CAM-012');
    expect(extractAssetCode('  CAM-012  ')).toBe('CAM-012');
  });

  it('handles a named Direct-Link app URL too', () => {
    expect(extractAssetCode('https://t.me/managment_system_bot/gear?startapp=TST-001')).toBe('TST-001');
  });

  it('rejects anything that is not a valid code', () => {
    expect(extractAssetCode('https://example.com/not-a-sticker')).toBeNull();
    expect(extractAssetCode('CAM-12')).toBeNull();
    expect(extractAssetCode('')).toBeNull();
  });
});

describe('deriveUnitState', () => {
  const now = new Date('2026-08-24T12:00:00Z').getTime();
  const item = (status: EquipmentItem['status']) => ({ status }) as EquipmentItem;
  const open = (expectedReturnAt: string | null) => ({ expectedReturnAt }) as EquipmentCheckout;

  it('treats a unit with no open checkout as available', () => {
    expect(deriveUnitState(item('active'), null, now)).toBe('available');
  });

  it('flags an open checkout past its due time as overdue', () => {
    expect(deriveUnitState(item('active'), open('2026-08-24T09:00:00Z'), now)).toBe('overdue');
    expect(deriveUnitState(item('active'), open('2026-08-24T18:00:00Z'), now)).toBe('out');
  });

  it('never marks a long-term assignment overdue', () => {
    expect(deriveUnitState(item('active'), open(null), now)).toBe('out');
  });

  it('lets a terminal item status win over the checkout', () => {
    expect(deriveUnitState(item('lost'), open('2026-08-01T09:00:00Z'), now)).toBe('lost');
    expect(deriveUnitState(item('maintenance'), null, now)).toBe('maintenance');
  });
});
