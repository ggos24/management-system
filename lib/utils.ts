import { Absence } from '../types';

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
