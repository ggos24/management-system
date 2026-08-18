import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Member, Absence, Team, Shift, UserRole } from '../types';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Trash2,
  ChevronDown,
  User,
  Filter,
  Clock,
  Check,
  X,
  AlertCircle,
  GripVertical,
} from 'lucide-react';
import { Modal } from './Modal';
import { Avatar } from './Avatar';
import { SimpleDatePicker } from './SimpleDatePicker';
import { CustomSelect } from './CustomSelect';
import { calculateAbsenceStats, formatDateEU } from '../lib/utils';
import { isAdmin } from '../constants';
import { Button, Label, Input, Badge } from './ui';
import { AbsenceApprovalQueue } from './AbsenceApprovalQueue';
import { useScheduleDragReorder } from '../hooks/useScheduleDragReorder';
import { useDataStore } from '../stores/dataStore';

interface ScheduleProps {
  members: Member[];
  absences: Absence[];
  shifts: Shift[];
  teams: Team[];
  userRole: UserRole;
  currentUserId: string;
  onUpdateAbsence: (absence: Absence) => void;
  onDeleteAbsence: (id: string) => void;
  onApproveAbsence: (id: string) => void;
  onDeclineAbsence: (id: string, reason?: string) => void;
  onCancelAbsence: (id: string) => void;
  onUpdateShift: (shift: Shift) => void;
  onDeleteShift: (id: string) => void;
  onReorderTeams: (draggedId: string, targetId: string, position: 'before' | 'after') => void;
  onReorderMembers: (teamId: string, draggedId: string, targetId: string, position: 'before' | 'after') => void;
}

/**
 * "Oleksandr Slobodskyi" → "Oleksandr S." — the mobile name column is 112px so
 * that seven day columns still fit beside it on a 375px screen; full names get
 * truncated to nothing useful at that width.
 */
function shortenName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2 || !parts[1]) return name;
  return `${parts[0]} ${parts[1][0]}.`;
}

