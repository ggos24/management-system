import React, { useMemo, useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Task, Member, Absence, Team } from '../types';
import { Briefcase, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { CustomSelect } from './CustomSelect';
import { DateRangeFilter } from './DateRangeFilter';
import { Avatar } from './Avatar';
import { Card } from './ui';
import { getStatusHexColor } from '../constants';
import { formatDateRangeEU } from '../lib/utils';

interface DashboardProps {
  tasks: Task[];
  members: Member[];
  absences: Absence[];
  teams: Team[];
  statusCategories: Record<string, Record<string, string>>;
}

const ALL_TEAMS = '__all__';

// Shared tooltip style — dark-mode aware
const tooltipStyle = {
  backgroundColor: 'var(--color-tooltip-bg, #fff)',
  borderRadius: '8px',
  border: '1px solid var(--color-tooltip-border, #e4e4e7)',
  color: 'var(--color-tooltip-text, #18181b)',
  fontSize: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,.08)',
};

const TrendBadge: React.FC<{ value: number | null; invertColor?: boolean; suffix?: string }> = ({
  value,
  invertColor = false,
  suffix = '%',
}) => {
  if (value === null || value === undefined || !isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-zinc-400 mt-1">
        <Minus size={10} />0{suffix}
      </span>
    );
  const isPositive = rounded > 0;
  const isGood = invertColor ? !isPositive : isPositive;
  const colorClass = isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  const Icon = isPositive ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium mt-1 ${colorClass}`}>
      <Icon size={10} />
      {isPositive ? '+' : ''}
      {rounded}
      {suffix}
    </span>
  );
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Dashboard: React.FC<DashboardProps> = ({ tasks, members, absences, teams, statusCategories }) => {
  const [teamFilter, setTeamFilter] = useState<string>(ALL_TEAMS);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const visibleTeams = useMemo(() => teams.filter((t) => !t.hidden && !t.adminOnly && t.id !== 'management'), [teams]);

  useEffect(() => {
    if (teamFilter !== ALL_TEAMS) {
      const found = visibleTeams.find((t) => t.id === teamFilter);
      if (!found && visibleTeams.length > 0) {
        setTeamFilter(ALL_TEAMS);
      }
    }
  }, [teams, teamFilter, visibleTeams]);

  const getStatusCategory = (status: string, teamId: string): 'active' | 'completed' | 'ignored' => {
    // Use per-team category from DB if available
    const teamCats = statusCategories[teamId];
    if (teamCats && teamCats[status]) {
      return teamCats[status] as 'active' | 'completed' | 'ignored';
    }

    // Fallback for statuses without an explicit category
    const s = status.toLowerCase().trim();
    if (['dropped', 'archive'].includes(s)) return 'ignored';
    if (['published', 'done', 'published this week'].includes(s)) return 'completed';
    return 'active';
  };

  const visibleTeamIds = useMemo(() => new Set(visibleTeams.map((t) => t.id)), [visibleTeams]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (teamFilter === ALL_TEAMS) {
        if (!visibleTeamIds.has(task.teamId)) return false;
      } else {
        if (task.teamId !== teamFilter) return false;
      }

      if (startDate && endDate) {
        const taskDate = new Date(task.dueDate);
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (taskDate < start || taskDate > end) return false;
      }

      return true;
    });
  }, [tasks, teamFilter, visibleTeamIds, startDate, endDate]);

  const chartTasks = useMemo(() => {
    return filteredTasks.filter((t) => getStatusCategory(t.status, t.teamId) !== 'ignored');
  }, [filteredTasks]);

  const previousPeriodTasks = useMemo(() => {
    let prevStart: Date;
    let prevEnd: Date;

    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      const rangeMs = e.getTime() - s.getTime();
      prevEnd = new Date(s.getTime() - 1);
      prevStart = new Date(prevEnd.getTime() - rangeMs);
    } else {
      const now = new Date();
      prevEnd = new Date(now);
      prevEnd.setDate(prevEnd.getDate() - 30);
      prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - 30);
    }

    return tasks.filter((task) => {
      if (teamFilter === ALL_TEAMS) {
        if (!visibleTeamIds.has(task.teamId)) return false;
      } else {
        if (task.teamId !== teamFilter) return false;
      }
      const taskDate = new Date(task.dueDate);
      if (taskDate < prevStart || taskDate > prevEnd) return false;
      return getStatusCategory(task.status, task.teamId) !== 'ignored';
    });
  }, [tasks, teamFilter, visibleTeamIds, startDate, endDate]);

  const metrics = useMemo(() => {
    const now = new Date();

    let active = 0;
    let completed = 0;
    let overdue = 0;
    let totalOverdueDays = 0;

    chartTasks.forEach((t) => {
      const category = getStatusCategory(t.status, t.teamId);

      if (category === 'completed') {
        completed++;
      } else if (category === 'active') {
        active++;
        const due = new Date(t.dueDate);
        if (!isNaN(due.getTime()) && due < now) {
          overdue++;
          totalOverdueDays += Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        }
      }
    });

    const onTimeRate = completed + overdue > 0 ? Math.round((completed / (completed + overdue)) * 100) : null;
    const avgOverdueDays = overdue > 0 ? Math.round(totalOverdueDays / overdue) : 0;

    let prevActive = 0;
    let prevCompleted = 0;
    let prevOverdue = 0;
    const prevNow = new Date();

    previousPeriodTasks.forEach((t) => {
      const category = getStatusCategory(t.status, t.teamId);
      if (category === 'completed') {
        prevCompleted++;
      } else if (category === 'active') {
        prevActive++;
        const due = new Date(t.dueDate);
        if (!isNaN(due.getTime()) && due < prevNow) {
          prevOverdue++;
        }
      }
    });

    const prevOnTimeRate =
      prevCompleted + prevOverdue > 0 ? Math.round((prevCompleted / (prevCompleted + prevOverdue)) * 100) : null;

    const pctChange = (curr: number, prev: number): number | null => {
      if (prev === 0) return curr > 0 ? 100 : null;
      return ((curr - prev) / prev) * 100;
    };

    const trends = {
      active: pctChange(active, prevActive),
      completed: pctChange(completed, prevCompleted),
      overdue: pctChange(overdue, prevOverdue),
      onTimeRate: onTimeRate !== null && prevOnTimeRate !== null ? onTimeRate - prevOnTimeRate : null,
    };

    return { active, completed, overdue, onTimeRate, avgOverdueDays, trends };
  }, [chartTasks, previousPeriodTasks]);

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

  const totalTasks = useMemo(() => pieData.reduce((sum, d) => sum + d.value, 0), [pieData]);

  const workloadData = useMemo(() => {
    const teamMembers =
      teamFilter === ALL_TEAMS
        ? members.filter((m) => visibleTeamIds.has(m.teamId))
        : members.filter((m) => m.teamId === teamFilter);
    const now = new Date();

    return teamMembers
      .map((member) => {
        const memberTasks = chartTasks.filter((t) => t.assigneeIds[0] === member.id);

        const statusCounts: Record<string, number> = {};
        let overdueCount = 0;

        memberTasks.forEach((t) => {
          statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
          const due = new Date(t.dueDate);
          if (getStatusCategory(t.status, t.teamId) === 'active' && !isNaN(due.getTime()) && due < now) {
            overdueCount++;
          }
        });
        return { member, total: memberTasks.length, statusCounts, overdueCount };
      })
      .sort((a, b) => b.total - a.total);
  }, [members, chartTasks, teamFilter, visibleTeamIds]);

  const maxWorkload = useMemo(() => Math.max(1, ...workloadData.map((w) => w.total)), [workloadData]);

  const doneTasks = useMemo(() => {
    return filteredTasks.filter((t) => t.doneDate);
  }, [filteredTasks]);

  const progressData = useMemo(() => {
    let rangeStart: Date;
    let rangeEnd: Date;

    if (startDate && endDate) {
      rangeStart = new Date(startDate + 'T00:00:00');
      rangeEnd = new Date(endDate + 'T00:00:00');
    } else {
      // "All Time" — derive range from actual done dates
      if (doneTasks.length === 0) return [];
      const dates = doneTasks.map((t) => t.doneDate!).sort();
      rangeStart = new Date(dates[0] + 'T00:00:00');
      rangeEnd = new Date(dates[dates.length - 1] + 'T00:00:00');
    }

    const diffDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // For large ranges, aggregate by month instead of by day
    if (diffDays > 90) {
      const months: Record<string, number> = {};
      doneTasks.forEach((t) => {
        const d = new Date(t.doneDate + 'T00:00:00');
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months[key] = (months[key] || 0) + 1;
      });
      return Object.keys(months)
        .sort()
        .map((key) => {
          const [y, m] = key.split('-').map(Number);
          return {
            name: `${String(m).padStart(2, '0')}/${String(y).slice(-2)}`,
            done: months[key],
          };
        });
    }

    const days: { name: string; done: number }[] = [];
    for (let i = 0; i < diffDays; i++) {
      const d = new Date(rangeStart);
      d.setDate(rangeStart.getDate() + i);
      const dayStr = d.toISOString().split('T')[0];
      days.push({
        name: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        done: doneTasks.filter((t) => t.doneDate === dayStr).length,
      });
    }
    return days;
  }, [doneTasks, startDate, endDate]);

  const teamLabel = teamFilter === ALL_TEAMS ? 'All Teams' : teams.find((t) => t.id === teamFilter)?.name;

  return (
    <div className="p-3 md:p-6 space-y-6 animate-fade-in bg-white dark:bg-black h-full overflow-y-auto custom-scrollbar font-sans">
      {/* CSS custom properties for dark-mode-aware tooltip */}
      <style>{`
        :root {
          --color-tooltip-bg: #fff; --color-tooltip-border: #e4e4e7; --color-tooltip-text: #18181b;
          --color-chart-text: #71717a; --color-chart-grid: #e4e4e7; --color-chart-label: #3f3f46;
        }
        .dark {
          --color-tooltip-bg: #18181b; --color-tooltip-border: #3f3f46; --color-tooltip-text: #fafafa;
          --color-chart-text: #a1a1aa; --color-chart-grid: #3f3f46; --color-chart-label: #e4e4e7;
        }
      `}</style>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Overview for <span className="font-semibold text-zinc-900 dark:text-zinc-300">{teamLabel}</span>
          </p>
        </div>
        <div className="w-full md:w-auto flex flex-col sm:flex-row flex-wrap gap-2 md:gap-3 md:items-center">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            defaultPreset="this_month"
            onChange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />
          <CustomSelect
            icon={Briefcase}
            options={[
              { value: ALL_TEAMS, label: 'All Teams' },
              ...visibleTeams.map((t) => ({ value: t.id, label: t.name })),
            ]}
            value={teamFilter}
            onChange={setTeamFilter}
            className="w-full sm:w-[220px]"
          />
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <Card
          padding="lg"
          className="flex flex-col items-center justify-center text-center h-auto min-h-28 md:h-36 p-4 md:p-6"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-zinc-900 dark:text-white mb-1">{metrics.active}</h2>
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-zinc-500">Active Tasks</p>
          <TrendBadge value={metrics.trends.active} />
        </Card>

        <Card
          padding="lg"
          className="flex flex-col items-center justify-center text-center h-auto min-h-28 md:h-36 p-4 md:p-6"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-zinc-900 dark:text-white mb-1">{metrics.completed}</h2>
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-zinc-500">Completed</p>
          <TrendBadge value={metrics.trends.completed} />
        </Card>

        <Card
          padding="lg"
          className="flex flex-col items-center justify-center text-center h-auto min-h-28 md:h-36 p-4 md:p-6"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-red-600 dark:text-red-400 mb-1">{metrics.overdue}</h2>
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-zinc-500">Overdue</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap justify-center">
            <TrendBadge value={metrics.trends.overdue} invertColor />
            {metrics.avgOverdueDays > 0 && (
              <span className="text-[10px] text-zinc-400">avg {metrics.avgOverdueDays}d</span>
            )}
          </div>
        </Card>

        <Card
          padding="lg"
          className="flex flex-col items-center justify-center text-center h-auto min-h-28 md:h-36 p-4 md:p-6"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-zinc-900 dark:text-white mb-1">
            {metrics.onTimeRate !== null ? `${metrics.onTimeRate}%` : '\u2014'}
          </h2>
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-zinc-500">On-Time Rate</p>
          <TrendBadge value={metrics.trends.onTimeRate} suffix="pp" />
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut chart */}
        <Card padding="lg" className="h-auto md:h-[400px] flex flex-col">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 md:mb-6">Task Statuses</h3>
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden gap-4 md:gap-0">
            <div className="w-full md:w-1/2 md:pr-4 overflow-y-auto custom-scrollbar space-y-1 order-2 md:order-1">
              {pieData.map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getStatusHexColor(entry.name) }}
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{entry.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white tabular-nums">
                    {entry.value}
                  </span>
                </div>
              ))}
              {pieData.length === 0 && <p className="text-sm text-zinc-400 italic px-2">No tasks found.</p>}
            </div>
            <div className="w-full md:w-1/2 h-64 md:h-full order-1 md:order-2">
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
                    {pieData.map((entry) => (
                      <Cell key={`cell-${entry.name}`} fill={getStatusHexColor(entry.name)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: 'inherit', fontSize: '12px', fontWeight: 600 }}
                  />
                  {/* Center total */}
                  <text
                    x="50%"
                    y="46%"
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ fontSize: '24px', fontWeight: 700, fill: 'var(--color-chart-label)' }}
                  >
                    {totalTasks}
                  </text>
                  <text
                    x="50%"
                    y="57%"
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ fontSize: '11px', fontWeight: 500, fill: 'var(--color-chart-text)' }}
                  >
                    Tasks
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        {/* Workload */}
        <Card padding="lg" className="h-[400px] flex flex-col">
          <div className="flex justify-between items-baseline mb-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Team Workload</h3>
            <span className="text-xs text-zinc-400">Primary owner</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
            {workloadData.map(({ member, total, statusCounts, overdueCount }) => (
              <div
                key={member.id}
                className={`flex items-start gap-3 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors`}
              >
                <Avatar src={member.avatar} alt={member.name} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1.5">
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{member.name}</h4>
                    <div className="flex gap-1.5 flex-shrink-0">
                      {overdueCount > 0 && (
                        <span className="text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-1.5 py-0.5 rounded-full">
                          {overdueCount} overdue
                        </span>
                      )}
                      <span className="text-[10px] font-semibold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 px-1.5 py-0.5 rounded-full tabular-nums">
                        {total}
                      </span>
                    </div>
                  </div>
                  {/* Stacked bar */}
                  {total > 0 && (
                    <div
                      className="flex h-1.5 rounded-full overflow-hidden mb-2"
                      style={{ width: `${(total / maxWorkload) * 100}%` }}
                    >
                      {Object.entries(statusCounts).map(([status, count]) => (
                        <div
                          key={status}
                          style={{
                            width: `${(count / total) * 100}%`,
                            minWidth: '2px',
                            backgroundColor: getStatusHexColor(status),
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(statusCounts).map(([status, count]) => (
                      <div
                        key={status}
                        className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-800/50 px-1.5 py-0.5 rounded text-[10px] text-zinc-600 dark:text-zinc-400"
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getStatusHexColor(status) }}
                        />
                        {status}: {count}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {workloadData.length === 0 && (
              <div className="text-center text-zinc-400 py-10 text-sm">No team members assigned tasks.</div>
            )}
          </div>
        </Card>
      </div>

      {/* Completed tasks chart */}
      <Card padding="lg" className="h-[400px] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Tasks Completed</h3>
          <span className="bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-md text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            {startDate && endDate ? formatDateRangeEU(startDate, endDate) : 'All Time'}
          </span>
        </div>
        <div className="flex-1 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={progressData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="completedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-chart-grid)" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'var(--color-chart-text)' }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'var(--color-chart-text)' }}
                allowDecimals={false}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="done"
                name="Completed"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#completedGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;
