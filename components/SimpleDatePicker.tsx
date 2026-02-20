import React, { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface SimpleDatePickerProps {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  className?: string;
  renderTrigger?: (onClick: () => void, value: string, placeholder: string) => React.ReactNode;
}

export const SimpleDatePicker: React.FC<SimpleDatePickerProps> = ({
  value,
  onChange,
  placeholder,
  className,
  renderTrigger,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  // Initialize currentMonth from value if present, otherwise today
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (value && !isNaN(Date.parse(value))) {
      return new Date(value + 'T00:00:00'); // Ensure local time parsing
    }
    return new Date();
  });

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

  const handleDateClick = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const handleMonthChange = (offset: number) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + offset);
    setCurrentMonth(newMonth);
  };

  const daysInMonth = getDaysInMonth(currentMonth.getFullYear(), currentMonth.getMonth());
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  // Check if a day is the selected day
  const isSelected = (day: number) => {
    if (!value) return false;
    const [y, m, d] = value.split('-').map(Number);
    return y === currentMonth.getFullYear() && m === currentMonth.getMonth() + 1 && d === day;
  };

  return (
    <div className={`relative ${className || ''}`}>
      {renderTrigger ? (
        renderTrigger(() => setIsOpen(!isOpen), value, placeholder)
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full text-left px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none focus:ring-1 focus:ring-zinc-400 text-zinc-900 dark:text-zinc-100 transition-colors flex items-center justify-between"
        >
          <span>{value || placeholder}</span>
          <Calendar size={14} className="text-zinc-400" />
        </button>
      )}

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setIsOpen(false)}></div>
          <div className="absolute top-full left-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-[120] p-3 w-64 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex justify-between items-center mb-2">
              <button
                onClick={() => handleMonthChange(-1)}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                {currentMonth.toLocaleString('en-US', { month: 'short', year: 'numeric' })}
              </span>
              <button
                onClick={() => handleMonthChange(1)}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
                <span key={d} className="text-[10px] text-zinc-400">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => handleDateClick(i + 1)}
                  className={`text-xs w-7 h-7 flex items-center justify-center rounded transition-colors ${isSelected(i + 1) ? 'bg-black text-white dark:bg-white dark:text-black font-bold' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