const Schedule: React.FC<ScheduleProps> = ({
  members,
  absences,
  shifts,
  teams,
  userRole,
  currentUserId,
  onUpdateAbsence,
  onDeleteAbsence,
  onApproveAbsence,
  onDeclineAbsence,
  onCancelAbsence,
  onUpdateShift,
  onDeleteShift,
  onReorderTeams,
  onReorderMembers,
}) => {
  const isAdminUser = isAdmin(userRole);
  const scheduleTeamOrders = useDataStore((s) => s.scheduleTeamOrders);

  const sortedTeams = useMemo(() => {
    if (Object.keys(scheduleTeamOrders).length === 0) return teams;
    return [...teams].sort((a, b) => (scheduleTeamOrders[a.id] ?? 9999) - (scheduleTeamOrders[b.id] ?? 9999));
  }, [teams, scheduleTeamOrders]);

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => (a.id === currentUserId ? -1 : b.id === currentUserId ? 1 : 0)),
    [members, currentUserId],
  );

  const {
    dragState,
    handleTeamDragStart,
    handleTeamDragOver,
    handleTeamDrop,
    handleMemberDragStart,
    handleMemberDragOver,
    handleMemberDrop,
    handleDragEnd,
  } = useScheduleDragReorder({ isAdminUser, onReorderTeams, onReorderMembers });

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedCell, setSelectedCell] = useState<{
    member: Member;
    teamId: string;
    day: number;
  } | null>(null);

  // Tab state: calendar vs pending requests
  const [activeTab, setActiveTab] = useState<'calendar' | 'pending'>('calendar');

  // Drag Selection State — keyed on (memberId, teamId) so selecting cells in
  // one team row does not bleed into another team row for the same person.
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ memberId: string; teamId: string; day: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ memberId: string; teamId: string; day: number } | null>(null);

  // Edit Modal State
  const [editType, setEditType] = useState<'absence' | 'shift'>('absence');
  const [absenceType, setAbsenceType] = useState<Absence['type']>('holiday');
  const [modalDeclineMode, setModalDeclineMode] = useState(false);
  const [modalDeclineReason, setModalDeclineReason] = useState('');

  // Member Stats Modal State
  const [selectedMemberStats, setSelectedMemberStats] = useState<Member | null>(null);

  // Date Range State for Absences
  const [rangeStartDate, setRangeStartDate] = useState('');
  const [rangeEndDate, setRangeEndDate] = useState('');

  // Shift Times
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [isAllDay, setIsAllDay] = useState(false);
  const [shiftType, setShiftType] = useState<'on_call' | 'on_duty'>('on_duty');

  // Collapsed Teams State
  const [collapsedTeams, setCollapsedTeams] = useState<Record<string, boolean>>({});

  // Filters
  const [filterPerson, setFilterPerson] = useState('all');
  const [filterAbsenceType, setFilterAbsenceType] = useState('all');

  // Touch bookkeeping. A press only becomes a range selection after it has held
  // still for LONG_PRESS_MS; anything that moves first is a scroll and is
  // dropped, which is what stops a horizontal swipe from opening the editor.
  const touchRef = useRef<{
    member: Member;
    teamId: string;
    day: number;
    x: number;
    y: number;
    longPress: boolean;
  } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Browsers replay a touch as mousedown/mouseup after touchend. Left alone
  // that replay re-opens the editor on the single day under the finger and
  // discards a range that was just dragged out, so mouse handlers ignore
  // anything arriving in the shadow of a touch.
  const ignoreMouseRef = useRef(false);
  const ignoreMouseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [isTouchSelecting, setIsTouchSelecting] = useState(false);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      clearTimeout(longPressTimer.current);
      clearTimeout(ignoreMouseTimer.current);
    },
    [],
  );

  // Once a selection is live the grid must not scroll under the finger. React
  // registers touchmove passively, so the preventDefault has to come from a
  // listener attached here.
  useEffect(() => {
    if (!isTouchSelecting) return;
    const el = gridScrollRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, [isTouchSelecting]);

  // Correctly get days in month
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const daysCount = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const days = Array.from({ length: daysCount }, (_, i) => i + 1);
  const monthName = currentDate.toLocaleString('en-US', { month: 'long' });
  const year = currentDate.getFullYear();

  const changeMonth = (offset: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  const getDateStr = (day: number) => {
    return `${year}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  };

  const getDayShortName = (day: number) => {
    const date = new Date(year, currentDate.getMonth(), day);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const isWeekend = (day: number) => {
    const date = new Date(year, currentDate.getMonth(), day);
    const dow = date.getDay();
    return dow === 0 || dow === 6;
  };

  const getAbsenceForDay = (memberId: string, day: number) => {
    const dateStr = getDateStr(day);
    return absences.find(
      (a) => a.memberId === memberId && a.status !== 'declined' && dateStr >= a.startDate && dateStr <= a.endDate,
    );
  };

  const getShiftForDay = (memberId: string, teamId: string, day: number) => {
    const dateStr = getDateStr(day);
    return shifts.find((s) => s.memberId === memberId && s.teamId === teamId && s.date === dateStr);
  };

  // Shifts and absences are separate records: an absence is drawn over the shift
  // it covers rather than replacing it, so the roster survives a request that is
  // later declined or cancelled. That only works if the covered shift is visible
  // somewhere — otherwise deleting an absence looks like it conjured a schedule.
  const describeShift = (shift: Shift) => {
    if (shift.shiftType) return shift.shiftType === 'on_duty' ? 'DUTY' : 'CALL';
    if (shift.startTime.startsWith('00:00') && shift.endTime.startsWith('23:59')) return 'All day';
    return `${shift.startTime.slice(0, 5)}–${shift.endTime.slice(0, 5)}`;
  };

  const MOUSE_AFTER_TOUCH_MS = 600;

  const beginSelection = (member: Member, teamId: string, day: number) => {
    // Admins can click any row; others can only click their own row (for absences)
    if (!isAdmin(userRole) && member.id !== currentUserId) return;
    setIsDragging(true);
    setDragStart({ memberId: member.id, teamId, day });
    setDragEnd({ memberId: member.id, teamId, day });
  };

  const handleMouseDown = (member: Member, teamId: string, day: number) => {
    if (ignoreMouseRef.current) return;
    beginSelection(member, teamId, day);
  };

  const handleMouseEnter = (member: Member, teamId: string, day: number) => {
    if (isDragging && dragStart && dragStart.memberId === member.id && dragStart.teamId === teamId) {
      setDragEnd({ memberId: member.id, teamId, day });
    }
  };

  /**
   * Opens the editor for a day range. Split out of the drag handler because the
   * tap path has to reach it too, and tap cannot read `dragStart` — the state
   * write from the same event has not landed yet.
   */
  const openCellEditor = (member: Member, teamId: string, startDay: number, endDay: number) => {
    // Admins can open any row; everyone else only their own (for absences).
    if (!isAdmin(userRole) && member.id !== currentUserId) return;

    const startStr = getDateStr(startDay);
    const endStr = getDateStr(endDay);

    setRangeStartDate(startStr);
    setRangeEndDate(endStr);

    const existingAbsence = getAbsenceForDay(member.id, startDay);
    const existingShift = getShiftForDay(member.id, teamId, startDay);

    setSelectedCell({ member, teamId, day: startDay });

    // Always pre-populate absence state
    if (existingAbsence) {
      setAbsenceType(existingAbsence.type);
      if (startDay === endDay) {
        setRangeStartDate(existingAbsence.startDate);
        setRangeEndDate(existingAbsence.endDate);
      }
    } else {
      setAbsenceType('holiday');
    }

    // Always pre-populate shift state
    if (existingShift) {
      const allDay = existingShift.startTime.startsWith('00:00') && existingShift.endTime.startsWith('23:59');
      setIsAllDay(allDay);
      setStartTime(allDay ? '09:00' : existingShift.startTime);
      setEndTime(allDay ? '17:00' : existingShift.endTime);
      setShiftType(existingShift.shiftType || 'on_duty');
    } else {
      setIsAllDay(false);
      setStartTime('09:00');
      setEndTime('17:00');
      setShiftType('on_duty');
    }

    // Determine which tab to show. Non-admins always get absence, and the
    // synthetic "No Team" group has no real team_id so shifts cannot be stored
    // there — force absence mode for those rows.
    const noTeamRow = !teamId || teamId === '__no_team__';
    setEditType(noTeamRow ? 'absence' : !isAdmin(userRole) ? 'absence' : existingAbsence ? 'absence' : 'shift');

    // Reset decline mode
    setModalDeclineMode(false);
    setModalDeclineReason('');
  };

  const handleMouseUp = (member: Member, teamId: string, day: number) => {
    if (ignoreMouseRef.current) return;
    if (!isDragging || !dragStart) return;
    setIsDragging(false);

    const startDay = Math.min(dragStart.day, dragEnd?.day || day);
    const endDay = Math.max(dragStart.day, dragEnd?.day || day);

    setDragStart(null);
    setDragEnd(null);
    openCellEditor(member, teamId, startDay, endDay);
  };

  // --- Touch -----------------------------------------------------------------
  // A tap opens one day. A press held still for LONG_PRESS_MS starts a range
  // selection. A press that moves first is a scroll: it is abandoned, so
  // swiping the month sideways no longer pops the editor open.
  const LONG_PRESS_MS = 350;
  const TOUCH_SLOP_PX = 8;

  const ignoreReplayedMouse = () => {
    ignoreMouseRef.current = true;
    clearTimeout(ignoreMouseTimer.current);
    ignoreMouseTimer.current = setTimeout(() => {
      ignoreMouseRef.current = false;
    }, MOUSE_AFTER_TOUCH_MS);
  };

  const abandonTouch = () => {
    ignoreReplayedMouse();
    clearTimeout(longPressTimer.current);
    touchRef.current = null;
    setIsTouchSelecting(false);
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  const handleTouchStart = (e: React.TouchEvent, member: Member, teamId: string, day: number) => {
    const touch = e.touches[0];
    touchRef.current = { member, teamId, day, x: touch.clientX, y: touch.clientY, longPress: false };
    clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      const info = touchRef.current;
      if (!info) return;
      info.longPress = true;
      setIsTouchSelecting(true);
      beginSelection(info.member, info.teamId, info.day);
    }, LONG_PRESS_MS);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const info = touchRef.current;
    if (!info) return;
    const touch = e.touches[0];

    if (!info.longPress) {
      const moved =
        Math.abs(touch.clientX - info.x) > TOUCH_SLOP_PX || Math.abs(touch.clientY - info.y) > TOUCH_SLOP_PX;
      if (moved) abandonTouch();
      return;
    }

    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = el?.closest('[data-day]') as HTMLElement | null;
    if (cell?.dataset.day) {
      handleMouseEnter(info.member, info.teamId, parseInt(cell.dataset.day, 10));
    }
  };

  const handleTouchEnd = (_e: React.TouchEvent, member: Member, teamId: string, day: number) => {
    const info = touchRef.current;
    ignoreReplayedMouse();
    clearTimeout(longPressTimer.current);
    touchRef.current = null;
    const wasDragging = !!info?.longPress;
    // Cleared by handleTouchMove — the gesture was a scroll, so open nothing.
    if (!info) return;

    if (wasDragging) {
      setIsTouchSelecting(false);
      const startDay = dragStart ? Math.min(dragStart.day, dragEnd?.day ?? day) : day;
      const endDay = dragStart ? Math.max(dragStart.day, dragEnd?.day ?? day) : day;
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      openCellEditor(member, teamId, startDay, endDay);
    } else {
      openCellEditor(member, teamId, day, day);
    }
  };

  const handleSave = () => {
    if (!selectedCell) return;

    // Only admins can save shifts
    if (editType === 'shift' && !isAdmin(userRole)) return;
    // Non-admins can only save absences for themselves
    if (editType === 'absence' && !isAdmin(userRole) && selectedCell.member.id !== currentUserId) return;
    // Shifts require a concrete team (not the synthetic "No Team" row)
    if (editType === 'shift' && (!selectedCell.teamId || selectedCell.teamId === '__no_team__')) return;

    if (editType === 'absence') {
      if (!rangeStartDate || !rangeEndDate) return;
      const existing = getAbsenceForDay(selectedCell.member.id, selectedCell.day);

      const newAbsence: Absence = {
        id: existing?.id || crypto.randomUUID(),
        memberId: selectedCell.member.id,
        type: absenceType,
        startDate: rangeStartDate,
        endDate: rangeEndDate,
        status: existing?.status || (isAdmin(userRole) ? 'approved' : 'pending'),
      };
      onUpdateAbsence(newAbsence);
    } else {
      const start = new Date(rangeStartDate);
      const end = new Date(rangeEndDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const dayNum = d.getDate();
        const existingShift = getShiftForDay(selectedCell.member.id, selectedCell.teamId, dayNum);
        const isRapidResponse = teams.find((t) => t.id === selectedCell.teamId)?.rapidResponse;
        const newShift: Shift = {
          id: existingShift?.id || crypto.randomUUID(),
          memberId: selectedCell.member.id,
          teamId: selectedCell.teamId,
          date: dateStr,
          startTime: isRapidResponse ? '00:00' : isAllDay ? '00:00' : startTime,
          endTime: isRapidResponse ? '23:59' : isAllDay ? '23:59' : endTime,
          shiftType: isRapidResponse ? shiftType : undefined,
        };
        onUpdateShift(newShift);
      }
    }
    setSelectedCell(null);
  };

  const handleDelete = () => {
    if (!selectedCell) return;

    if (editType === 'absence') {
      const existing = getAbsenceForDay(selectedCell.member.id, selectedCell.day);
      if (existing) onDeleteAbsence(existing.id);
    } else if (isAdmin(userRole)) {
      const start = new Date(rangeStartDate);
      const end = new Date(rangeEndDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const existing = getShiftForDay(selectedCell.member.id, selectedCell.teamId, d.getDate());
        if (existing) onDeleteShift(existing.id);
      }
    }
    setSelectedCell(null);
  };

  const toggleTeamCollapse = (teamId: string) => {
    setCollapsedTeams((prev) => ({ ...prev, [teamId]: !prev[teamId] }));
  };

  const membersByTeam = useMemo(() => {
    const teamIds = new Set(sortedTeams.map((t) => t.id));
    const groups = sortedTeams
      .map((team) => {
        // Multi-team membership: a person appears under every team in their teamIds.
        // This is the line that makes Rapid Response members show up as a second row.
        let teamMembers = members
          .filter((m) => m.teamIds.includes(team.id))
          .sort((a, b) => (a.scheduleSortOrders?.[team.id] ?? 0) - (b.scheduleSortOrders?.[team.id] ?? 0));
        if (filterPerson !== 'all') {
          teamMembers = teamMembers.filter((m) => m.id === filterPerson);
        }
        if (filterAbsenceType !== 'all') {
          teamMembers = teamMembers.filter((m) => {
            return absences.some(
              (a) =>
                a.memberId === m.id &&
                a.type === filterAbsenceType &&
                (new Date(a.startDate).getMonth() === currentDate.getMonth() ||
                  new Date(a.endDate).getMonth() === currentDate.getMonth()),
            );
          });
        }
        return { team, members: teamMembers };
      })
      .filter((group) => group.members.length > 0);

    // Include members with no team memberships at all, or whose memberships
    // all point to non-existent / archived teams
    let unassigned = members.filter((m) => m.teamIds.length === 0 || !m.teamIds.some((id) => teamIds.has(id)));
    if (filterPerson !== 'all') {
      unassigned = unassigned.filter((m) => m.id === filterPerson);
    }
    if (filterAbsenceType !== 'all') {
      unassigned = unassigned.filter((m) => {
        return absences.some(
          (a) =>
            a.memberId === m.id &&
            a.type === filterAbsenceType &&
            (new Date(a.startDate).getMonth() === currentDate.getMonth() ||
              new Date(a.endDate).getMonth() === currentDate.getMonth()),
        );
      });
    }
    if (unassigned.length > 0) {
      const noTeam: Team = {
        id: '__no_team__',
        name: 'No Team',
        icon: 'Users',
        scheduleType: 'absence-only',
        adminOnly: false,
        sortOrder: 9999,
      };
      groups.push({ team: noTeam, members: unassigned });
    }

    return groups;
  }, [sortedTeams, members, filterPerson, filterAbsenceType, absences, currentDate]);

  const pendingAbsences = useMemo(() => absences.filter((a) => a.status === 'pending'), [absences]);

  const decidedAbsences = useMemo(
    () => absences.filter((a) => a.status === 'approved' || a.status === 'declined'),
    [absences],
  );
  const pendingCount = pendingAbsences.length;
  const showPendingTab = isAdmin(userRole);

  return (
    <div className="p-3 md:p-6 h-full flex flex-col bg-white dark:bg-black relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4 mb-4 md:mb-6 flex-shrink-0">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Schedule</h1>
          <p className="text-zinc-500 mt-0.5 md:mt-1 text-xs md:text-sm">
            Team availability & shifts for {monthName} {year}.
          </p>
        </div>

        {/* Wraps on phones: [Me][People][Absence] on the first row, the month
            stepper full-width on the second. One row of four squeezed each
            control to about 90px. */}
        <div className="w-full md:w-auto flex flex-wrap items-stretch gap-2 md:gap-3 md:flex-nowrap md:items-center">
          {(() => {
            const me = members.find((m) => m.id === currentUserId);
            if (!me) return null;
            const isMe = filterPerson === currentUserId;
            return (
              <button
                type="button"
                onClick={() => setFilterPerson(isMe ? 'all' : currentUserId)}
                aria-pressed={isMe}
                title={isMe ? 'Show everyone' : 'Show only me'}
                className={`flex items-center gap-1.5 md:gap-2 rounded-lg border min-h-[32px] px-2 md:px-2.5 py-1 text-xs font-medium transition-colors flex-shrink-0 ${
                  isMe
                    ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:border-blue-500 dark:hover:bg-blue-600'
                    : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                }`}
              >
                <Avatar src={me.avatar} alt={me.name} size="sm" />
                <span className="hidden md:inline">Me</span>
              </button>
            );
          })()}
          <div className="flex-1 grid grid-cols-2 gap-2 md:flex md:flex-none md:items-center md:gap-3 md:w-auto">
            <CustomSelect
              icon={User}
              options={[
                { value: 'all', label: 'All People' },
                ...sortedMembers.map((m) => ({ value: m.id, label: m.name })),
              ]}
              value={filterPerson}
              onChange={setFilterPerson}
              placeholder="All People"
              searchable
              highlightValue={currentUserId}
              className="min-w-0 md:w-[140px]"
            />
            <CustomSelect
              icon={Filter}
              options={[
                { value: 'all', label: 'All Absences' },
                { value: 'holiday', label: 'Holiday' },
                { value: 'sick', label: 'Sick Leave' },
                { value: 'business_trip', label: 'Business Trip' },
                { value: 'day_off', label: 'Day Off' },
                { value: 'free', label: 'Free' },
                { value: 'busy', label: 'Busy' },
              ]}
              value={filterAbsenceType}
              onChange={setFilterAbsenceType}
              placeholder="Absence Type"
              className="min-w-0 md:w-[140px]"
            />
          </div>
          <div className="w-full md:w-auto flex items-center justify-between gap-1 md:gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg min-h-[36px] md:min-h-[32px] px-1 md:px-2 py-1 md:py-1.5 min-w-0">
            <button
              onClick={() => changeMonth(-1)}
              className="p-2 md:p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400 flex-shrink-0"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium md:font-normal md:w-32 text-center text-zinc-900 dark:text-zinc-100 flex items-center justify-center gap-1.5 min-w-0">
              <Calendar size={14} className="text-zinc-400 flex-shrink-0" />
              <span className="truncate">
                {monthName} {year}
              </span>
            </span>
            <button
              onClick={() => changeMonth(1)}
              className="p-2 md:p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400 flex-shrink-0"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {showPendingTab && (
        <div className="flex gap-1 mb-4 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${activeTab === 'calendar' ? 'bg-white dark:bg-zinc-700 shadow-sm text-black dark:text-white' : 'text-zinc-500'}`}
          >
            Calendar
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`text-xs px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-1.5 ${activeTab === 'pending' ? 'bg-white dark:bg-zinc-700 shadow-sm text-black dark:text-white' : 'text-zinc-500'}`}
          >
            Pending Requests
            {pendingCount > 0 && (
              <span className="min-w-[18px] h-[18px] flex items-center justify-center bg-amber-500 text-white text-[10px] font-semibold rounded-full px-1">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      )}

      {activeTab === 'pending' && showPendingTab ? (
        <div className="flex-1 overflow-y-auto">
          <AbsenceApprovalQueue
            pendingAbsences={pendingAbsences}
            decidedAbsences={decidedAbsences}
            allAbsences={absences}
            members={members}
            onApprove={onApproveAbsence}
            onDecline={onDeclineAbsence}
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800 flex-1 flex flex-col overflow-hidden shadow-sm relative">
          <div
            ref={gridScrollRef}
            className={`flex-1 overflow-auto custom-scrollbar relative overscroll-x-contain ${
              isTouchSelecting ? 'touch-none' : ''
            }`}
          >
            <div style={{ width: 'max-content', minWidth: '100%' }}>
              <div className="flex sticky top-0 z-30 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 h-14">
                <div className="sticky left-0 z-40 w-28 md:w-64 bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 px-2 py-3 md:p-3 text-[10px] font-semibold uppercase text-zinc-500 tracking-wider flex items-center shadow-[1px_0_0_0_rgba(228,228,231,1)] dark:shadow-[1px_0_0_0_rgba(39,39,42,1)]">
                  <span className="md:hidden">Member</span>
                  <span className="hidden md:inline">Team Member</span>
                </div>
                {days.map((day) => {
                  const isToday =
                    day === new Date().getDate() &&
                    currentDate.getMonth() === new Date().getMonth() &&
                    currentDate.getFullYear() === new Date().getFullYear();
                  return (
                    <div
                      key={day}
                      className={`w-8 md:w-10 flex-shrink-0 text-center flex flex-col items-center justify-center border-r border-zinc-100 dark:border-zinc-800 text-[10px] text-zinc-400 font-medium last:border-r-0 select-none ${isToday ? 'bg-red-50/50 dark:bg-red-900/20' : isWeekend(day) ? 'bg-emerald-50/60 dark:bg-emerald-900/15' : ''}`}
                    >
                      <span
                        className={`text-zinc-900 dark:text-white font-bold ${isToday ? 'text-red-600 dark:text-red-400' : ''}`}
                      >
                        {day}
                      </span>
                      <span
                        className={`text-[9px] md:text-[10px] uppercase ${isToday ? 'text-red-500 dark:text-red-400' : ''}`}
                      >
                        {getDayShortName(day)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {membersByTeam.map((group) => {
                const isCurrentUserTeam = group.members.some((m) => m.id === currentUserId);
                const isTeamDragOver = dragState.dragType === 'team' && dragState.dragOverId === group.team.id;
                const teamDropClass = isTeamDragOver
                  ? dragState.dropPosition === 'after'
                    ? 'border-b-2 border-b-blue-400 dark:border-b-blue-500'
                    : 'border-t-2 border-t-blue-400 dark:border-t-blue-500'
                  : '';
                return (
                  <div key={group.team.id} onDragEnd={handleDragEnd}>
                    <div
                      className={`flex border-b border-zinc-200 dark:border-zinc-800 ${teamDropClass}`}
                      draggable={isAdminUser}
                      onDragStart={(e) => handleTeamDragStart(e, group.team.id)}
                      onDragOver={(e) => handleTeamDragOver(e, group.team.id)}
                      onDrop={(e) => handleTeamDrop(e, group.team.id)}
                    >
                      <div
                        className={`group sticky left-0 z-20 w-28 md:w-64 bg-zinc-100/95 dark:bg-zinc-800/95 backdrop-blur-sm border-r border-zinc-200 dark:border-zinc-800 px-2 md:px-3 py-1.5 flex items-center gap-1.5 cursor-pointer hover:bg-zinc-200/95 dark:hover:bg-zinc-700/95 transition-colors shadow-[1px_0_0_0_rgba(228,228,231,1)] dark:shadow-[1px_0_0_0_rgba(39,39,42,1)] ${isCurrentUserTeam ? 'border-l-2 border-l-blue-400 dark:border-l-blue-500' : ''}`}
                        onClick={() => toggleTeamCollapse(group.team.id)}
                      >
                        <ChevronDown
                          size={14}
                          className={`text-zinc-500 transition-transform duration-200 ${collapsedTeams[group.team.id] ? '-rotate-90' : ''}`}
                        />
                        <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                          {group.team.name}
                        </span>
                        {isAdminUser && (
                          <div className="ml-auto opacity-100 md:opacity-0 md:group-hover:opacity-100 text-zinc-300 hover:text-zinc-500 dark:hover:text-zinc-200 cursor-grab active:cursor-grabbing flex-shrink-0 transition-opacity">
                            <GripVertical size={12} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 bg-zinc-50/50 dark:bg-zinc-900/50"></div>
                    </div>

                    {!collapsedTeams[group.team.id] &&
                      group.members.map((member) => {
                        const isCurrentUser = member.id === currentUserId;
                        const isMemberDragOver = dragState.dragType === 'member' && dragState.dragOverId === member.id;
                        const memberDropClass = isMemberDragOver
                          ? dragState.dropPosition === 'after'
                            ? 'border-b-2 border-b-blue-400 dark:border-b-blue-500'
                            : 'border-t-2 border-t-blue-400 dark:border-t-blue-500'
                          : '';
                        return (
                          <div
                            // Composite key — a multi-team member appears in multiple rows
                            key={`${group.team.id}-${member.id}`}
                            className={`flex border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors h-10 ${isCurrentUser ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''} ${memberDropClass}`}
                            onDragOver={(e) => handleMemberDragOver(e, member.id)}
                            onDrop={(e) => handleMemberDrop(e, member.id)}
                            onDragEnd={handleDragEnd}
                          >
                            <div
                              className={`group sticky left-0 z-10 w-28 md:w-64 border-r border-zinc-200 dark:border-zinc-800 py-1 px-1.5 md:px-2 flex items-center gap-1.5 md:gap-2 shadow-[1px_0_0_0_rgba(228,228,231,1)] dark:shadow-[1px_0_0_0_rgba(39,39,42,1)] cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 ${isCurrentUser ? 'bg-blue-50 dark:bg-blue-950' : 'bg-white dark:bg-zinc-900'}`}
                              onClick={() => setSelectedMemberStats(member)}
                            >
                              <Avatar src={member.avatar} alt={member.name} size="sm" />
                              <div className="min-w-0 flex-1">
                                <p
                                  className="text-[11px] md:text-xs font-medium text-zinc-900 dark:text-zinc-200 truncate"
                                  title={member.name}
                                >
                                  <span className="md:hidden">{shortenName(member.name)}</span>
                                  <span className="hidden md:inline">{member.name}</span>
                                </p>
                                {/* The job title has no room beside seven day columns. */}
                                <p className="hidden md:block text-[11px] text-zinc-400 truncate">{member.jobTitle}</p>
                              </div>
                              {isAdminUser && (
                                <div
                                  className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-zinc-300 hover:text-zinc-500 dark:hover:text-zinc-200 cursor-grab active:cursor-grabbing flex-shrink-0 ml-auto transition-opacity"
                                  draggable
                                  onDragStart={(e) => {
                                    e.stopPropagation();
                                    handleMemberDragStart(e, group.team.id, member.id);
                                  }}
                                >
                                  <GripVertical size={12} />
                                </div>
                              )}
                            </div>
                            {days.map((day) => {
                              const absence = getAbsenceForDay(member.id, day);
                              const shift = getShiftForDay(member.id, group.team.id, day);
                              const isToday =
                                day === new Date().getDate() &&
                                currentDate.getMonth() === new Date().getMonth() &&
                                currentDate.getFullYear() === new Date().getFullYear();

                              let content = null;
                              let cellClass = 'hover:bg-zinc-100 dark:hover:bg-zinc-800';

                              const inSelection =
                                dragStart &&
                                dragStart.memberId === member.id &&
                                dragStart.teamId === group.team.id &&
                                day >= Math.min(dragStart.day, dragEnd?.day || day) &&
                                day <= Math.max(dragStart.day, dragEnd?.day || day);

                              if (absence) {
                                let bgClass = '';
                                let text = '';
                                switch (absence.type) {
                                  case 'holiday':
                                    bgClass =
                                      'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
                                    text = 'HOLS';
                                    break;
                                  case 'sick':
                                    bgClass = 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400';
                                    text = 'SICK';
                                    break;
                                  case 'business_trip':
                                    bgClass = 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400';
                                    text = 'TRIP';
                                    break;
                                  case 'day_off':
                                    bgClass = 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300';
                                    text = 'OFF';
                                    break;
                                  case 'free':
                                    bgClass = 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
                                    text = 'FREE';
                                    break;
                                  case 'busy':
                                    bgClass =
                                      'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
                                    text = 'BUSY';
                                    break;
                                  default:
                                    bgClass = 'bg-zinc-100';
                                    text = 'OUT';
                                }

                                // Visual status indicators
                                let statusClass = '';
                                let statusIcon: React.ReactNode = null;
                                if (absence.status === 'pending') {
                                  statusClass = 'opacity-60 border-dashed border-2 border-current';
                                  statusIcon = <Clock size={8} className="absolute top-0.5 right-0.5" />;
                                }

                                content = (
                                  <div
                                    className={`w-full h-full flex items-center justify-center ${bgClass} ${statusClass} text-[10px] font-semibold tracking-tight select-none relative`}
                                    title={shift ? `${text} — shift ${describeShift(shift)} underneath` : text}
                                  >
                                    {text}
                                    {statusIcon}
                                    {shift && (
                                      <span
                                        aria-hidden
                                        className="absolute bottom-0.5 right-0.5 h-1 w-1 rounded-full bg-current opacity-50"
                                      />
                                    )}
                                  </div>
                                );
                                cellClass = '';
                              } else if (shift) {
                                const shiftAllDay =
                                  shift.startTime.startsWith('00:00') && shift.endTime.startsWith('23:59');
                                content = shift.shiftType ? (
                                  <div
                                    className={`flex flex-col items-center justify-center h-full w-full select-none ${
                                      shift.shiftType === 'on_duty'
                                        ? 'bg-indigo-100 dark:bg-indigo-900/30'
                                        : 'bg-pink-100 dark:bg-pink-900/30'
                                    }`}
                                  >
                                    <span
                                      className={`text-[10px] font-semibold leading-none ${
                                        shift.shiftType === 'on_duty'
                                          ? 'text-indigo-700 dark:text-indigo-400'
                                          : 'text-pink-700 dark:text-pink-400'
                                      }`}
                                    >
                                      {shift.shiftType === 'on_duty' ? 'DUTY' : 'CALL'}
                                    </span>
                                  </div>
                                ) : (
                                  <div
                                    className={`flex flex-col items-center justify-center h-full w-full select-none ${isToday ? 'bg-red-50/20 dark:bg-red-900/10' : 'bg-zinc-100 dark:bg-zinc-800'}`}
                                  >
                                    {shiftAllDay ? (
                                      <span className="text-[10px] font-medium text-zinc-900 dark:text-zinc-100 leading-none">
                                        All day
                                      </span>
                                    ) : (
                                      <>
                                        <span className="text-[10px] font-medium text-zinc-900 dark:text-zinc-100 leading-none">
                                          {shift.startTime.slice(0, 5)}
                                        </span>
                                        <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800 my-0.5"></div>
                                        <span className="text-[10px] text-zinc-500 leading-none">
                                          {shift.endTime.slice(0, 5)}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={day}
                                  data-day={day}
                                  onMouseDown={() => handleMouseDown(member, group.team.id, day)}
                                  onMouseEnter={() => handleMouseEnter(member, group.team.id, day)}
                                  onMouseUp={() => handleMouseUp(member, group.team.id, day)}
                                  onTouchStart={(e) => handleTouchStart(e, member, group.team.id, day)}
                                  onTouchMove={handleTouchMove}
                                  onTouchEnd={(e) => handleTouchEnd(e, member, group.team.id, day)}
                                  onTouchCancel={abandonTouch}
                                  className={`w-8 md:w-10 flex-shrink-0 border-r relative cursor-pointer last:border-r-0 transition-colors ${shift ? 'border-zinc-200 dark:border-zinc-700' : 'border-zinc-100 dark:border-zinc-800'} ${cellClass} ${inSelection ? 'ring-2 ring-inset ring-blue-500 z-20 bg-blue-50 dark:bg-blue-900/20' : ''} ${isToday && !content ? 'bg-red-50/10 dark:bg-red-900/5' : !content && isWeekend(day) ? 'bg-emerald-50/40 dark:bg-emerald-900/10' : ''}`}
                                >
                                  {content}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={!!selectedMemberStats} onClose={() => setSelectedMemberStats(null)} title="" size="md">
        {selectedMemberStats && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Avatar
                src={selectedMemberStats.avatar}
                alt={selectedMemberStats.name}
                size="lg"
                className="!w-12 !h-12"
              />
              <div>
                <h3 className="font-semibold text-lg text-zinc-900 dark:text-white">{selectedMemberStats.name}</h3>
                <p className="text-xs text-zinc-500">{selectedMemberStats.jobTitle}</p>
              </div>
            </div>

            <Label variant="section" className="mb-3">
              Absence Statistics (Current Year)
            </Label>
            {(() => {
              const stats = calculateAbsenceStats(selectedMemberStats.id, absences);
              return (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded border border-emerald-100 dark:border-emerald-900/40">
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase">Holidays</p>
                    <div className="flex justify-between items-end mt-1">
                      <span className="text-xl font-bold text-emerald-900 dark:text-emerald-100">
                        {stats.holidayDays}/24
                      </span>
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">
                        {24 - stats.holidayDays} left
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-100 dark:border-red-900/40">
                    <p className="text-xs font-semibold text-red-800 dark:text-red-300 uppercase">Sick Leave</p>
                    <p className="text-xl font-bold text-red-900 dark:text-red-100 mt-1">
                      {stats.sickDays} <span className="text-xs font-normal opacity-70">days</span>
                    </p>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100 dark:border-blue-900/40">
                    <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase">Business Trip</p>
                    <p className="text-xl font-bold text-blue-900 dark:text-blue-100 mt-1">
                      {stats.businessDays} <span className="text-xs font-normal opacity-70">days</span>
                    </p>
                  </div>
                  <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">
                    <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase">Day Off</p>
                    <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                      {stats.daysOff} <span className="text-xs font-normal opacity-70">days</span>
                    </p>
                  </div>
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-100 dark:border-amber-900/40">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase">Free</p>
                    <p className="text-xl font-bold text-amber-900 dark:text-amber-100 mt-1">
                      {stats.freeDays} <span className="text-xs font-normal opacity-70">days</span>
                    </p>
                  </div>
                  <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-100 dark:border-purple-900/40">
                    <p className="text-xs font-semibold text-purple-800 dark:text-purple-300 uppercase">Busy</p>
                    <p className="text-xl font-bold text-purple-900 dark:text-purple-100 mt-1">
                      {stats.busyDays} <span className="text-xs font-normal opacity-70">days</span>
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!selectedCell}
        onClose={() => setSelectedCell(null)}
        title="Edit Schedule"
        size="md"
        allowOverflow
        actions={
          <div className="flex items-center gap-3 w-full">
            {(() => {
              const existingAbsence = selectedCell ? getAbsenceForDay(selectedCell.member.id, selectedCell.day) : null;
              const isOwnPending =
                existingAbsence && existingAbsence.memberId === currentUserId && existingAbsence.status === 'pending';
              const isReadOnly = existingAbsence && existingAbsence.status !== 'pending' && !isAdmin(userRole);
              return (
                <>
                  {isOwnPending && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        onCancelAbsence(existingAbsence.id);
                        setSelectedCell(null);
                      }}
                    >
                      Cancel Request
                    </Button>
                  )}
                  {!isReadOnly && (
                    <>
                      <button
                        onClick={handleDelete}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-red-200"
                      >
                        <Trash2 size={18} />
                      </button>
                      <Button onClick={handleSave} className="flex-1 py-2 text-center cursor-pointer">
                        Save
                      </Button>
                    </>
                  )}
                  {isReadOnly && (
                    <p className="text-xs text-zinc-400 flex-1 text-center">
                      This absence has been {existingAbsence.status} and cannot be edited.
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        }
      >
        {selectedCell &&
          (() => {
            const existingAbsence = getAbsenceForDay(selectedCell.member.id, selectedCell.day);
            const isSA = isAdmin(userRole);
            const decider = existingAbsence?.decidedBy ? members.find((m) => m.id === existingAbsence.decidedBy) : null;
            const holidayStats =
              existingAbsence?.type === 'holiday' ? calculateAbsenceStats(selectedCell.member.id, absences) : null;

            const cellTeam =
              selectedCell.teamId && selectedCell.teamId !== '__no_team__'
                ? teams.find((t) => t.id === selectedCell.teamId)
                : null;
            const coveredShift = getShiftForDay(selectedCell.member.id, selectedCell.teamId, selectedCell.day);
            return (
              <div>
                <p className="text-xs text-zinc-500 mb-4 font-medium flex items-center gap-1.5">
                  {selectedCell.member.name}
                  {cellTeam && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                      {cellTeam.name}
                    </span>
                  )}
                </p>

                {/* Status banner for existing absences */}
                {existingAbsence && existingAbsence.status === 'pending' && (
                  <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-amber-500" />
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                          Pending Approval
                        </span>
                      </div>
                      {holidayStats && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                          {24 - holidayStats.holidayDays} / 24 holiday days left
                        </span>
                      )}
                    </div>
                    {isSA && !modalDeclineMode && (
                      <div className="flex gap-2 mt-2.5">
                        <button
                          onClick={() => {
                            onApproveAbsence(existingAbsence.id);
                            setSelectedCell(null);
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 rounded-md transition-colors"
                        >
                          <Check size={14} /> Approve
                        </button>
                        <button
                          onClick={() => setModalDeclineMode(true)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 rounded-md transition-colors"
                        >
                          <X size={14} /> Decline
                        </button>
                      </div>
                    )}
                    {isSA && modalDeclineMode && (
                      <div className="mt-2.5 space-y-2">
                        <Input
                          placeholder="Reason for declining (optional)..."
                          value={modalDeclineReason}
                          onChange={(e) => setModalDeclineReason(e.target.value)}
                          autoFocus
                          className="!py-1.5 !text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              onDeclineAbsence(existingAbsence.id, modalDeclineReason || undefined);
                              setSelectedCell(null);
                            }
                            if (e.key === 'Escape') setModalDeclineMode(false);
                          }}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              onDeclineAbsence(existingAbsence.id, modalDeclineReason || undefined);
                              setSelectedCell(null);
                            }}
                            className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
                          >
                            Confirm Decline
                          </button>
                          <button
                            onClick={() => {
                              setModalDeclineMode(false);
                              setModalDeclineReason('');
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors"
                          >
                            Back
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {existingAbsence && existingAbsence.status === 'approved' && (
                  <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Check size={14} className="text-emerald-500" />
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Approved</span>
                      </div>
                      {decider && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                          by {decider.name}
                          {existingAbsence.decidedAt ? ` on ${formatDateEU(existingAbsence.decidedAt)}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {existingAbsence && existingAbsence.status === 'declined' && (
                  <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle size={14} className="text-red-500" />
                        <span className="text-xs font-semibold text-red-700 dark:text-red-300">Declined</span>
                      </div>
                      {decider && (
                        <span className="text-[10px] text-red-600 dark:text-red-400">
                          by {decider.name}
                          {existingAbsence.decidedAt ? ` on ${formatDateEU(existingAbsence.decidedAt)}` : ''}
                        </span>
                      )}
                    </div>
                    {existingAbsence.declineReason && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 italic">
                        &ldquo;{existingAbsence.declineReason}&rdquo;
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  {isAdmin(userRole) ? (
                    <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded mb-4">
                      <button
                        onClick={() => setEditType('shift')}
                        className={`flex-1 text-xs py-1.5 rounded font-medium transition-colors ${editType === 'shift' ? 'bg-white dark:bg-zinc-700 shadow-sm text-black dark:text-white' : 'text-zinc-500'}`}
                      >
                        Shift
                      </button>
                      <button
                        onClick={() => setEditType('absence')}
                        className={`flex-1 text-xs py-1.5 rounded font-medium transition-colors ${editType === 'absence' ? 'bg-white dark:bg-zinc-700 shadow-sm text-black dark:text-white' : 'text-zinc-500'}`}
                      >
                        Absence
                      </button>
                    </div>
                  ) : (
                    <div className="mb-4">
                      <span className="text-xs font-medium text-zinc-500">Absence Request</span>
                    </div>
                  )}

                  {editType === 'absence' && coveredShift && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 dark:border-zinc-700 dark:bg-zinc-800/50">
                      <Clock size={14} className="mt-px flex-shrink-0 text-zinc-400" />
                      <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                        A shift of{' '}
                        <span className="font-medium text-zinc-900 dark:text-zinc-200">
                          {describeShift(coveredShift)}
                        </span>
                        {cellTeam ? ` in ${cellTeam.name}` : ''} sits under this absence — it is hidden, not removed,
                        and reappears once the absence is deleted or declined.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <Label className="mb-1 block">From</Label>
                      <SimpleDatePicker value={rangeStartDate} onChange={setRangeStartDate} placeholder="Select Date" />
                    </div>
                    <div className="min-w-0">
                      <Label className="mb-1 block">To</Label>
                      <SimpleDatePicker value={rangeEndDate} onChange={setRangeEndDate} placeholder="Select Date" />
                    </div>
                  </div>

                  {editType === 'absence' ? (
                    <div>
                      <CustomSelect
                        label="Absence Type"
                        options={[
                          { value: 'holiday', label: 'Holiday' },
                          { value: 'sick', label: 'Sick Leave' },
                          { value: 'business_trip', label: 'Business Trip' },
                          { value: 'day_off', label: 'Day Off' },
                          { value: 'free', label: 'Free' },
                          { value: 'busy', label: 'Busy' },
                        ]}
                        value={absenceType}
                        onChange={(v) => setAbsenceType(v as any)}
                      />
                    </div>
                  ) : teams.find((t) => t.id === selectedCell?.teamId)?.rapidResponse ? (
                    <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded">
                      <button
                        onClick={() => setShiftType('on_duty')}
                        className={`flex-1 text-xs py-1.5 rounded font-medium transition-colors ${shiftType === 'on_duty' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-500'}`}
                      >
                        DUTY
                      </button>
                      <button
                        onClick={() => setShiftType('on_call')}
                        className={`flex-1 text-xs py-1.5 rounded font-medium transition-colors ${shiftType === 'on_call' ? 'bg-pink-600 text-white shadow-sm' : 'text-zinc-500'}`}
                      >
                        CALL
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isAllDay}
                          onClick={() => setIsAllDay(!isAllDay)}
                          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${isAllDay ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${isAllDay ? 'translate-x-4' : 'translate-x-0'}`}
                          />
                        </button>
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">All day</span>
                      </label>
                      {!isAllDay && (
                        /* One per row below sm: a native time control has a fixed
                           intrinsic width that overlapped its neighbour in a
                           two-column grid on a phone. */
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="min-w-0">
                            <Label className="mb-1 block">Start Time</Label>
                            <Input
                              type="time"
                              value={startTime}
                              onChange={(e) => setStartTime(e.target.value)}
                              className="p-2 min-w-0"
                            />
                          </div>
                          <div className="min-w-0">
                            <Label className="mb-1 block">End Time</Label>
                            <Input
                              type="time"
                              value={endTime}
                              onChange={(e) => setEndTime(e.target.value)}
                              className="p-2 min-w-0"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
      </Modal>
    </div>
  );
};

export default Schedule;
