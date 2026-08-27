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
 * What a sticker's QR encodes: the t.me deep link, DIRECTLY.
 *
 * A short redirect on our own domain was tried and reverted. On paper it
 * dropped the QR from 37×37 to 25×25 modules; in the field it routed every
 * scan through the browser first — camera → Safari → 307 → t.me — and that
 * chain is exactly where interstitial pages and the PWA service worker live.
 * The direct t.me link opens Telegram straight from the camera, no hops, and
 * is the form that was verified working on a real phone. A quarter-smaller
 * sticker is not worth a flow that sometimes lands on a web page.
 *
 * Size consequence, honestly: at level Q this is 45 modules across including
 * the quiet zone — 23 mm minimum, 27 mm comfortable. Level M is one version
 * smaller (41 across) if a tighter label is needed.
 */
export function stickerQrPayload(assetCode: string): string {
  return buildStickerUrl(assetCode);
}

/** The same link in the shape meant for human eyes — copy buttons, captions. */
export function stickerLink(assetCode: string): string {
  return buildStickerUrl(assetCode);
}

export function buildStickerUrl(assetCode: string): string {
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?startapp=${encodeURIComponent(assetCode)}`;
}
