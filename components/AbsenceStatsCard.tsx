import React from 'react';
import { calculateAbsenceStats } from '../lib/utils';

type AbsenceStats = ReturnType<typeof calculateAbsenceStats>;

export const AbsenceStatsCard: React.FC<{ stats: AbsenceStats }> = ({ stats }) => (
  <div className="grid grid-cols-2 gap-4">
    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
      <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase">Holidays</p>
      <div className="flex justify-between items-end mt-1">
        <span className="text-xl font-bold text-emerald-900 dark:text-emerald-100">{stats.holidayDays}/24</span>
        <span className="text-xs text-emerald-600 dark:text-emerald-400">{24 - stats.holidayDays} left</span>
      </div>
    </div>
    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-900/40">
      <p className="text-xs font-semibold text-red-800 dark:text-red-300 uppercase">Sick Leave</p>
      <p className="text-xl font-bold text-red-900 dark:text-red-100 mt-1">
        {stats.sickDays} <span className="text-xs font-normal opacity-70">days</span>
      </p>
    </div>
    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/40">
      <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase">Business Trip</p>
      <p className="text-xl font-bold text-blue-900 dark:text-blue-100 mt-1">
        {stats.businessDays} <span className="text-xs font-normal opacity-70">days</span>
      </p>
    </div>
    <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
      <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase">Day Off</p>
      <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
        {stats.daysOff} <span className="text-xs font-normal opacity-70">days</span>
      </p>
    </div>
  </div>
);
