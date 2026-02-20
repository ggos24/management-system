import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Check } from 'lucide-react';

type PresetKey =
  | 'all'
  | 'today'
  | 'this_week'
  | 'last_7'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_30'
  | 'last_90';

interface Preset {
  key: PresetKey;
  label: string;
  getRange: () => [string, string];
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function buildPresets(): Preset[] {
  return [
    {
      key: 'all',
      label: 'All Time',
      getRange: () => ['', ''],
    },
    {
      key: 'today',
      label: 'Today',
      getRange: () => {
        const t = fmt(new Date());
        return [t, t];
      },
    },
    {
      key: 'this_week',
      label: 'This Week',
      getRange: () => {
        const now = new Date();
        const mon = startOfWeek(now);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        return [fmt(mon), fmt(sun)];
      },
    },
    {
      key: 'last_7',
      label: 'Last 7 Days',
      getRange: () => {
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - 6);
        return [fmt(start), fmt(now)];
      },
    },
    {
      key: 'this_month',
      label: 'This Month',
      getRange: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return [fmt(start), fmt(end)];
      },
    },
    {
      key: 'last_month',
      label: 'Last Month',
      getRange: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        return [fmt(start), fmt(end)];
      },
    },
    {
      key: 'this_quarter',
      label: 'This Quarter',
      getRange: () => {
        const now = new Date();
        const qStart = Math.floor(now.getMonth() / 3) * 3;
        const start = new Date(now.getFullYear(), qStart, 1);
        const end = new Date(now.getFullYear(), qStart + 3, 0);
        return [fmt(start), fmt(end)];
      },
    },
    {
      key: 'last_30',
      label: 'Last 30 Days',
      getRange: () => {
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - 29);
        return [fmt(start), fmt(now)];
      },
    },
    {
      key: 'last_90',
      label: 'Last 90 Days',
      getRange: () => {
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - 89);
        return [fmt(start), fmt(now)];
      },
    },
  ];
}

// ---- Mini Calendar ----
const MiniCalendar: React.FC<{
  value: string;
  onChange: (val: string) => void;
  label: string;
}> = ({ value, onChange, label }) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (value && !isNaN(Date.parse(value))) return new Date(value + 'T00:00:00');
    return new Date();
  });

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const isSelected = (day: number) => {
    if (!value) return false;
    const [y, m, d] = value.split('-').map(Number);
    return y === currentMonth.getFullYear() && m === currentMonth.getMonth() + 1 && d === day;
  };

  const handleClick = (day: number) => {
    onChange(fmt(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)));
  };

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">{label}</p>
      <div className="flex justify-between items-center mb-1.5">
        <button
          onClick={() => {
            const m = new Date(currentMonth);
            m.setMonth(m.getMonth() - 1);
            setCurrentMonth(m);
          }}
          className="p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-500"
        >
          <ChevronLeft size={12} />
        </button>
        <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
          {currentMonth.toLocaleString('en-US', { month: 'short', year: 'numeric' })}
        </span>
        <button
          onClick={() => {
            const m = new Date(currentMonth);
            m.setMonth(m.getMonth() + 1);
            setCurrentMonth(m);
          }}
          className="p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-500"
        >
          <ChevronRight size={12} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center mb-0.5">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-[9px] text-zinc-400 font-medium">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDay === 0 ? 6 : firstDay - 1 }).map((_, i) => (
          <div key={`e-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => (
          <button
            key={i}
            onClick={() => handleClick(i + 1)}
            className={`text-[11px] w-6 h-6 flex items-center justify-center rounded transition-colors ${
              isSelected(i + 1)
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold'
                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
};

// ---- Main Component ----
type TabKey = 'presets' | 'custom';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ startDate, endDate, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetKey | 'custom'>('all');
  const [activeTab, setActiveTab] = useState<TabKey>('presets');
  const ref = useRef<HTMLDivElement>(null);

  const presets = useMemo(() => buildPresets(), []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePreset = (preset: Preset) => {
    const [s, e] = preset.getRange();
    setActivePreset(preset.key);
    onChange(s, e);
    setIsOpen(false);
  };

  const handleCustomApply = () => {
    setActivePreset('custom');
    setIsOpen(false);
  };

  const displayLabel = useMemo(() => {
    if (activePreset === 'custom' && startDate && endDate) {
      const fmtShort = (d: string) => {
        const date = new Date(d + 'T00:00:00');
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };
      return `${fmtShort(startDate)} – ${fmtShort(endDate)}`;
    }
    return presets.find((p) => p.key === activePreset)?.label || 'All Time';
  }, [activePreset, startDate, endDate, presets]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg min-h-[32px] px-2.5 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-sm text-zinc-900 dark:text-zinc-100"
      >
        <Calendar size={14} className="text-zinc-500" />
        <span>{displayLabel}</span>
        <ChevronDown size={12} className="text-zinc-400 ml-0.5" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-[120] animate-in fade-in zoom-in-95 duration-100 overflow-hidden w-[240px]">
            {/* Tabs */}
            <div className="flex border-b border-zinc-100 dark:border-zinc-800">
              {(['presets', 'custom'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 text-xs font-semibold py-2.5 transition-colors relative ${
                    activeTab === tab
                      ? 'text-zinc-900 dark:text-white'
                      : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                  }`}
                >
                  {tab === 'presets' ? 'Presets' : 'Custom Range'}
                  {activeTab === tab && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-zinc-900 dark:bg-white rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Presets tab */}
            {activeTab === 'presets' && (
              <div className="py-1">
                {presets.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => handlePreset(p)}
                    className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${
                      activePreset === p.key
                        ? 'bg-zinc-50 dark:bg-zinc-800 font-semibold text-zinc-900 dark:text-white'
                        : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <span>{p.label}</span>
                    {activePreset === p.key && (
                      <Check size={12} className="text-zinc-900 dark:text-white flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Custom Range tab */}
            {activeTab === 'custom' && (
              <div className="p-3 space-y-3">
                <MiniCalendar
                  key={`start-${startDate}`}
                  label="Start Date"
                  value={startDate}
                  onChange={(s) => onChange(s, endDate || s)}
                />
                <div className="border-t border-zinc-100 dark:border-zinc-800" />
                <MiniCalendar
                  key={`end-${endDate}`}
                  label="End Date"
                  value={endDate}
                  onChange={(e) => onChange(startDate || e, e)}
                />
                {startDate && endDate && (
                  <button
                    onClick={handleCustomApply}
                    className="w-full text-center text-xs font-semibold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-md py-2 hover:opacity-90 transition-opacity"
                  >
                    Apply
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
