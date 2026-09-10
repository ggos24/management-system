import React, { useMemo, useState } from 'react';
import { CustomSelect } from './CustomSelect';
import { BIRTHDAY_MIN_YEAR, MONTH_NAMES, buildBirthday, daysInBirthdayMonth, parseBirthday } from '../lib/birthday';

interface BirthdayInputProps {
  /** Seeds the draft on mount only — remount with a `key` to load a different member. */
  value: string | null;
  /** Fires with null while the day or month is still missing. */
  onChange: (next: string | null) => void;
  className?: string;
}

const YEAR_NOT_SHARED = '';

/**
 * Day / month / year, as three selects.
 *
 * A calendar grid is the wrong control for a birthday — reaching 1993 from the
 * current month is thirty-odd taps on a chevron. Three selects also make the
 * year genuinely optional: "Year not shared" is the first option, so nobody has
 * to publish their age to be congratulated.
 *
 * The day and month live here rather than in the parent's draft because a
 * half-filled selection is not a date: routing "March, no day yet" through
 * `buildBirthday` would blank the parent's draft and visibly reset the month.
 */
export const BirthdayInput: React.FC<BirthdayInputProps> = ({ value, onChange, className }) => {
  const initial = parseBirthday(value);
  const [day, setDay] = useState<number | null>(initial?.day ?? null);
  const [month, setMonth] = useState<number | null>(initial?.month ?? null);
  const [year, setYear] = useState<number | null>(initial?.year ?? null);

  const yearOptions = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const years = [{ value: YEAR_NOT_SHARED, label: 'Year not shared' }];
    for (let y = thisYear; y >= BIRTHDAY_MIN_YEAR; y--) years.push({ value: String(y), label: String(y) });
    return years;
  }, []);

  const dayOptions = useMemo(
    () =>
      Array.from({ length: month ? daysInBirthdayMonth(month, year) : 31 }, (_, i) => ({
        value: String(i + 1),
        label: String(i + 1),
      })),
    [month, year],
  );

  const commit = (nextDay: number | null, nextMonth: number | null, nextYear: number | null) => {
    // 31 September, or 29 February once a common year is picked, stop existing —
    // pull the day back to the last one that does rather than silently saving
    // nothing.
    const clampedDay = nextDay && nextMonth ? Math.min(nextDay, daysInBirthdayMonth(nextMonth, nextYear)) : nextDay;
    setDay(clampedDay);
    setMonth(nextMonth);
    setYear(nextYear);
    onChange(buildBirthday(clampedDay, nextMonth, nextYear));
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className || ''}`}>
      <CustomSelect
        options={dayOptions}
        value={day ? String(day) : ''}
        onChange={(v) => commit(Number(v), month, year)}
        placeholder="Day"
        dropdownMinWidth={90}
        className="w-[86px]"
        searchable
      />
      <CustomSelect
        options={MONTH_NAMES.map((name, i) => ({ value: String(i + 1), label: name }))}
        value={month ? String(month) : ''}
        onChange={(v) => commit(day, Number(v), year)}
        placeholder="Month"
        dropdownMinWidth={150}
        className="w-[132px]"
      />
      <CustomSelect
        options={yearOptions}
        value={year ? String(year) : YEAR_NOT_SHARED}
        onChange={(v) => commit(day, month, v === YEAR_NOT_SHARED ? null : Number(v))}
        placeholder="Year"
        dropdownMinWidth={150}
        className="w-[132px]"
        searchable
      />
    </div>
  );
};
