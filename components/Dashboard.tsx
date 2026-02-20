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
import { Briefcase, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { CustomSelect } from './CustomSelect';
import { DateRangeFilter } from './DateRangeFilter';
import { Avatar } from './Avatar';
import { Card } from './ui';
import { getStatusHexColor } from '../constants';

interface DashboardProps {
  tasks: Task[];
  members: Member[];
  absences: Absence[];
  teams: Team[];
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
const Dashboard: React.FC<DashboardProps> = ({ tasks, members, absences, teams }) => {
  const [teamFilter, setTeamFilter] = useState<string>(ALL_TEAMS);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const visibleTeams = useMemo(() => teams.filter((t) => !t.hidden && t.id !== 'management'), [teams]);

  useEffect(() => {
    if (teamFilter !== ALL_TEAMS) {
      const found = visibleTeams.find((t) => t.id === teamFilter);
      if (!found && visibleTeams.length > 0) {
        setTeamFilter(ALL_TEAMS);
      }
    }
  }, [teams, teamFilter, visibleTeams]);

  const getStatusCategory = (status: string, teamId: string): 'active' | 'completed' | 'ignored' => {
    const s = status.toLowerCase().trim();

    if (teamId === 'editorial') {
      if (['dropped', 'archive', 'stuck'].includes(s)) return 'ignored';
      if (['published this week', 'published'].includes(s)) return 'completed';
      return 'active';
    }

    if (['published', 'done', 'published this week'].includes(s)) return 'completed';
    if (['dropped', 'archive'].includes(s)) return 'ignored';

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
      const entry: Record<string, string | number> = { name: dayLabel };
      allStatuses.forEach((status: string) => {
        entry[status] = tasksDueToday.filter((t) => t.status === status).length;
      });
      return entry;
    });
  }, [chartTasks]);

  const teamLabel = teamFilter === ALL_TEAMS ? 'All Teams' : teams.find((t) => t.id === teamFilter)?.name;

  return (
    <div className="p-6 space-y-6 animate-fade-in bg-white dark:bg-black h-full overflow-y-auto custom-scrollbar font-sans">
      {/* CSS custom properties for dark-mode-aware tooltip */}
      <style>{`
        .dark { --color-tooltip-bg: #18181b; --color-tooltip-border: #3f3f46; --color-tooltip-text: #fafafa; }
        :root { --color-tooltip-bg: #fff; --color-tooltip-border: #e4e4e7; --color-tooltip-text: #18181b; }
      `}</style>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Overview for <span className="font-semibold text-zinc-900 dark:text-zinc-300">{teamLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onChange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />
          <div className="w-[220px]">
            <CustomSelect
              icon={Briefcase}
              options={[
                { value: ALL_TEAMS, label: 'All Teams' },
                ...visibleTeams.map((t) => ({ value: t.id, label: t.name })),
              ]}
              value={teamFilter}
              onChange={setTeamFilter}
            />
          </div>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card padding="lg" className="flex flex-col items-center justify-center text-center h-36">
          <h2 className="text-4xl font-bold text-zinc-900 dark:text-white mb-1">{metrics.active}</h2>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Active Tasks</p>
          <TrendBadge value={metrics.trends.active} />
        </Card>

        <Card padding="lg" className="flex flex-col items-center justify-center text-center h-36">
          <h2 className="text-4xl font-bold text-zinc-900 dark:text-white mb-1">{metrics.completed}</h2>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Completed</p>
          <TrendBadge value={metrics.trends.completed} />
        </Card>

        <Card padding="lg" className="flex flex-col items-center justify-center text-center h-36">
          <h2 className="text-4xl font-bold text-red-600 dark:text-red-400 mb-1">{metrics.overdue}</h2>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Overdue</p>
          <div className="flex items-center gap-2 mt-1">
            <TrendBadge value={metrics.trends.overdue} invertColor />
            {metrics.avgOverdueDays > 0 && (
              <span className="text-[10px] text-zinc-400">avg {metrics.avgOverdueDays}d</span>
            )}
          </div>
        </Card>

        <Card padding="lg" className="flex flex-col items-center justify-center text-center h-36">
          <h2 className="text-4xl font-bold text-zinc-900 dark:text-white mb-1">
            {metrics.onTimeRate !== null ? `${metrics.onTimeRate}%` : '\u2014'}
          </h2>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">On-Time Rate</p>
          <TrendBadge value={metrics.trends.onTimeRate} suffix="pp" />
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut chart */}
        <Card padding="lg" className="h-[400px] flex flex-col">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-6">Task Statuses</h3>
          <div className="flex flex-1 overflow-hidden">
            <div className="w-1/2 pr-4 overflow-y-auto custom-scrollbar space-y-1">
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
                    style={{ fontSize: '24px', fontWeight: 700, fill: '#3f3f46' }}
                    className="dark:[&]:fill-zinc-200"
                  >
                    {totalTasks}
                  </text>
                  <text
                    x="50%"
                    y="57%"
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ fontSize: '11px', fontWeight: 500, fill: '#a1a1aa' }}
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

      {/* Progress chart */}
      <Card padding="lg" className="h-[400px] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Progress Chart</h3>
          <span className="bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-md text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            Last 7 Days
          </span>
        </div>
        <div className="flex-1 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={progressData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="[&>line]:stroke-zinc-200 dark:[&>line]:stroke-zinc-800"
                stroke="#e4e4e7"
              />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#71717a' }}
                dy={10}
              />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'transparent' }} contentStyle={tooltipStyle} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 600 }}
              />
              {progressData.length > 0 &&
                Object.keys(progressData[0])
                  .filter((key) => key !== 'name')
                  .map((key) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="a"
                      fill={getStatusHexColor(key)}
                      radius={[0, 0, 0, 0]}
                      barSize={40}
                    />
                  ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;
