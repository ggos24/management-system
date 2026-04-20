import { Absence, Team } from '../types';

// === Date formatting (European DD/MM/YYYY) ===

function toDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  // ISO YYYY-MM-DD → treat as local midnight to avoid TZ off-by-one
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(d + 'T00:00:00');
  return new Date(d);
}

/** Format a date as DD/MM/YYYY. Returns empty string for falsy input. */
export function formatDateEU(d: Date | string | null | undefined): string {
  const date = toDate(d);
  if (!date || isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

/** Format a date range as "DD/MM/YYYY – DD/MM/YYYY". */
export function formatDateRangeEU(a: Date | string, b: Date | string): string {
  return `${formatDateEU(a)} – ${formatDateEU(b)}`;
}

/** Weekday index with Monday = 0, Sunday = 6 (vs native getDay: Sunday = 0). */
export function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** Weekday headers starting on Monday. */
export const WEEKDAYS_MON_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const WEEKDAYS_MON_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

// === Team utilities ===

/** Produce a URL-friendly slug: `team-name-00000001` (name + last 8 hex digits of UUID). */
export function teamSlug(team: { id: string; name: string }): string {
  const slug = team.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const shortId = team.id.replace(/-/g, '').slice(-8);
  return `${slug}-${shortId}`;
}

/** Resolve a route param (slug or raw UUID) back to a team. */
export function findTeamByParam(teams: Team[], param: string): Team | undefined {
  // Exact UUID match (backward compat with old links / Telegram)
  const exact = teams.find((t) => t.id === param);
  if (exact) return exact;

  // Slug match: last 8 chars of slug = last 8 hex digits of UUID
  const shortId = param.slice(-8);
  return teams.find((t) => t.id.replace(/-/g, '').endsWith(shortId));
}

export function calculateAbsenceStats(memberId: string, absences: Absence[]) {
  let holidayDays = 0;
  let sickDays = 0;
  let businessDays = 0;
  let daysOff = 0;
  let freeDays = 0;
  let busyDays = 0;

  absences
    .filter((a) => a.memberId === memberId && a.status === 'approved')
    .forEach((a) => {
      const start = new Date(a.startDate);
      const end = new Date(a.endDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;

      switch (a.type) {
        case 'holiday':
          holidayDays += days;
          break;
        case 'sick':
          sickDays += days;
          break;
        case 'business_trip':
          businessDays += days;
          break;
        case 'day_off':
          daysOff += days;
          break;
        case 'free':
          freeDays += days;
          break;
        case 'busy':
          busyDays += days;
          break;
      }
    });

  return { holidayDays, sickDays, businessDays, daysOff, freeDays, busyDays };
}
