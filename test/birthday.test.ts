import { describe, expect, it } from 'vitest';
import {
  BIRTHDAY_YEAR_HIDDEN,
  buildBirthday,
  daysInBirthdayMonth,
  formatBirthday,
  formatBirthdayShort,
  isBirthdayOn,
  parseBirthday,
} from '../lib/birthday';

describe('parseBirthday', () => {
  it('reads a shared year', () => {
    expect(parseBirthday('1993-03-14')).toEqual({ day: 14, month: 3, year: 1993 });
  });

  it('reports the sentinel year as no year at all', () => {
    expect(parseBirthday(`${BIRTHDAY_YEAR_HIDDEN}-03-14`)).toEqual({ day: 14, month: 3, year: null });
  });

  it('tolerates a timestamp suffix, which is what PostgREST sometimes returns', () => {
    expect(parseBirthday('1993-03-14T00:00:00+00:00')).toEqual({ day: 14, month: 3, year: 1993 });
  });

  it('rejects empty, malformed, and impossible dates', () => {
    expect(parseBirthday(null)).toBeNull();
    expect(parseBirthday('')).toBeNull();
    expect(parseBirthday('14/03/1993')).toBeNull();
    expect(parseBirthday('1993-13-01')).toBeNull();
    expect(parseBirthday('1993-02-30')).toBeNull();
    // 1993 is a common year, so it has no 29 February.
    expect(parseBirthday('1993-02-29')).toBeNull();
  });
});

describe('daysInBirthdayMonth', () => {
  it('knows the ordinary month lengths', () => {
    expect(daysInBirthdayMonth(1, 2025)).toBe(31);
    expect(daysInBirthdayMonth(9, 2025)).toBe(30);
  });

  it('follows the leap rule for February, century years included', () => {
    expect(daysInBirthdayMonth(2, 2025)).toBe(28);
    expect(daysInBirthdayMonth(2, 2024)).toBe(29);
    expect(daysInBirthdayMonth(2, 1900)).toBe(28);
    expect(daysInBirthdayMonth(2, 2000)).toBe(29);
  });

  it('allows 29 February when no year was shared — that person exists', () => {
    expect(daysInBirthdayMonth(2, null)).toBe(29);
  });
});

describe('buildBirthday', () => {
  it('stores a shared year as given', () => {
    expect(buildBirthday(14, 3, 1993)).toBe('1993-03-14');
  });

  it('stores a withheld year under the sentinel, which is itself a leap year', () => {
    expect(buildBirthday(14, 3, null)).toBe(`${BIRTHDAY_YEAR_HIDDEN}-03-14`);
    expect(buildBirthday(29, 2, null)).toBe(`${BIRTHDAY_YEAR_HIDDEN}-02-29`);
  });

  it('returns null for an incomplete draft rather than a half-guessed date', () => {
    expect(buildBirthday(null, 3, 1993)).toBeNull();
    expect(buildBirthday(14, null, 1993)).toBeNull();
  });

  it('refuses a day the month does not have', () => {
    expect(buildBirthday(31, 9, 1993)).toBeNull();
    expect(buildBirthday(29, 2, 1993)).toBeNull();
  });
});

describe('formatBirthday', () => {
  it('shows the year only when it was shared', () => {
    expect(formatBirthday('1993-03-14')).toBe('14 March 1993');
    expect(formatBirthday(`${BIRTHDAY_YEAR_HIDDEN}-03-14`)).toBe('14 March');
    expect(formatBirthdayShort('1993-03-14')).toBe('14 Mar');
  });

  it('renders nothing for an absent birthday', () => {
    expect(formatBirthday(null)).toBe('');
    expect(formatBirthdayShort(undefined)).toBe('');
  });
});

describe('isBirthdayOn', () => {
  it('matches the anniversary in any later year', () => {
    expect(isBirthdayOn('1993-03-14', new Date(2026, 2, 14))).toBe(true);
    expect(isBirthdayOn('1993-03-14', new Date(2026, 2, 15))).toBe(false);
    expect(isBirthdayOn('1993-03-14', new Date(2026, 3, 14))).toBe(false);
  });

  it('ignores the sentinel year', () => {
    expect(isBirthdayOn(`${BIRTHDAY_YEAR_HIDDEN}-03-14`, new Date(2026, 2, 14))).toBe(true);
  });

  it('moves a 29 February birthday to 28 February in a common year', () => {
    expect(isBirthdayOn('2000-02-29', new Date(2026, 1, 28))).toBe(true);
    expect(isBirthdayOn('2000-02-29', new Date(2024, 1, 29))).toBe(true);
    // In a leap year the 28th belongs to whoever was actually born on it.
    expect(isBirthdayOn('2000-02-29', new Date(2024, 1, 28))).toBe(false);
  });

  it('is false without a birthday on file', () => {
    expect(isBirthdayOn(null, new Date(2026, 2, 14))).toBe(false);
  });
});
