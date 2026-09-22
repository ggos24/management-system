import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui';
import { WEEKDAYS_MON_SHORT, mondayIndex } from '../lib/utils';
import { DUE_SOON_DAYS, addDays, formatMoney, projectPayments, todayDateOnly } from '../lib/renewals';
import type { Currency, Subscription } from '../types';

interface Charge {
  subscription: Subscription;
  date: string;
}

interface Cell {
  date: string;
  day: number;
  inMonth: boolean;
  charges: Charge[];
}

const MONTH_NAMES = [
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
];

function dateOnly(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Whole weeks Monday-first, so the grid is always a clean multiple of seven. */
function monthGrid(year: number, month: number): { date: string; day: number; inMonth: boolean }[] {
  const cells: { date: string; day: number; inMonth: boolean }[] = [];
  const lead = mondayIndex(new Date(year, month, 1));
  const lastDay = new Date(year, month + 1, 0).getDate();
  const prevLastDay = new Date(year, month, 0).getDate();

  for (let i = lead; i > 0; i -= 1) {
    const day = prevLastDay - i + 1;
    cells.push({ date: dateOnly(new Date(year, month - 1, day)), day, inMonth: false });
  }
  for (let day = 1; day <= lastDay; day += 1) {
    cells.push({ date: dateOnly(new Date(year, month, day)), day, inMonth: true });
  }
  const remainder = cells.length % 7;
  if (remainder !== 0) {
    for (let day = 1; day <= 7 - remainder; day += 1) {
      cells.push({ date: dateOnly(new Date(year, month + 1, day)), day, inMonth: false });
    }
  }
  return cells;
}

type Tone = 'overdue' | 'due' | 'upcoming' | 'past';

const TONE: Record<Tone, { className: string; label: string }> = {
  overdue: {
    className: 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
    label: 'overdue',
  },
  due: {
    className: 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
    label: 'due soon',
  },
  upcoming: {
    className: 'border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300',
    label: 'scheduled',
  },
  past: {
    // Recedes, but stays above the 4.5:1 contrast floor — zinc-400 on white does not.
    className: 'border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400',
    label: 'already charged',
  },
};

/**
 * A charge behind us is history, not a problem — it recedes. The one exception
 * is the subscription's own stored due date: still in the past means nobody
 * recorded the payment, which is exactly what the list calls overdue.
 */
function chargeTone(charge: Charge, today: string, soonCutoff: string): Tone {
  if (charge.date < today) return charge.subscription.nextPaymentDate === charge.date ? 'overdue' : 'past';
  if (charge.date <= soonCutoff) return 'due';
  return 'upcoming';
}

interface SubscriptionsCalendarProps {
  subscriptions: Subscription[];
  /** Injected so the clock is the page's, not a second one ticking on its own. */
  now: number;
  onOpen: (subscriptionId: string) => void;
}

export const SubscriptionsCalendar: React.FC<SubscriptionsCalendarProps> = ({ subscriptions, now, onOpen }) => {
  const today = todayDateOnly(now);
  const soonCutoff = addDays(today, DUE_SOON_DAYS);
  const [cursor, setCursor] = useState(() => {
    const date = new Date(now);
    return { year: date.getFullYear(), month: date.getMonth() };
  });

  const cells = useMemo<Cell[]>(() => {
    const grid = monthGrid(cursor.year, cursor.month);
    const charges: Charge[] = [];
    for (const subscription of subscriptions) {
      for (const date of projectPayments(subscription, grid[0].date, grid[grid.length - 1].date)) {
        charges.push({ subscription, date });
      }
    }
    // Sorted once, so every day lists its services the same way. Six weeks of
    // cells against a newsroom's worth of subscriptions is not worth an index.
    charges.sort((a, b) => a.subscription.serviceName.localeCompare(b.subscription.serviceName));
    return grid.map((cell) => ({ ...cell, charges: charges.filter((charge) => charge.date === cell.date) }));
  }, [subscriptions, cursor]);

  // Totals count this month only, so the leading and trailing days of the
  // neighbouring months do not inflate them.
  const totals = useMemo(() => {
    const sums = new Map<Currency, number>();
    for (const cell of cells) {
      if (!cell.inMonth) continue;
      for (const charge of cell.charges) {
        sums.set(
          charge.subscription.currency,
          (sums.get(charge.subscription.currency) ?? 0) + charge.subscription.amount,
        );
      }
    }
    return [...sums.entries()].map(([currency, amount]) => formatMoney(amount, currency));
  }, [cells]);

  const changeMonth = (offset: number) => {
    setCursor((prev) => {
      const date = new Date(prev.year, prev.month + offset, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  };
  const goToday = () => {
    const date = new Date(now);
    setCursor({ year: date.getFullYear(), month: date.getMonth() });
  };

  const viewingThisMonth = cursor.year === new Date(now).getFullYear() && cursor.month === new Date(now).getMonth();
  const daysWithCharges = cells.filter((cell) => cell.inMonth && cell.charges.length > 0);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 md:px-6 py-3">
        <div className="flex items-center gap-1">
          {/* Nothing is projected behind the stored due dates, so a month before
              this one would render empty rather than historical — which reads as
              a bug. The ledger in each subscription's detail holds the past. */}
          <button
            onClick={() => changeMonth(-1)}
            disabled={viewingThisMonth}
            aria-label="Previous month"
            title={viewingThisMonth ? 'The calendar only looks forward' : 'Previous month'}
            className="p-1.5 rounded-md text-zinc-500 enabled:hover:text-zinc-900 dark:enabled:hover:text-white enabled:hover:bg-zinc-100 dark:enabled:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white w-32 md:w-36 text-center">
            {MONTH_NAMES[cursor.month]} {cursor.year}
          </h2>
          <button
            onClick={() => changeMonth(1)}
            aria-label="Next month"
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ChevronRight size={16} />
          </button>
          {!viewingThisMonth && (
            <Button size="sm" variant="ghost" className="ml-1" onClick={goToday}>
              Today
            </Button>
          )}
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap">
            Charged this month
          </p>
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
            {totals.length > 0 ? totals.join(' · ') : '—'}
          </p>
        </div>
      </div>

      <div className="hidden md:grid grid-cols-7 border-y border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex-shrink-0">
        {WEEKDAYS_MON_SHORT.map((weekday) => (
          <div
            key={weekday}
            className="p-2 text-center text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-r border-zinc-200 dark:border-zinc-800 last:border-r-0"
          >
            {weekday}
          </div>
        ))}
      </div>

      {/* Phone: the seven-column grid is unreadable, so the month becomes an agenda. */}
      <div className="md:hidden flex-1 min-h-0 overflow-y-auto custom-scrollbar divide-y divide-zinc-100 dark:divide-zinc-800 border-t border-zinc-200 dark:border-zinc-800">
        {daysWithCharges.length === 0 ? (
          <EmptyMonth />
        ) : (
          daysWithCharges.map((cell) => (
            <div key={cell.date} className="px-4 py-3">
              <p
                className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                  cell.date === today ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {new Date(`${cell.date}T00:00:00`).toLocaleDateString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
                {cell.date === today ? ' · Today' : ''}
              </p>
              <div className="space-y-1.5">
                {cell.charges.map((charge) => (
                  <ChargeChip
                    key={charge.subscription.id}
                    charge={charge}
                    tone={chargeTone(charge, today, soonCutoff)}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden md:block flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-7 auto-rows-fr h-full min-h-[480px]">
          {cells.map((cell) => (
            <div
              key={cell.date}
              className={`flex flex-col min-h-[104px] border-b border-r border-zinc-200 dark:border-zinc-800 last:border-r-0 ${
                cell.date === today
                  ? 'bg-blue-50/50 dark:bg-blue-900/20'
                  : cell.inMonth
                    ? 'bg-white dark:bg-black'
                    : 'bg-zinc-50 dark:bg-zinc-900/50'
              }`}
            >
              <div
                className={`px-1.5 pt-1 text-[10px] font-medium text-right ${
                  cell.date === today
                    ? 'text-blue-600 dark:text-blue-400 font-bold'
                    : cell.inMonth
                      ? 'text-zinc-400'
                      : 'text-zinc-300 dark:text-zinc-600'
                }`}
              >
                {cell.day}
              </div>
              {cell.charges.length > 0 && (
                <div className="flex-1 min-h-0 p-1 space-y-1 overflow-y-auto custom-scrollbar">
                  {cell.charges.map((charge) => (
                    <ChargeChip
                      key={charge.subscription.id}
                      charge={charge}
                      tone={chargeTone(charge, today, soonCutoff)}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ChargeChip: React.FC<{ charge: Charge; tone: Tone; onOpen: (id: string) => void }> = ({
  charge,
  tone,
  onOpen,
}) => (
  <button
    onClick={() => onOpen(charge.subscription.id)}
    title={`${charge.subscription.serviceName} — ${formatMoney(charge.subscription.amount, charge.subscription.currency)} · ${TONE[tone].label}`}
    className={`w-full text-left px-1.5 py-1 rounded border border-l-[3px] leading-tight transition-colors hover:brightness-95 dark:hover:brightness-125 ${TONE[tone].className}`}
  >
    <span className="block text-[11px] font-medium truncate">{charge.subscription.serviceName}</span>
    <span className="block text-[10px] opacity-80 truncate">
      {formatMoney(charge.subscription.amount, charge.subscription.currency)}
    </span>
  </button>
);

const EmptyMonth: React.FC = () => (
  <div className="flex flex-col items-center justify-center text-center px-6 py-12">
    <CalendarDays size={28} className="text-zinc-300 dark:text-zinc-700 mb-3" />
    <p className="text-sm text-zinc-500">Nothing is charged this month.</p>
  </div>
);
