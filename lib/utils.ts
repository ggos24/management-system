import { Absence, Team } from '../types';

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

  absences
    .filter((a) => a.memberId === memberId)
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
      }
    });

  return { holidayDays, sickDays, businessDays, daysOff };
}
