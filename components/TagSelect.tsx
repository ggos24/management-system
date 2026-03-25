import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Plus, ChevronDown, Trash2 } from 'lucide-react';

const TAG_COLORS = [
  { name: 'Gray', bg: 'bg-zinc-100 dark:bg-zinc-700', text: 'text-zinc-700 dark:text-zinc-200', hex: '#71717a' },
  { name: 'Red', bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', hex: '#ef4444' },
  {
    name: 'Orange',
    bg: 'bg-orange-100 dark:bg-orange-900/40',
    text: 'text-orange-700 dark:text-orange-300',
    hex: '#f97316',
  },
  {
    name: 'Amber',
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    text: 'text-amber-700 dark:text-amber-300',
    hex: '#f59e0b',
  },
  {
    name: 'Green',
    bg: 'bg-emerald-100 dark:bg-emerald-900/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    hex: '#10b981',
  },
  { name: 'Teal', bg: 'bg-teal-100 dark:bg-teal-900/40', text: 'text-teal-700 dark:text-teal-300', hex: '#14b8a6' },
  { name: 'Blue', bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', hex: '#3b82f6' },
  {
    name: 'Indigo',
    bg: 'bg-indigo-100 dark:bg-indigo-900/40',
    text: 'text-indigo-700 dark:text-indigo-300',
    hex: '#6366f1',
  },
  {
    name: 'Purple',
    bg: 'bg-purple-100 dark:bg-purple-900/40',
    text: 'text-purple-700 dark:text-purple-300',
    hex: '#a855f7',
  },
  { name: 'Pink', bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-700 dark:text-pink-300', hex: '#ec4899' },
];

export function getTagColorClasses(hex: string | undefined) {
  const found = TAG_COLORS.find((c) => c.hex === hex);
  return found || TAG_COLORS[0];
}

interface TagSelectProps {
  tags: string[];
  selected: string[];
  tagColors: Record<string, string>;
  onChange: (selected: string[]) => void;
  onAddTag?: (name: string, color: string) => void;
  onUpdateTagColor?: (name: string, color: string) => void;
  onDeleteTag?: (name: string) => void;
  placeholder?: string;
  compact?: boolean;
  maxVisible?: number;
}

interface ColorPickerPos {
  top: number;
  left: number;
}

export const TagSelect: React.FC<TagSelectProps> = ({
  tags,
  selected,
  tagColors,
  onChange,
  onAddTag,
  onUpdateTagColor,
  onDeleteTag,
  placeholder = 'Select tags...',
  compact,
  maxVisible,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[4].hex);
  const [isAdding, setIsAdding] = useState(false);
  const [editingTagColor, setEditingTagColor] = useState<string | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState<ColorPickerPos | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        (!colorPickerRef.current || !colorPickerRef.current.contains(target))
      ) {
        setIsOpen(false);
        setIsAdding(false);
        setEditingTagColor(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openColorPicker = useCallback(
    (tag: string, buttonEl: HTMLButtonElement) => {
      if (editingTagColor === tag) {
        setEditingTagColor(null);
        setColorPickerPos(null);
        return;
      }
      const rect = buttonEl.getBoundingClientRect();
      setColorPickerPos({
        top: rect.top - 4,
        left: rect.right + 4,
      });
      setEditingTagColor(tag);
    },
    [editingTagColor],
  );

  const toggleSelection = (tag: string) => {
    // Single-select: clicking the already-selected tag deselects it, otherwise replace
    const newSelected = selected.includes(tag) ? [] : [tag];
    onChange(newSelected);
    if (!selected.includes(tag)) setIsOpen(false);
  };

  const handleAddTag = () => {
    const trimmed = newTagName.trim();
    if (!trimmed || !onAddTag) return;
    onAddTag(trimmed, newTagColor);
    onChange([trimmed]);
    setNewTagName('');
    setNewTagColor(TAG_COLORS[4].hex);
    setIsAdding(false);
    setIsOpen(false);
  };

  const visibleTags = maxVisible != null && !isOpen ? selected.slice(0, maxVisible) : selected;
  const hiddenCount = maxVisible != null && !isOpen ? Math.max(0, selected.length - maxVisible) : 0;

  return (
    <div className={`relative ${compact ? '' : 'space-y-1'}`} ref={dropdownRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={
          compact
            ? 'w-full min-h-[24px] px-1.5 py-0.5 rounded text-xs cursor-pointer flex flex-wrap gap-1 items-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 relative'
            : 'w-full min-h-[32px] pl-2 pr-6 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs cursor-pointer flex flex-wrap gap-1 items-center transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 relative'
        }
      >
        {selected.length === 0 && <span className="text-zinc-400">{placeholder}</span>}
        {visibleTags.map((tag) => {
          const color = getTagColorClasses(tagColors[tag]);
          return (
            <span
              key={tag}
              className={`${color.bg} ${color.text} px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 font-medium`}
            >
              {tag}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(selected.filter((s) => s !== tag));
                }}
                className="opacity-60 hover:opacity-100"
              >
                <X size={10} />
              </button>
            </span>
          );
        })}
        {hiddenCount > 0 && (
          <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 px-1 py-0.5">+{hiddenCount}</span>
        )}
        {!compact && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
            <ChevronDown size={12} />
          </div>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 w-full min-w-[200px] mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto p-1 animate-in fade-in zoom-in-95 duration-100">
          {tags.length === 0 && !isAdding && <p className="text-xs text-zinc-400 px-2 py-2 text-center">No tags yet</p>}
          {tags.map((tag) => {
            const color = getTagColorClasses(tagColors[tag]);
            const isSelected = selected.includes(tag);
            return (
              <div key={tag} className="flex items-center group/tag">
                <div
                  onClick={() => toggleSelection(tag)}
                  className={`flex-1 px-2 py-1.5 rounded text-xs cursor-pointer flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 ${isSelected ? 'font-semibold' : ''}`}
                >
                  <span className={`${color.bg} ${color.text} px-1.5 py-0.5 rounded text-[10px] font-medium`}>
                    {tag}
                  </span>
                  <span className="flex-1" />
                  {isSelected && <Check size={12} className="text-black dark:text-white flex-shrink-0" />}
                </div>
                {onUpdateTagColor && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openColorPicker(tag, e.currentTarget);
                    }}
                    className="p-1 rounded opacity-0 group-hover/tag:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-opacity flex-shrink-0"
                  >
                    <div
                      className="w-3 h-3 rounded-full border border-zinc-300 dark:border-zinc-600"
                      style={{ backgroundColor: tagColors[tag] || TAG_COLORS[0].hex }}
                    />
                  </button>
                )}
                {onDeleteTag && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteTag(tag);
                    }}
                    className="p-1 rounded opacity-0 group-hover/tag:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-all flex-shrink-0"
                    title="Delete tag"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}

          {onAddTag && !isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full px-2 py-1.5 rounded text-xs cursor-pointer flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 border-t border-zinc-100 dark:border-zinc-700 mt-1"
            >
              <Plus size={12} /> Create tag
            </button>
          )}

          {isAdding && (
            <div className="border-t border-zinc-100 dark:border-zinc-700 mt-1 pt-2 px-1 space-y-2">
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-zinc-400"
                placeholder="Tag name..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTag();
                  if (e.key === 'Escape') setIsAdding(false);
                }}
              />
              <div className="flex gap-1 items-center">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setNewTagColor(c.hex)}
                    className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${newTagColor === c.hex ? 'border-zinc-900 dark:border-white scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={handleAddTag}
                  className="flex-1 px-2 py-1 bg-black dark:bg-white text-white dark:text-black rounded text-xs font-medium hover:opacity-90"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setNewTagName('');
                  }}
                  className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {editingTagColor &&
        colorPickerPos &&
        onUpdateTagColor &&
        createPortal(
          <div
            ref={colorPickerRef}
            className="fixed bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-2 animate-in fade-in zoom-in-95 duration-100"
            style={{ top: colorPickerPos.top, left: colorPickerPos.left, zIndex: 9999, transform: 'translateY(-100%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-5 gap-1">
              {TAG_COLORS.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => {
                    onUpdateTagColor(editingTagColor, c.hex);
                    setEditingTagColor(null);
                    setColorPickerPos(null);
                  }}
                  className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${tagColors[editingTagColor] === c.hex ? 'border-zinc-900 dark:border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
