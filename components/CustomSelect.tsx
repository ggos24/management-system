import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Plus } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: React.ReactNode;
}

interface CustomSelectProps {
  icon?: React.ElementType;
  label?: string;
  hint?: string;
  options: (string | SelectOption)[];
  value: string;
  onChange: (value: string) => void;
  onAdd?: (newValue: string) => void;
  placeholder?: string;
  className?: string;
  renderValue?: (value: string) => React.ReactNode;
  compact?: boolean;
  dropdownMinWidth?: number;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  icon: Icon,
  label,
  hint,
  options,
  value,
  onChange,
  onAdd,
  placeholder = 'Select...',
  className,
  renderValue,
  compact,
  dropdownMinWidth = 150,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newItem, setNewItem] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  const normalizeOption = (opt: string | SelectOption): SelectOption => {
    if (typeof opt === 'string') return { value: opt, label: opt };
    return opt;
  };

  const selectedOption = options.map(normalizeOption).find((o) => o.value === value);

  return (
    <div className={`relative space-y-1 ${className || ''}`} ref={triggerRef}>
      {label && (
        <div>
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            {Icon && <Icon size={12} />} {label}
          </label>
          {hint && <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{hint}</p>}
        </div>
      )}
      <div
        onClick={() => {
          if (!isOpen) updatePosition();
          setIsOpen(!isOpen);
        }}
        className={
          compact
            ? 'w-full min-h-[24px] px-1.5 py-0.5 rounded cursor-pointer flex items-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 relative text-sm'
            : 'w-full min-h-[32px] pl-2 pr-8 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm cursor-pointer flex items-center transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 relative'
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
      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: Math.max(dropdownPos.width, dropdownMinWidth),
            }}
            className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-[10000] max-h-60 overflow-y-auto p-1 animate-in fade-in zoom-in-95 duration-100"
          >
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
                  className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-zinc-400"
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
          </div>,
          document.body,
        )}
    </div>
  );
};
