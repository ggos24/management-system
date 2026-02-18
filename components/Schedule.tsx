import React, { useState, useMemo, useRef } from 'react';
import { Member, Absence, Team, Shift, UserRole } from '../types';
import { ChevronLeft, ChevronRight, Calendar, X, Trash2, ChevronDown, User, Filter } from 'lucide-react';
import { Modal } from './Modal';
import { Avatar } from './Avatar';
import { SimpleDatePicker } from './SimpleDatePicker';
import { CustomSelect } from './CustomSelect';
import { calculateAbsenceStats } from '../lib/utils';

interface ScheduleProps {
  members: Member[];
  absences: Absence[];
  shifts: Shift[];
  teams: Team[];
  userRole: UserRole;
  onUpdateAbsence: (absence: Absence) => void;
  onDeleteAbsence: (id: string) => void;
  onUpdateShift: (shift: Shift) => void;
  onDeleteShift: (id: string) => void;
}

const Schedule: React.FC<ScheduleProps> = ({
  members,
  absences,
  shifts,
  teams,
  userRole,
  onUpdateAbsence,
  onDeleteAbsence,
  onUpdateShift,
  onDeleteShift,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedCell, setSelectedCell] = useState<{
    member: Member;
    day: number;
    type: 'absence-only' | 'shift-based';
  } | null>(null);

  // Drag Selection State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ memberId: string; day: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ memberId: string; day: number } | null>(null);

  // Edit Modal State
  const [editType, setEditType] = useState<'absence' | 'shift'>('absence');
  const [absenceType, setAbsenceType] = useState<Absence['type']>('holiday');

  // Member Stats Modal State
  const [selectedMemberStats, setSelectedMemberStats] = useState<Member | null>(null);

  // Date Range State for Absences
  const [rangeStartDate, setRangeStartDate] = useState('');
  const [rangeEndDate, setRangeEndDate] = useState('');

  // Shift Times
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');

  // Collapsed Teams State
  const [collapsedTeams, setCollapsedTeams] = useState<Record<string, boolean>>({});

  // Filters
  const [filterPerson, setFilterPerson] = useState('all');
  const [filterAbsenceType, setFilterAbsenceType] = useState('all');

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
    return absences.find((a) => a.memberId === memberId && dateStr >= a.startDate && dateStr <= a.endDate);
  };

  const getShiftForDay = (memberId: string, day: number) => {
    const dateStr = getDateStr(day);
    return shifts.find((s) => s.memberId === memberId && s.date === dateStr);
  };

  const handleMouseDown = (member: Member, day: number, teamScheduleType: 'absence-only' | 'shift-based') => {
    if (userRole !== 'admin') return;
    setIsDragging(true);
    setDragStart({ memberId: member.id, day });
    setDragEnd({ memberId: member.id, day });
  };

  const handleMouseEnter = (member: Member, day: number) => {
    if (isDragging && dragStart && dragStart.memberId === member.id) {
      setDragEnd({ memberId: member.id, day });
    }
  };

  const handleMouseUp = (member: Member, day: number, teamScheduleType: 'absence-only' | 'shift-based') => {
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

    setSelectedCell({ member, day: startDay, type: teamScheduleType });

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
      setStartTime(existingShift.startTime);
      setEndTime(existingShift.endTime);
    } else {
      setStartTime('09:00');
      setEndTime('17:00');
    }

    // Determine which tab to show
    if (teamScheduleType === 'absence-only') {
      setEditType('absence');
    } else {
      setEditType(existingAbsence ? 'absence' : 'shift');
    }

    setDragStart(null);
    setDragEnd(null);
  };

  const handleSave = () => {
    if (!selectedCell) return;

    if (editType === 'absence') {
      if (!rangeStartDate || !rangeEndDate) return;
      const existing = getAbsenceForDay(selectedCell.member.id, selectedCell.day);

      const newAbsence: Absence = {
        id: existing?.id || crypto.randomUUID(),
        memberId: selectedCell.member.id,
        type: absenceType,
        startDate: rangeStartDate,
        endDate: rangeEndDate,
        approved: true,
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
          startTime,
          endTime,
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
    return teams
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
  }, [teams, members, filterPerson, filterAbsenceType, absences, currentDate]);

  return (
    <div className="p-8 h-full flex flex-col bg-white dark:bg-black relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 flex-shrink-0">
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

      <div className="bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800 flex-1 flex flex-col overflow-hidden shadow-sm relative">
        <div className="flex-1 overflow-auto custom-scrollbar relative">
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
                    <span className={`text-[8px] uppercase ${isToday ? 'text-red-500 dark:text-red-400' : ''}`}>
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
                    <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
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
                          <p className="text-[9px] text-zinc-400 uppercase tracking-wider truncate">
                            {member.jobTitle}
                          </p>
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
                              bgClass = 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
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

                          content = (
                            <div
                              className={`w-full h-full flex items-center justify-center ${bgClass} text-[9px] font-bold tracking-tight select-none`}
                            >
                              {text}
                            </div>
                          );
                          cellClass = '';
                        } else if (shift && group.team.scheduleType === 'shift-based') {
                          content = (
                            <div
                              className={`flex flex-col items-center justify-center h-full w-full select-none ${isToday ? 'bg-red-50/20 dark:bg-red-900/10' : 'bg-zinc-50 dark:bg-zinc-900'}`}
                            >
                              <span className="text-[10px] font-medium text-zinc-900 dark:text-zinc-100 leading-none">
                                {shift.startTime.slice(0, 5)}
                              </span>
                              <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800 my-0.5"></div>
                              <span className="text-[10px] text-zinc-500 leading-none">
                                {shift.endTime.slice(0, 5)}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={day}
                            onMouseDown={() => handleMouseDown(member, day, group.team.scheduleType)}
                            onMouseEnter={() => handleMouseEnter(member, day)}
                            onMouseUp={() => handleMouseUp(member, day, group.team.scheduleType)}
                            className={`w-10 flex-shrink-0 border-r border-zinc-100 dark:border-zinc-800 relative cursor-pointer last:border-r-0 transition-colors ${cellClass} ${inSelection ? 'ring-2 ring-inset ring-blue-500 z-20 bg-blue-50 dark:bg-blue-900/20' : ''} ${isToday && !content ? 'bg-red-50/10 dark:bg-red-900/5' : ''}`}
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

      <Modal isOpen={!!selectedMemberStats} onClose={() => setSelectedMemberStats(null)} title="">
        {selectedMemberStats && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Avatar src={selectedMemberStats.avatar} size="lg" className="!w-12 !h-12" />
              <div>
                <h3 className="font-bold text-lg text-zinc-900 dark:text-white">{selectedMemberStats.name}</h3>
                <p className="text-xs text-zinc-500">{selectedMemberStats.jobTitle}</p>
              </div>
            </div>

            <h4 className="text-xs font-bold text-zinc-500 uppercase mb-3">Absence Statistics (Current Year)</h4>
            {(() => {
              const stats = calculateAbsenceStats(selectedMemberStats.id, absences);
              return (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded border border-emerald-100 dark:border-emerald-900/40">
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase">Holidays</p>
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
                    <p className="text-xs font-bold text-red-800 dark:text-red-300 uppercase">Sick Leave</p>
                    <p className="text-xl font-bold text-red-900 dark:text-red-100 mt-1">
                      {stats.sickDays} <span className="text-xs font-normal opacity-70">days</span>
                    </p>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100 dark:border-blue-900/40">
                    <p className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase">Business Trip</p>
                    <p className="text-xl font-bold text-blue-900 dark:text-blue-100 mt-1">
                      {stats.businessDays} <span className="text-xs font-normal opacity-70">days</span>
                    </p>
                  </div>
                  <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">
                    <p className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase">Day Off</p>
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
        actions={
          <>
            <button
              onClick={handleDelete}
              className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-red-200"
            >
              <Trash2 size={18} />
            </button>
            <button
              onClick={handleSave}
              className="flex-1 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-semibold py-2 hover:opacity-90 transition-opacity"
            >
              Save
            </button>
          </>
        }
      >
        {selectedCell && (
          <div>
            <p className="text-xs text-zinc-500 mb-4 font-medium">{selectedCell.member.name}</p>

            <div className="space-y-4">
              {selectedCell.type === 'shift-based' && (
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
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block text-zinc-500">From</label>
                  <SimpleDatePicker value={rangeStartDate} onChange={setRangeStartDate} placeholder="Select Date" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block text-zinc-500">To</label>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block text-zinc-500">Start Time</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none focus:ring-1 focus:ring-zinc-400 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block text-zinc-500">End Time</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none focus:ring-1 focus:ring-zinc-400 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Schedule;
