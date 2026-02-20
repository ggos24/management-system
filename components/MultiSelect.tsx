import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, X, Check, Plus } from 'lucide-react';

interface MultiSelectProps {
  icon: React.ElementType;
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  onAdd?: (newValue: string) => void;
  placeholder?: string;
  className?: string;
  compact?: boolean;
  renderTrigger?: (onClick: () => void, selected: string[]) => React.ReactNode;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
  icon: Icon,
  label,
  options,
  selected,
  onChange,
  onAdd,
  placeholder = 'Select...',
  className,
  compact,
  renderTrigger,
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

  const toggleSelection = (value: string) => {
    const newSelected = selected.includes(value) ? selected.filter((s) => s !== value) : [...selected, value];
    onChange(newSelected);
  };

  return (
    <div className={`relative space-y-1 ${className}`} ref={dropdownRef}>
      {label && (
        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
          <Icon size={12} /> {label}
        </label>
      )}
      {renderTrigger ? (
        renderTrigger(() => setIsOpen(!isOpen), selected)
      ) : (
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={
            compact
              ? 'w-full min-h-[24px] px-1.5 py-0.5 rounded text-xs cursor-pointer flex flex-wrap gap-1 items-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 relative'
              : 'w-full min-h-[32px] pl-2 pr-6 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs cursor-pointer flex flex-wrap gap-1 items-center transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 relative'
          }
        >
          {selected.length === 0 && <span className="text-zinc-400">{placeholder}</span>}
          {selected.map((val) => {
            const optionLabel = options.find((o) => o.value === val)?.label || val;
            return (
              <span
                key={val}
                className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 font-medium border border-zinc-200 dark:border-zinc-700"
              >
                {optionLabel}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(selected.filter((s) => s !== val));
                  }}
                  className="hover:text-red-500"
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}
          {!compact && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
              <ChevronDown size={12} />
            </div>
          )}
        </div>
      )}
      {isOpen && (
        <div className="absolute top-full left-0 w-full min-w-[150px] mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto p-1 animate-in fade-in zoom-in-95 duration-100">
          {options.map((opt) => (
            <div
              key={opt.value}
              onClick={() => toggleSelection(opt.value)}
              className={`px-2 py-1.5 rounded text-sm cursor-pointer flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-zinc-800 ${selected.includes(opt.value) ? 'bg-zinc-50 dark:bg-zinc-800/50 font-semibold' : ''}`}
            >
              <span>{opt.label}</span>
              {selected.includes(opt.value) && <Check size={12} className="text-black dark:text-white" />}
            </div>
          ))}
          {onAdd && (
            <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-1 p-1 flex gap-1">
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-zinc-400"
                placeholder="Add new..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItem) {
                    onAdd(newItem);
                    setNewItem('');
                  }
                }}
              />
              <button
                onClick={() => {
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
