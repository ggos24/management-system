/**
 * Birthdays are stored as an ordinary `YYYY-MM-DD` date so Postgres can keep
 * validating them. The birth year is optional though: a member who wants to be
 * congratulated without publishing their age is stored under BIRTHDAY_YEAR_HIDDEN,
 * which never renders. Keeping that sentinel inside this module means the rest
 * of the app treats `member.birthday` as a plain date string.
 *
 * 1904 rather than 1900 because it is a leap year — a 29 February birthday has
 * to be storable.
 */
export const BIRTHDAY_YEAR_HIDDEN = 1904;

/** Oldest year the picker offers, and the floor the RPCs enforce. */
export const BIRTHDAY_MIN_YEAR = BIRTHDAY_YEAR_HIDDEN;

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export interface ParsedBirthday {
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
  /** null when the member shared only the day and month. */
  year: number | null;
}

const BIRTHDAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in a 1-indexed month. February needs a year to answer. */
export function daysInBirthdayMonth(month: number, year: number | null): number {
  if (month < 1 || month > 12) return 31;
  // With no year on file, February has to allow the 29th — that is exactly the
  // person whose birthday the year would otherwise have hidden.
  if (month === 2) return year === null || isLeapYear(year) ? 29 : 28;
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function parseBirthday(value: string | null | undefined): ParsedBirthday | null {
  if (!value) return null;
  const match = value.slice(0, 10).match(BIRTHDAY_RE);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInBirthdayMonth(month, year)) return null;
  return { month, day, year: year <= BIRTHDAY_YEAR_HIDDEN ? null : year };
}

/**
 * Assemble a storable birthday. Returns null when the day or month is missing —
 * an incomplete draft is not a birthday, and the caller should not save it.
 */
export function buildBirthday(day: number | null, month: number | null, year: number | null): string | null {
  if (!day || !month || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInBirthdayMonth(month, year)) return null;
  const storedYear = year ?? BIRTHDAY_YEAR_HIDDEN;
  return `${String(storedYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "14 March", or "14 March 1993" once the year is shared. */
export function formatBirthday(value: string | null | undefined): string {
  const parsed = parseBirthday(value);
  if (!parsed) return '';
  const label = `${parsed.day} ${MONTH_NAMES[parsed.month - 1]}`;
  return parsed.year ? `${label} ${parsed.year}` : label;
}

/** "14 Mar" — for the places where a full month name does not fit. */
export function formatBirthdayShort(value: string | null | undefined): string {
  const parsed = parseBirthday(value);
  if (!parsed) return '';
  return `${parsed.day} ${MONTH_NAMES[parsed.month - 1].slice(0, 3)}`;
}

/**
 * Does `date` fall on this birthday's anniversary?
 *
 * Someone born on 29 February is congratulated on 28 February in a common year
 * rather than skipped for three years running.
 */
export function isBirthdayOn(value: string | null | undefined, date: Date): boolean {
  const parsed = parseBirthday(value);
  if (!parsed) return false;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (parsed.month === month && parsed.day === day) return true;
  if (parsed.month === 2 && parsed.day === 29 && month === 2 && day === 28) {
    return !isLeapYear(date.getFullYear());
  }
  return false;
}
