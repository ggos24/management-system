import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateEU, mondayIndex, WEEKDAYS_MON_INITIALS } from '../lib/utils';
import { useViewportPortalPosition } from '../hooks/useViewportPortalPosition';
import { IconButton } from './ui/Button';

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
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownPos = useViewportPortalPosition({
    isOpen,
    triggerRef,
    fixedWidth: 288,
    gap: 8,
    estimatedHeight: 320,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isOpen) return;
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

  const handleDateClick = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setIsOpen(false);
  };

  const handleMonthChange = (offset: number) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + offset);
    setCurrentMonth(newMonth);
  };

  const daysInMonth = getDaysInMonth(currentMonth.getFullYear(), currentMonth.getMonth());
  const firstDay = mondayIndex(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1));

  // Check if a day is the selected day
  const isSelected = (day: number) => {
    if (!value) return false;
    const [y, m, d] = value.split('-').map(Number);
    return y === currentMonth.getFullYear() && m === currentMonth.getMonth() + 1 && d === day;
  };

  const toggle = () => setIsOpen((v) => !v);

  return (
    <div className={`relative ${className || ''}`} ref={triggerRef}>
      {renderTrigger ? (
        renderTrigger(() => setIsOpen((v) => !v), value, placeholder)
      ) : (
        <button
          onClick={toggle}
          className="w-full text-left px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none focus:ring-1 focus:ring-zinc-400 text-zinc-900 dark:text-zinc-100 transition-colors flex items-center justify-between"
        >
          <span>{value ? formatDateEU(value) : placeholder}</span>
          <Calendar size={14} className="text-zinc-400" />
        </button>
      )}

      {isOpen &&
        dropdownPos &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              maxHeight: dropdownPos.maxHeight,
              transform: dropdownPos.flipUp ? 'translateY(-100%)' : undefined,
            }}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-[10000] p-3 overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="flex justify-between items-center mb-2">
              <IconButton size="sm" onClick={() => handleMonthChange(-1)} aria-label="Previous month">
                <ChevronLeft size={16} />
              </IconButton>
              <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                {currentMonth.toLocaleString('en-US', { month: 'short', year: 'numeric' })}
              </span>
              <IconButton size="sm" onClick={() => handleMonthChange(1)} aria-label="Next month">
                <ChevronRight size={16} />
              </IconButton>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {WEEKDAYS_MON_INITIALS.map((d, i) => (
                <span key={i} className="text-[11px] md:text-[10px] text-zinc-400">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 justify-items-center">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const today = new Date();
                const isToday =
                  day === today.getDate() &&
                  currentMonth.getMonth() === today.getMonth() &&
                  currentMonth.getFullYear() === today.getFullYear();
                return (
                  <button
                    key={i}
                    onClick={() => handleDateClick(day)}
                    className={`text-sm md:text-xs w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded transition-colors ${isSelected(day) ? 'bg-black text-white dark:bg-white dark:text-black font-bold' : isToday ? 'ring-1 ring-blue-500 text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/30' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            {value && (
              <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleClear}
                  className="w-full text-xs text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded py-1.5 transition-colors"
                >
                  Clear date
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};
