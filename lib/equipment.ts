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

/** End of the working day, N days out. */
export function workdayEnd(daysAhead: number, hour = 18): Date {
  const end = new Date();
  end.setDate(end.getDate() + daysAhead);
  end.setHours(hour, 0, 0, 0);
  return end;
}

/** After the working day is over, "today 18:00" is no longer an offer. */
export function isPastWorkdayEnd(hour = 18): boolean {
  return workdayEnd(0, hour).getTime() <= Date.now();
}

/**
 * Required-with-a-default: one tap to accept, two to change, so the field feels
 * optional while overdue detection always has something to work with.
 */
export function defaultReturnAt(): string {
  return toLocalInputValue(workdayEnd(isPastWorkdayEnd() ? 1 : 0));
}

export type DuePreset = 'today' | 'tomorrow' | 'custom' | 'longterm';

export interface TakeForm {
  preset: DuePreset;
  customAt: string;
  purpose: string;
}

export function initialTakeForm(): TakeForm {
  return {
    preset: isPastWorkdayEnd() ? 'tomorrow' : 'today',
    customAt: defaultReturnAt(),
    purpose: '',
  };
}

/** Resolve the form to what the checkout actually stores. */
export function resolveExpectedReturn(form: TakeForm): string | null {
  switch (form.preset) {
    case 'longterm':
      return null;
    case 'today':
      return workdayEnd(0).toISOString();
    case 'tomorrow':
      return workdayEnd(1).toISOString();
    default:
      return form.customAt ? new Date(form.customAt).toISOString() : null;
  }
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
  const fromShort = text.match(/unities\.pro\/e\/([A-Za-z0-9-]+)/i);
  const fromStartapp = text.match(/[?&]startapp=([^&\s]+)/i);
  const raw = fromShort ? fromShort[1] : fromStartapp ? decodeURIComponent(fromStartapp[1]) : text;
  const candidate = normaliseAssetCode(raw);
  return ASSET_CODE_RE.test(candidate) ? candidate : null;
}

/** The bot that hosts the Main Mini App the stickers point at. */
export const TELEGRAM_BOT_USERNAME = 'managment_system_bot';

/**
 * What a sticker's QR encodes: a short redirect on our own domain, IN CAPITALS.
 *
 * Two deliberate choices stack here. The short host drops the payload from 50
 * to 29 characters, which is one full QR version. The capitals put every
 * character inside the QR alphanumeric charset, which is a denser encoding
 * than bytes — another version down. Together: 25×25 modules instead of 37×37,
 * a QR a quarter smaller at identical per-module quality, and the M-vs-Q
 * trade-off disappears because both fit the same version at this length.
 *
 * Capitals are safe because URL schemes and hosts are case-insensitive by
 * spec, and the /E/ path is ours — vercel.json redirects both cases to the
 * t.me deep link. The redirect adds no real fragility: it is a static edge
 * rule on the same domain the Mini App itself is served from, so if it is
 * down, the app is down anyway.
 */
export function stickerQrPayload(assetCode: string): string {
  return `HTTPS://UNITIES.PRO/E/${assetCode.toUpperCase()}`;
}

/** The same link in a shape meant for human eyes — copy buttons, captions. */
export function stickerLink(assetCode: string): string {
  return `https://unities.pro/e/${assetCode.toUpperCase()}`;
}

/** @deprecated retained for the Telegram deep link itself, e.g. bot buttons. */
export function buildStickerUrl(assetCode: string): string {
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?startapp=${encodeURIComponent(assetCode)}`;
}
