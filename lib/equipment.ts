import type { EquipmentCheckout, EquipmentItem } from '../types';
import { formatDateEU } from './utils';

/** Derived unit state. Availability is computed, never stored on the item. */
export type UnitState = 'available' | 'out' | 'overdue' | 'maintenance' | 'retired' | 'lost';

export const EQUIPMENT_STATE_BADGE: Record<
  UnitState,
  { color: 'zinc' | 'emerald' | 'red' | 'blue' | 'amber'; label: string }
> = {
  available: { color: 'emerald', label: 'Available' },
  out: { color: 'blue', label: 'Out' },
  overdue: { color: 'red', label: 'Overdue' },
  maintenance: { color: 'amber', label: 'Maintenance' },
  retired: { color: 'zinc', label: 'Retired' },
  lost: { color: 'red', label: 'Lost' },
};

export function deriveUnitState(item: EquipmentItem, open: EquipmentCheckout | null, now: number): UnitState {
  if (item.status === 'retired' || item.status === 'lost') return item.status;
  if (item.status === 'maintenance') return 'maintenance';
  if (!open) return 'available';
  return open.expectedReturnAt && new Date(open.expectedReturnAt).getTime() < now ? 'overdue' : 'out';
}

/** Local-time value for a datetime-local input. */
export function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * Required-with-a-default: one tap to accept, two to change, so the field feels
 * optional while overdue detection always has something to work with.
 */
export function defaultReturnAt(): string {
  const end = new Date();
  end.setHours(18, 0, 0, 0);
  if (end.getTime() <= Date.now()) end.setDate(end.getDate() + 1);
  return toLocalInputValue(end);
}

export function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${formatDateEU(date)} ${time}`;
}

/** Asset codes are printed on stickers; the QR carries them verbatim. */
export const ASSET_CODE_RE = /^[A-Z]{2,4}-\d{3}$/;

export function normaliseAssetCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Telegram hands the scanner's raw QR text back, which is the whole
 * `t.me/<bot>?startapp=CODE` URL rather than the bare code. Manual entry supplies
 * the code directly, so accept both.
 */
export function extractAssetCode(scanned: string): string | null {
  const text = scanned.trim();
  const fromUrl = text.match(/[?&]startapp=([^&\s]+)/i);
  const candidate = normaliseAssetCode(fromUrl ? decodeURIComponent(fromUrl[1]) : text);
  return ASSET_CODE_RE.test(candidate) ? candidate : null;
}
