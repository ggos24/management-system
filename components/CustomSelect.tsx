import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Plus } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: React.ReactNode;
}

interface CustomSelectProps {
  icon?: React.ElementType;
  label?: string;
  options: (string | SelectOption)[];
  value: string;
  onChange: (value: string) => void;
  onAdd?: (newValue: string) => void;
  placeholder?: string;
  className?: string;
  renderValue?: (value: string) => React.ReactNode;
  compact?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  icon: Icon,
  label,
  options,
  value,
  onChange,
  onAdd,
  placeholder = 'Select...',
  className,
  renderValue,
  compact,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newItem, setNewItem] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalizeOption = (opt: string | SelectOption): SelectOption => {
    if (typeof opt === 'string') return { value: opt, label: opt };
    return opt;
  };

  const selectedOption = options.map(normalizeOption).find((o) => o.value === value);

  return (
    <div className={`relative space-y-1 ${className || ''}`} ref={dropdownRef}>
      {label && (
        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
          {Icon && <Icon size={12} />} {label}
        </label>
      )}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={
          compact
            ? 'w-full min-h-[24px] px-1.5 py-0.5 rounded cursor-pointer flex items-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 relative text-sm'
            : 'w-full min-h-[32px] pl-2 pr-8 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm cursor-pointer flex items-center transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 relative'
        }
      >
        <span className={`truncate ${value ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'}`}>
          {renderValue ? renderValue(value) : selectedOption?.label || value || placeholder}
        </span>
        {!compact && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
            <ChevronDown size={14} />
          </div>
        )}
      </div>
      {isOpen && (
        <div className="absolute top-full left-0 w-full min-w-[150px] mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-[60] max-h-60 overflow-y-auto p-1 animate-in fade-in zoom-in-95 duration-100">
          {options.map((rawOpt) => {
            const opt = normalizeOption(rawOpt);
            return (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`px-2 py-1.5 rounded text-sm cursor-pointer flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-zinc-700 ${value === opt.value ? 'bg-zinc-50 dark:bg-zinc-700/50 font-semibold' : ''}`}
              >
                <span className="truncate">{opt.label}</span>
                {value === opt.value && <Check size={14} className="text-black dark:text-white flex-shrink-0" />}
              </div>
            );
          })}
          {onAdd && (
            <div className="border-t border-zinc-100 dark:border-zinc-700 mt-1 pt-1 p-1 flex gap-1">
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-xs outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
                placeholder="Add new..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItem) {
                    onAdd(newItem);
                    setNewItem('');
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (newItem) {
                    onAdd(newItem);
                    setNewItem('');
                  }
                }}
                className="p-1 bg-black dark:bg-white text-white dark:text-black rounded hover:opacity-90"
              >
                <Plus size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
