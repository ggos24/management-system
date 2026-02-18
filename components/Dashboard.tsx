import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Task, Member, Absence, Team } from '../types';
import {
  ChevronDown,
  Calendar as CalendarIcon,
  X,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Briefcase,
} from 'lucide-react';
import { SimpleDatePicker } from './SimpleDatePicker';
import { CustomSelect } from './CustomSelect';
import { Avatar } from './Avatar';

interface DashboardProps {
  tasks: Task[];
  members: Member[];
  absences: Absence[];
  teams: Team[];
}

// Monochrome Grey Shades Palette
const MONOCHROME_PALETTE = {
  shade1: '#3f3f46', // Zinc 700
  shade2: '#71717a', // Zinc 500
  shade3: '#a1a1aa', // Zinc 400
  shade4: '#d4d4d8', // Zinc 300
  shade5: '#e4e4e7', // Zinc 200
};

const getColorForStatusIndex = (index: number) => {
  const colors = [
    MONOCHROME_PALETTE.shade1,
    MONOCHROME_PALETTE.shade3,
    MONOCHROME_PALETTE.shade2,
    MONOCHROME_PALETTE.shade4,
    MONOCHROME_PALETTE.shade5,
  ];
  return colors[index % colors.length];
};

const Dashboard: React.FC<DashboardProps> = ({ tasks, members, absences, teams }) => {
  const [teamFilter, setTeamFilter] = useState<string>(teams[0]?.id || '');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    const visibleTeams = teams.filter((t) => !t.hidden && t.id !== 'management');
    if (
      visibleTeams.length > 0 &&
      (!teamFilter || teamFilter === 'management' || teams.find((t) => t.id === teamFilter)?.hidden)
    ) {
      setTeamFilter(visibleTeams[0].id);
    }
  }, [teams]);

  // Status Classification Logic
  const getStatusCategory = (status: string, teamId: string): 'active' | 'completed' | 'ignored' => {
    const s = status.toLowerCase().trim();

    if (teamId === 'editorial') {
      if (['dropped', 'archive', 'stuck'].includes(s)) return 'ignored';
      if (['published this week', 'published'].includes(s)) return 'completed';
      return 'active';
    }

    // Default / Other Teams
    if (['published', 'done', 'published this week'].includes(s)) return 'completed';
    if (['dropped', 'archive'].includes(s)) return 'ignored';

    return 'active';
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (task.teamId !== teamFilter) return false;

      let matchDate = true;
      if (startDate && endDate) {
        const taskDate = new Date(task.dueDate);
        const start = new Date(startDate);
        const end = new Date(endDate);
        matchDate = taskDate >= start && taskDate <= end;
      }

      return matchDate;
    });
  }, [tasks, teamFilter, startDate, endDate]);

  // Filter out ignored statuses for charts and metrics
  const chartTasks = useMemo(() => {
    return filteredTasks.filter((t) => getStatusCategory(t.status, teamFilter) !== 'ignored');
  }, [filteredTasks, teamFilter]);

  const metrics = useMemo(() => {
    const now = new Date();

    let active = 0;
    let completed = 0;
    let overdue = 0;

    chartTasks.forEach((t) => {
      const category = getStatusCategory(t.status, teamFilter);

      if (category === 'completed') {
        completed++;
      } else if (category === 'active') {
        active++;
        const due = new Date(t.dueDate);
        // Check if due date is valid and strictly past now
        if (!isNaN(due.getTime()) && due < now) {
          overdue++;
        }
      }
    });

    return { active, completed, overdue };
  }, [chartTasks, teamFilter]);

  const pieData = useMemo(() => {
    const counts: Record<string, number> = {};
    chartTasks.forEach((t) => {
      counts[t.status] = (counts[t.status] || 0) + 1;
    });
    return Object.keys(counts)
      .map((status) => ({
        name: status,
        value: counts[status],
      }))
      .sort((a, b) => b.value - a.value);
  }, [chartTasks]);

  const workloadData = useMemo(() => {
    const teamMembers = members.filter((m) => m.teamId === teamFilter);
    const now = new Date();

    return teamMembers
      .map((member) => {
        // IMPORTANT: To ensure the sum of workload equals total tasks, we only count the PRIMARY assignee (index 0).
        // If we counted all assignee inclusions, the total would exceed the actual task count.
        const memberTasks = chartTasks.filter((t) => t.assigneeIds[0] === member.id);

        const statusCounts: Record<string, number> = {};
        let overdueCount = 0;

        memberTasks.forEach((t) => {
          statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
          const due = new Date(t.dueDate);
          if (getStatusCategory(t.status, teamFilter) === 'active' && !isNaN(due.getTime()) && due < now) {
            overdueCount++;
          }
        });
        return { member, total: memberTasks.length, statusCounts, overdueCount };
      })
      .sort((a, b) => b.total - a.total);
  }, [members, chartTasks, teamFilter]);

  const progressData = useMemo(() => {
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push(d);
    }

    const allStatuses: string[] = Array.from(new Set(chartTasks.map((t) => t.status)));

    return days.map((day) => {
      const dayStr = day.toISOString().split('T')[0];
      const dayLabel = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const tasksDueToday = chartTasks.filter((t) => t.dueDate.startsWith(dayStr));
      const entry: Record<string, any> = { name: dayLabel };
      allStatuses.forEach((status: string) => {
        entry[status] = tasksDueToday.filter((t) => t.status === status).length;
      });
      return entry;
    });
  }, [chartTasks]);

  const cardClass =
    'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white p-6 rounded-lg shadow-sm flex flex-col items-center justify-center text-center h-32 border border-zinc-200 dark:border-zinc-800';

  return (
    <div className="p-8 space-y-8 animate-fade-in bg-white dark:bg-black h-full overflow-y-auto custom-scrollbar font-sans">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Overview for{' '}
            <span className="font-semibold text-zinc-900 dark:text-zinc-300">
              {teams.find((t) => t.id === teamFilter)?.name}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg min-h-[32px] px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            <CalendarIcon size={14} className="text-zinc-500" />
            <SimpleDatePicker
              value={startDate}
              onChange={setStartDate}
              placeholder="Start Date"
              renderTrigger={(onClick, value, placeholder) => (
                <button
                  onClick={onClick}
                  className="text-sm text-zinc-900 dark:text-zinc-100 px-1 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none"
                >
                  {value || placeholder}
                </button>
              )}
            />
            <ArrowRight size={12} className="text-zinc-300" />
            <SimpleDatePicker
              value={endDate}
              onChange={setEndDate}
              placeholder="End Date"
              renderTrigger={(onClick, value, placeholder) => (
                <button
                  onClick={onClick}
                  className="text-sm text-zinc-900 dark:text-zinc-100 px-1 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none"
                >
                  {value || placeholder}
                </button>
              )}
            />
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="ml-2 p-0.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-red-500"
              >
                <X size={10} />
              </button>
            )}
          </div>
          <div className="w-[220px]">
            <CustomSelect
              icon={Briefcase}
              options={teams
                .filter((t) => t.id !== 'management' && !t.hidden)
                .map((t) => ({ value: t.id, label: t.name }))}
              value={teamFilter}
              onChange={setTeamFilter}
            />
          </div>
        </div>
      </header>

      {/* Monochrome Metrics Cards - Unified Design */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Active Tasks */}
        <div className={cardClass}>
          <h2 className="text-4xl font-bold mb-1">{metrics.active}</h2>
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Active Tasks</p>
        </div>

        {/* Completed Tasks */}
        <div className={cardClass}>
          <h2 className="text-4xl font-bold mb-1">{metrics.completed}</h2>
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Completed Tasks</p>
        </div>

        {/* Overdue Tasks */}
        <div className={cardClass}>
          <h2 className="text-4xl font-bold mb-1 text-red-600 dark:text-red-400">{metrics.overdue}</h2>
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Overdue Tasks</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 h-[400px] flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Task Statuses Overview</h3>
          </div>
          <div className="flex flex-1 overflow-hidden">
            <div className="w-1/2 pr-4 overflow-y-auto custom-scrollbar space-y-3">
              {pieData.map((entry, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full shadow-sm border border-zinc-200 dark:border-zinc-700"
                      style={{ backgroundColor: getColorForStatusIndex(index) }}
                    ></div>
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 capitalize">
                      {entry.name}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-zinc-900 dark:text-white">{entry.value}</span>
                </div>
              ))}
              {pieData.length === 0 && <p className="text-sm text-zinc-400 italic">No tasks found.</p>}
            </div>
            <div className="w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                    strokeWidth={0}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getColorForStatusIndex(index)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      borderRadius: '4px',
                      border: '1px solid #e4e4e7',
                      color: '#000',
                    }}
                    itemStyle={{ color: '#000', fontSize: '12px', fontWeight: 600 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 h-[400px] flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
              Team Workload <span className="text-xs font-normal text-zinc-500 ml-1">(Primary Owner)</span>
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
            {workloadData.map(({ member, total, statusCounts, overdueCount }) => (
              <div
                key={member.id}
                className="flex items-start gap-4 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
              >
                <Avatar src={member.avatar} alt={member.name} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">{member.name}</h4>
                    <div className="flex gap-2">
                      {overdueCount > 0 && (
                        <span className="text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full">
                          {overdueCount} Overdue
                        </span>
                      )}
                      <span className="text-xs font-bold bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white px-2 py-0.5 rounded-full">
                        {total} Tasks
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(statusCounts).map(([status, count], idx) => (
                      <div
                        key={status}
                        className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-900 px-2 py-1 rounded text-[10px] font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800"
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: getColorForStatusIndex(idx) }}
                        ></div>
                        <span className="capitalize">
                          {status}: {count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {workloadData.length === 0 && (
              <div className="text-center text-zinc-500 py-10">No team members assigned tasks.</div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 h-[400px] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Progress Chart</h3>
          <div className="bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded text-xs font-bold text-zinc-600 dark:text-zinc-300">
            Last 7 Days
          </div>
        </div>
        <div className="flex-1 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={progressData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#71717a' }}
                dy={10}
              />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                contentStyle={{
                  backgroundColor: '#fff',
                  borderRadius: '4px',
                  border: '1px solid #e4e4e7',
                  color: '#000',
                }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 'bold' }}
              />
              {progressData.length > 0 &&
                Object.keys(progressData[0])
                  .filter((key) => key !== 'name')
                  .map((key, index) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="a"
                      fill={getColorForStatusIndex(index)}
                      radius={[0, 0, 0, 0]}
                      barSize={40}
                    />
                  ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
