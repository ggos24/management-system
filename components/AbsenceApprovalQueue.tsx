import React, { useState, useMemo } from 'react';
import { Check, X, Clock, CheckCircle2, History } from 'lucide-react';
import { Absence, Member } from '../types';
import { Avatar } from './Avatar';
import { Badge, Input } from './ui';
import { calculateAbsenceStats } from '../lib/utils';

const TOTAL_HOLIDAY_ALLOWANCE = 24;

interface AbsenceApprovalQueueProps {
  pendingAbsences: Absence[];
  decidedAbsences: Absence[];
  allAbsences: Absence[];
  members: Member[];
  onApprove: (id: string) => void;
  onDecline: (id: string, reason?: string) => void;
}

const ABSENCE_TYPE_LABELS: Record<string, string> = {
  holiday: 'Holiday',
  sick: 'Sick Leave',
  business_trip: 'Business Trip',
  day_off: 'Day Off',
  free: 'Free',
  busy: 'Busy',
};

const ABSENCE_TYPE_COLORS: Record<string, 'emerald' | 'red' | 'blue' | 'zinc' | 'amber' | 'purple'> = {
  holiday: 'emerald',
  sick: 'red',
  business_trip: 'blue',
  day_off: 'zinc',
  free: 'amber',
  busy: 'purple',
};

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (start === end) return s.toLocaleDateString('en-US', opts);
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`;
}

function dayCount(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export const AbsenceApprovalQueue: React.FC<AbsenceApprovalQueueProps> = ({
  pendingAbsences,
  decidedAbsences,
  allAbsences,
  members,
  onApprove,
  onDecline,
}) => {
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  const handleDecline = (id: string) => {
    onDecline(id, declineReason || undefined);
    setDecliningId(null);
    setDeclineReason('');
  };

  // Pre-compute holiday stats per member (approved only)
  const memberStats = useMemo(() => {
    const map: Record<string, { used: number; remaining: number }> = {};
    for (const a of pendingAbsences) {
      if (!map[a.memberId]) {
        const stats = calculateAbsenceStats(a.memberId, allAbsences);
        map[a.memberId] = {
          used: stats.holidayDays,
          remaining: TOTAL_HOLIDAY_ALLOWANCE - stats.holidayDays,
        };
      }
    }
    return map;
  }, [pendingAbsences, allAbsences]);

  // Sort decided absences by decidedAt descending (most recent first)
  const sortedDecided = useMemo(
    () =>
      [...decidedAbsences].sort((a, b) => new Date(b.decidedAt || 0).getTime() - new Date(a.decidedAt || 0).getTime()),
    [decidedAbsences],
  );

  return (
    <div className="space-y-6">
      {/* Pending section */}
      {pendingAbsences.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
          <CheckCircle2 size={36} className="mb-3 text-emerald-400" />
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">All caught up!</p>
          <p className="text-xs mt-1">No pending absence requests.</p>
        </div>
      ) : (
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-800">
          {pendingAbsences.map((absence) => {
            const member = members.find((m) => m.id === absence.memberId);
            const isDeclineMode = decliningId === absence.id;
            const days = dayCount(absence.startDate, absence.endDate);
            const stats = memberStats[absence.memberId];
            const remainingAfter = absence.type === 'holiday' && stats ? stats.remaining - days : null;

            return (
              <div key={absence.id} className="px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <Avatar src={member?.avatar} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                        {member?.name || 'Unknown'}
                      </span>
                      {member?.jobTitle && (
                        <span className="text-xs text-zinc-400 truncate hidden sm:inline">{member.jobTitle}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {formatDateRange(absence.startDate, absence.endDate)}
                      </span>
                      <span className="text-zinc-400">
                        {days} day{days !== 1 ? 's' : ''}
                      </span>
                      {remainingAfter !== null && (
                        <span
                          className={`font-medium ${remainingAfter < 0 ? 'text-red-500' : remainingAfter <= 3 ? 'text-amber-500' : 'text-zinc-400'}`}
                        >
                          {stats!.remaining}/{TOTAL_HOLIDAY_ALLOWANCE} left
                          {remainingAfter !== stats!.remaining ? ` (${remainingAfter} after)` : ''}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-zinc-400">
                        <Clock size={10} />
                        {formatRelativeTime(absence.startDate)}
                      </span>
                    </div>
                  </div>

                  <Badge color={ABSENCE_TYPE_COLORS[absence.type] || 'zinc'} className="flex-shrink-0">
                    {ABSENCE_TYPE_LABELS[absence.type] || absence.type}
                  </Badge>

                  {!isDeclineMode && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => onApprove(absence.id)}
                        className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                        title="Approve"
                      >
                        <Check size={16} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => setDecliningId(absence.id)}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Decline"
                      >
                        <X size={16} strokeWidth={2.5} />
                      </button>
                    </div>
                  )}
                </div>

                {isDeclineMode && (
                  <div className="mt-2 ml-10 flex items-center gap-2">
                    <Input
                      placeholder="Reason (optional)..."
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value)}
                      autoFocus
                      className="flex-1 !py-1.5 !text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleDecline(absence.id);
                        if (e.key === 'Escape') {
                          setDecliningId(null);
                          setDeclineReason('');
                        }
                      }}
                    />
                    <button
                      onClick={() => handleDecline(absence.id)}
                      className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => {
                        setDecliningId(null);
                        setDeclineReason('');
                      }}
                      className="px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* History section */}
      {sortedDecided.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <History size={14} className="text-zinc-400" />
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">History</h3>
          </div>
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-800">
            {sortedDecided.map((absence) => {
              const member = members.find((m) => m.id === absence.memberId);
              const decider = absence.decidedBy ? members.find((m) => m.id === absence.decidedBy) : null;
              const days = dayCount(absence.startDate, absence.endDate);
              const isApproved = absence.status === 'approved';

              return (
                <div key={absence.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <Avatar src={member?.avatar} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                          {member?.name || 'Unknown'}
                        </span>
                        <span className="text-xs text-zinc-400">
                          {formatDateRange(absence.startDate, absence.endDate)}
                        </span>
                        <span className="text-xs text-zinc-400">{days}d</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-zinc-400">
                        {isApproved ? (
                          <Check size={10} className="text-emerald-500" />
                        ) : (
                          <X size={10} className="text-red-500" />
                        )}
                        <span>
                          {isApproved ? 'Approved' : 'Declined'} by {decider?.name || 'Unknown'}
                        </span>
                        {absence.decidedAt && <span>· {formatRelativeTime(absence.decidedAt)}</span>}
                        {!isApproved && absence.declineReason && (
                          <span className="text-zinc-500 dark:text-zinc-400 italic truncate">
                            — "{absence.declineReason}"
                          </span>
                        )}
                      </div>
                    </div>

                    <Badge color={ABSENCE_TYPE_COLORS[absence.type] || 'zinc'} className="flex-shrink-0">
                      {ABSENCE_TYPE_LABELS[absence.type] || absence.type}
                    </Badge>

                    <Badge color={isApproved ? 'emerald' : 'red'} className="flex-shrink-0">
                      {isApproved ? 'Approved' : 'Declined'}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
