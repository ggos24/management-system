import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Check, Plus } from 'lucide-react';

export interface MultiSelectOptionGroup {
  label: string;
  teamId: string;
  options: { value: string; label: string }[];
  highlighted?: boolean;
}

interface MultiSelectProps {
  icon: React.ElementType;
  label: string;
  hint?: string;
  options?: { value: string; label: string }[];
  groups?: MultiSelectOptionGroup[];
  selected: string[];
  onChange: (selected: string[]) => void;
  onToggleWithGroup?: (value: string, selected: boolean, group: MultiSelectOptionGroup) => void;
  onAdd?: (newValue: string) => void;
  placeholder?: string;
  className?: string;
  compact?: boolean;
  maxVisible?: number;
  renderTrigger?: (onClick: () => void, selected: string[]) => React.ReactNode;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
  icon: Icon,
  label,
  hint,
  options = [],
  groups,
  selected,
  onChange,
  onToggleWithGroup,
  onAdd,
  placeholder = 'Select...',
  className,
  compact,
  maxVisible,
  renderTrigger,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newItem, setNewItem] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

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

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const handleScroll = () => updatePosition();
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen, updatePosition]);

  // Flat options list for chip label lookup (from groups or options)
  const allOptions = groups ? groups.flatMap((g) => g.options) : options;

  const toggleSelection = (value: string, group?: MultiSelectOptionGroup) => {
    const isSelected = !selected.includes(value);
    if (onToggleWithGroup && group) {
      onToggleWithGroup(value, isSelected, group);
    } else {
      const newSelected = isSelected ? [...selected, value] : selected.filter((s) => s !== value);
      onChange(newSelected);
    }
  };

  const renderOption = (opt: { value: string; label: string }, group?: MultiSelectOptionGroup) => (
    <div
      key={`${group?.teamId || 'flat'}-${opt.value}`}
      onClick={() => toggleSelection(opt.value, group)}
      className={`px-2 py-1.5 rounded text-sm cursor-pointer flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-zinc-800 ${selected.includes(opt.value) ? 'bg-zinc-50 dark:bg-zinc-800/50 font-semibold' : ''}`}
    >
      <span>{opt.label}</span>
      {selected.includes(opt.value) && <Check size={12} className="text-black dark:text-white" />}
    </div>
  );

  const toggle = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setIsOpen((v) => !v);
  };

  return (
    <div className={`relative space-y-1 ${className}`} ref={triggerRef}>
      {label && (
        <div>
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <Icon size={12} /> {label}
          </label>
          {hint && <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{hint}</p>}
        </div>
      )}
      {renderTrigger ? (
        renderTrigger(() => setIsOpen((v) => !v), selected)
      ) : (
        <div
          onClick={toggle}
          className={
            compact
              ? 'w-full min-h-[24px] px-1.5 py-0.5 rounded text-xs cursor-pointer flex flex-wrap gap-1 items-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 relative'
              : 'w-full min-h-[32px] pl-2 pr-8 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm cursor-pointer flex flex-wrap gap-1 items-center transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 relative'
          }
        >
          {selected.length === 0 && <span className="text-zinc-400">{placeholder}</span>}
          {(() => {
            const visible = maxVisible != null && !isOpen ? selected.slice(0, maxVisible) : selected;
            const hiddenCount = maxVisible != null && !isOpen ? Math.max(0, selected.length - maxVisible) : 0;
            return (
              <>
                {visible.map((val) => {
                  const matched = allOptions.find((o) => o.value === val);
                  const optionLabel = matched?.label || (val.includes(':') ? val.substring(val.indexOf(':') + 1) : val);
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
                {hiddenCount > 0 && (
                  <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 px-1 py-0.5">
                    +{hiddenCount}
                  </span>
                )}
              </>
            );
          })()}
          {!compact && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
              <ChevronDown size={12} />
            </div>
          )}
        </div>
      )}
      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: Math.max(dropdownPos.width, 150),
            }}
            className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-[10000] max-h-60 overflow-y-auto p-1 animate-in fade-in zoom-in-95 duration-100"
          >
            {groups
              ? groups.map((group, gi) => (
                  <div key={group.teamId}>
                    {gi > 0 && <div className="border-t border-zinc-100 dark:border-zinc-700 my-1" />}
                    <div
                      className={`text-[10px] uppercase tracking-wider font-semibold px-2 pt-2 pb-1 ${group.highlighted ? 'text-blue-500 dark:text-blue-400' : 'text-zinc-400'}`}
                    >
                      {group.label}
                    </div>
                    {group.options.map((opt) => renderOption(opt, group))}
                  </div>
                ))
              : options.map((opt) => renderOption(opt))}
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
          </div>,
          document.body,
        )}
    </div>
  );
};
