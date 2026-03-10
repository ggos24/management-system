import React, { useState, useRef, useEffect } from 'react';
import { Doc, DocSection } from '../types';
import { DocsEditor } from './DocsEditor';
import { CustomSelect } from './CustomSelect';
import { IconComponent, ICONS } from './IconComponent';
import { Button, Label } from './ui';
import { Folder } from 'lucide-react';

interface DocEditorProps {
  doc?: Doc;
  section: DocSection;
  folders: Doc[];
  onSave: (data: {
    id?: string;
    title: string;
    slug: string;
    description: string | null;
    parentId: string | null;
    icon: string | null;
    content: Record<string, unknown>;
    contentHtml: string;
    isFolder: boolean;
  }) => void;
  onCancel: () => void;
  isFolder?: boolean;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const DocEditor: React.FC<DocEditorProps> = ({ doc, folders, onSave, onCancel, isFolder }) => {
  const [title, setTitle] = useState(doc?.title || '');
  const [description, setDescription] = useState(doc?.description || '');
  const [parentId, setParentId] = useState<string | null>(doc?.parentId || null);
  const [icon, setIcon] = useState<string | null>(doc?.icon || null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<Record<string, unknown>>(doc?.content || {});
  const [contentHtml, setContentHtml] = useState(doc?.contentHtml || '');
  const isFolderMode = isFolder ?? doc?.isFolder ?? false;

  // Close icon picker on outside click
  useEffect(() => {
    if (!iconPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target as Node)) {
        setIconPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [iconPickerOpen]);

  const slug = doc?.slug ? doc.slug : slugify(title);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      id: doc?.id,
      title: title.trim(),
      slug: slug || slugify(title),
      description: description.trim() || null,
      parentId,
      icon: isFolderMode ? icon : null,
      content,
      contentHtml,
      isFolder: isFolderMode,
    });
  };

  const folderOptions = [
    { value: '', label: 'None (top level)' },
    ...folders.map((f) => ({ value: f.id, label: f.title })),
  ];

  return (
    <div className="max-w-3xl mx-auto">
      {/* Title row with optional icon picker for folders */}
      <div className="flex items-center gap-3 mb-4">
        {isFolderMode && (
          <div className="relative" ref={iconPickerRef}>
            <button
              type="button"
              onClick={() => setIconPickerOpen(!iconPickerOpen)}
              className="h-10 w-10 flex items-center justify-center border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors flex-shrink-0"
              title="Choose icon"
            >
              {icon ? <IconComponent name={icon} size={18} /> : <Folder size={18} />}
            </button>
            {iconPickerOpen && (
              <div className="absolute top-12 left-0 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 p-2 grid grid-cols-6 gap-1">
                <button
                  onClick={() => {
                    setIcon(null);
                    setIconPickerOpen(false);
                  }}
                  className={`p-2 rounded-md transition-colors ${!icon ? 'bg-zinc-200 dark:bg-zinc-700' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'} text-zinc-600 dark:text-zinc-300`}
                  title="Default folder icon"
                >
                  <Folder size={16} />
                </button>
                {ICONS.map((ic) => (
                  <button
                    key={ic}
                    onClick={() => {
                      setIcon(ic);
                      setIconPickerOpen(false);
                    }}
                    className={`p-2 rounded-md transition-colors ${icon === ic ? 'bg-zinc-200 dark:bg-zinc-700' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'} text-zinc-600 dark:text-zinc-300`}
                    title={ic}
                  >
                    <IconComponent name={ic} size={16} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isFolderMode ? 'Folder name...' : 'Article title...'}
          className="flex-1 text-2xl font-bold bg-transparent border-none outline-none text-zinc-900 dark:text-white placeholder:text-zinc-400"
          autoFocus
        />
      </div>

      {/* Description */}
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Short description (optional)"
        className="w-full text-sm bg-transparent border-none outline-none text-zinc-500 dark:text-zinc-400 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 mb-4"
      />

      {/* Parent folder selector */}
      {folders.length > 0 && (
        <div className="mb-4 max-w-xs">
          <Label variant="form" className="mb-1">
            Parent folder
          </Label>
          <CustomSelect
            options={folderOptions}
            value={parentId || ''}
            onChange={(val) => setParentId(val || null)}
            placeholder="None (top level)"
          />
        </div>
      )}

      {/* Body editor (not for folders) */}
      {!isFolderMode && (
        <DocsEditor
          content={content}
          onChange={(json, html) => {
            setContent(json);
            setContentHtml(html);
          }}
        />
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4">
        <Button variant="primary" size="sm" onClick={handleSave} disabled={!title.trim()}>
          {doc ? 'Save' : 'Create'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
