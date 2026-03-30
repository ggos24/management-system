import React, { useState, useMemo, useRef } from 'react';
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
} from 'lucide-react';
import { Modal } from './Modal';
import { Avatar } from './Avatar';
import { SimpleDatePicker } from './SimpleDatePicker';
import { CustomSelect } from './CustomSelect';
import { calculateAbsenceStats } from '../lib/utils';
import { isAdmin, isEditorOrAbove } from '../constants';
import { Button, Label, Input, Badge } from './ui';
import { AbsenceApprovalQueue } from './AbsenceApprovalQueue';

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
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedCell, setSelectedCell] = useState<{
    member: Member;
    day: number;
  } | null>(null);

  // Tab state: calendar vs pending requests
  const [activeTab, setActiveTab] = useState<'calendar' | 'pending'>('calendar');

  // Drag Selection State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ memberId: string; day: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ memberId: string; day: number } | null>(null);

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

  // Collapsed Teams State
  const [collapsedTeams, setCollapsedTeams] = useState<Record<string, boolean>>({});

  // Filters
  const [filterPerson, setFilterPerson] = useState('all');
  const [filterAbsenceType, setFilterAbsenceType] = useState('all');

  // Ref to track touch-initiated member for drag selection
  const touchMemberRef = useRef<Member | null>(null);

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

  const getAbsenceForDay = (memberId: string, day: number) => {
    const dateStr = getDateStr(day);
    return absences.find(
      (a) => a.memberId === memberId && a.status !== 'declined' && dateStr >= a.startDate && dateStr <= a.endDate,
    );
  };

  const getShiftForDay = (memberId: string, day: number) => {
    const dateStr = getDateStr(day);
    return shifts.find((s) => s.memberId === memberId && s.date === dateStr);
  };

  const handleMouseDown = (member: Member, day: number) => {
    // Editors+ can click any row; users can only click their own row (for absences)
    if (!isEditorOrAbove(userRole) && member.id !== currentUserId) return;
    setIsDragging(true);
    setDragStart({ memberId: member.id, day });
    setDragEnd({ memberId: member.id, day });
  };

  const handleMouseEnter = (member: Member, day: number) => {
    if (isDragging && dragStart && dragStart.memberId === member.id) {
      setDragEnd({ memberId: member.id, day });
    }
  };

  const handleMouseUp = (member: Member, day: number) => {
    if (!isDragging || !dragStart) return;
    setIsDragging(false);

    const startDay = Math.min(dragStart.day, dragEnd?.day || day);
    const endDay = Math.max(dragStart.day, dragEnd?.day || day);

    const startStr = getDateStr(startDay);
    const endStr = getDateStr(endDay);

    setRangeStartDate(startStr);
    setRangeEndDate(endStr);

    const existingAbsence = getAbsenceForDay(member.id, startDay);
    const existingShift = getShiftForDay(member.id, startDay);

    setSelectedCell({ member, day: startDay });

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
    } else {
      setIsAllDay(false);
      setStartTime('09:00');
      setEndTime('17:00');
    }

    // Determine which tab to show
    setEditType(existingAbsence ? 'absence' : 'shift');

    // Reset decline mode
    setModalDeclineMode(false);
    setModalDeclineReason('');

    setDragStart(null);
    setDragEnd(null);
  };

  // Touch event handlers for mobile drag-select
  const handleTouchStart = (e: React.TouchEvent, member: Member, day: number) => {
    touchMemberRef.current = member;
    handleMouseDown(member, day);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !dragStart || !touchMemberRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return;
    const cell = el.closest('[data-day]') as HTMLElement | null;
    if (cell && cell.dataset.day) {
      const day = parseInt(cell.dataset.day, 10);
      handleMouseEnter(touchMemberRef.current, day);
    }
  };

  const handleTouchEnd = (_e: React.TouchEvent, member: Member, day: number) => {
    const finalDay = dragEnd?.day ?? day;
    handleMouseUp(member, finalDay);
    touchMemberRef.current = null;
  };

  const handleSave = () => {
    if (!selectedCell) return;

    // Only editors+ can save shifts
    if (editType === 'shift' && !isEditorOrAbove(userRole)) return;

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
        const existingShift = getShiftForDay(selectedCell.member.id, dayNum);
        const newShift: Shift = {
          id: existingShift?.id || crypto.randomUUID(),
          memberId: selectedCell.member.id,
          date: dateStr,
          startTime: isAllDay ? '00:00' : startTime,
          endTime: isAllDay ? '23:59' : endTime,
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
    } else {
      const start = new Date(rangeStartDate);
      const end = new Date(rangeEndDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const existing = getShiftForDay(selectedCell.member.id, d.getDate());
        if (existing) onDeleteShift(existing.id);
      }
    }
    setSelectedCell(null);
  };

  const toggleTeamCollapse = (teamId: string) => {
    setCollapsedTeams((prev) => ({ ...prev, [teamId]: !prev[teamId] }));
  };

  const membersByTeam = useMemo(() => {
    const teamIds = new Set(teams.map((t) => t.id));
    const groups = teams
      .map((team) => {
        let teamMembers = members.filter((m) => m.teamId === team.id);
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

    // Include members without a team (or with a non-existent team)
    let unassigned = members.filter((m) => !m.teamId || !teamIds.has(m.teamId));
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
  }, [teams, members, filterPerson, filterAbsenceType, absences, currentDate]);

  const pendingAbsences = useMemo(() => absences.filter((a) => a.status === 'pending'), [absences]);

  const decidedAbsences = useMemo(
    () => absences.filter((a) => a.status === 'approved' || a.status === 'declined'),
    [absences],
  );
  const pendingCount = pendingAbsences.length;
  const showPendingTab = isAdmin(userRole);

  return (
    <div className="p-3 md:p-6 h-full flex flex-col bg-white dark:bg-black relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Schedule</h1>
          <p className="text-zinc-500 mt-1 text-sm">
            Team availability & shifts for {monthName} {year}.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-[140px]">
            <CustomSelect
              icon={User}
              options={[{ value: 'all', label: 'All People' }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
              value={filterPerson}
              onChange={setFilterPerson}
              placeholder="All People"
            />
          </div>
          <div className="w-[140px]">
            <CustomSelect
              icon={Filter}
              options={[
                { value: 'all', label: 'All Absences' },
                { value: 'holiday', label: 'Holiday' },
                { value: 'sick', label: 'Sick Leave' },
                { value: 'business_trip', label: 'Business Trip' },
                { value: 'day_off', label: 'Day Off' },
              ]}
              value={filterAbsenceType}
              onChange={setFilterAbsenceType}
              placeholder="Absence Type"
            />
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg min-h-[32px] px-2 py-1.5">
            <button
              onClick={() => changeMonth(-1)}
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm w-28 text-center text-zinc-900 dark:text-zinc-100 flex items-center justify-center gap-1.5">
              <Calendar size={14} className="text-zinc-400" /> {monthName}
            </span>
            <button
              onClick={() => changeMonth(1)}
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400"
            >
              <ChevronRight size={14} />
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
          <div className="flex-1 overflow-auto snap-x snap-mandatory md:snap-none custom-scrollbar relative">
            <div style={{ width: 'max-content', minWidth: '100%' }}>
              <div className="flex sticky top-0 z-30 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 h-14">
                <div className="sticky left-0 z-40 w-64 bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 p-3 text-[10px] font-semibold uppercase text-zinc-500 tracking-wider flex items-center shadow-[1px_0_0_0_rgba(228,228,231,1)] dark:shadow-[1px_0_0_0_rgba(39,39,42,1)]">
                  Team Member
                </div>
                {days.map((day) => {
                  const isToday =
                    day === new Date().getDate() &&
                    currentDate.getMonth() === new Date().getMonth() &&
                    currentDate.getFullYear() === new Date().getFullYear();
                  return (
                    <div
                      key={day}
                      className={`w-10 flex-shrink-0 text-center flex flex-col items-center justify-center border-r border-zinc-100 dark:border-zinc-800 text-[10px] text-zinc-400 font-medium last:border-r-0 select-none ${isToday ? 'bg-red-50/50 dark:bg-red-900/20' : ''}`}
                    >
                      <span
                        className={`text-zinc-900 dark:text-white font-bold ${isToday ? 'text-red-600 dark:text-red-400' : ''}`}
                      >
                        {day}
                      </span>
                      <span className={`text-[10px] uppercase ${isToday ? 'text-red-500 dark:text-red-400' : ''}`}>
                        {getDayShortName(day)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {membersByTeam.map((group) => (
                <div key={group.team.id}>
                  <div className="flex border-b border-zinc-200 dark:border-zinc-800">
                    <div
                      className="sticky left-0 z-20 w-64 bg-zinc-100/95 dark:bg-zinc-800/95 backdrop-blur-sm border-r border-zinc-200 dark:border-zinc-800 px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-zinc-200/95 dark:hover:bg-zinc-700/95 transition-colors shadow-[1px_0_0_0_rgba(228,228,231,1)] dark:shadow-[1px_0_0_0_rgba(39,39,42,1)]"
                      onClick={() => toggleTeamCollapse(group.team.id)}
                    >
                      <ChevronDown
                        size={14}
                        className={`text-zinc-500 transition-transform duration-200 ${collapsedTeams[group.team.id] ? '-rotate-90' : ''}`}
                      />
                      <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                        {group.team.name}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 bg-zinc-50/50 dark:bg-zinc-900/50"></div>
                  </div>

                  {!collapsedTeams[group.team.id] &&
                    group.members.map((member) => (
                      <div
                        key={member.id}
                        className="flex border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors h-14"
                      >
                        <div
                          className="sticky left-0 z-10 w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 p-2 flex items-center gap-3 shadow-[1px_0_0_0_rgba(228,228,231,1)] dark:shadow-[1px_0_0_0_rgba(39,39,42,1)] cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800"
                          onClick={() => setSelectedMemberStats(member)}
                        >
                          <Avatar src={member.avatar} size="md" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-zinc-900 dark:text-zinc-200 truncate group-hover:underline">
                              {member.name}
                            </p>
                            <p className="text-[11px] text-zinc-400 truncate">{member.jobTitle}</p>
                          </div>
                        </div>
                        {days.map((day) => {
                          const absence = getAbsenceForDay(member.id, day);
                          const shift = getShiftForDay(member.id, day);
                          const isToday =
                            day === new Date().getDate() &&
                            currentDate.getMonth() === new Date().getMonth() &&
                            currentDate.getFullYear() === new Date().getFullYear();

                          let content = null;
                          let cellClass = 'hover:bg-zinc-100 dark:hover:bg-zinc-800';

                          const inSelection =
                            dragStart &&
                            dragStart.memberId === member.id &&
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
                              >
                                {text}
                                {statusIcon}
                              </div>
                            );
                            cellClass = '';
                          } else if (shift) {
                            const shiftAllDay =
                              shift.startTime.startsWith('00:00') && shift.endTime.startsWith('23:59');
                            content = (
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
                              onMouseDown={() => handleMouseDown(member, day)}
                              onMouseEnter={() => handleMouseEnter(member, day)}
                              onMouseUp={() => handleMouseUp(member, day)}
                              onTouchStart={(e) => handleTouchStart(e, member, day)}
                              onTouchMove={handleTouchMove}
                              onTouchEnd={(e) => handleTouchEnd(e, member, day)}
                              className={`w-10 flex-shrink-0 border-r relative cursor-pointer last:border-r-0 transition-colors ${shift ? 'border-zinc-200 dark:border-zinc-700' : 'border-zinc-100 dark:border-zinc-800'} ${cellClass} ${inSelection ? 'ring-2 ring-inset ring-blue-500 z-20 bg-blue-50 dark:bg-blue-900/20' : ''} ${isToday && !content ? 'bg-red-50/10 dark:bg-red-900/5' : ''}`}
                            >
                              {content}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={!!selectedMemberStats} onClose={() => setSelectedMemberStats(null)} title="" size="md">
        {selectedMemberStats && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Avatar src={selectedMemberStats.avatar} size="lg" className="!w-12 !h-12" />
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

            return (
              <div>
                <p className="text-xs text-zinc-500 mb-4 font-medium">{selectedCell.member.name}</p>

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
                          {existingAbsence.decidedAt
                            ? ` on ${new Date(existingAbsence.decidedAt).toLocaleDateString()}`
                            : ''}
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
                          {existingAbsence.decidedAt
                            ? ` on ${new Date(existingAbsence.decidedAt).toLocaleDateString()}`
                            : ''}
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
                  {isEditorOrAbove(userRole) ? (
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

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-1 block">From</Label>
                      <SimpleDatePicker value={rangeStartDate} onChange={setRangeStartDate} placeholder="Select Date" />
                    </div>
                    <div>
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
                        ]}
                        value={absenceType}
                        onChange={(v) => setAbsenceType(v as any)}
                      />
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
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="mb-1 block">Start Time</Label>
                            <Input
                              type="time"
                              value={startTime}
                              onChange={(e) => setStartTime(e.target.value)}
                              className="p-2"
                            />
                          </div>
                          <div>
                            <Label className="mb-1 block">End Time</Label>
                            <Input
                              type="time"
                              value={endTime}
                              onChange={(e) => setEndTime(e.target.value)}
                              className="p-2"
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
