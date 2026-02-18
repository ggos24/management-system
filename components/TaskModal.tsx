import React, { useRef } from 'react';
import { toast } from 'sonner';
import {
  Trash2,
  Share2,
  Plus,
  X,
  Calendar,
  CheckCircle,
  Layout,
  User as UserIcon,
  Eye,
  Zap,
  Globe,
  Palette,
  Link as LinkIcon,
} from 'lucide-react';
import { Modal } from './Modal';
import { FormattingToolbar } from './FormattingToolbar';
import { MultiSelect } from './MultiSelect';
import { CustomSelect } from './CustomSelect';
import { SimpleDatePicker } from './SimpleDatePicker';
import { useUiStore } from '../stores/uiStore';
import { useDataStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { Task } from '../types';

export const TaskModal: React.FC = () => {
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const { isTaskModalOpen, taskModalData, isShareOpen, setIsTaskModalOpen, setTaskModalData, setIsShareOpen } =
    useUiStore();

  const {
    teams,
    members,
    teamStatuses,
    teamTypes,
    teamProperties,
    allPlacements,
    setAllPlacements,
    saveTask,
    deleteTask,
    addStatus,
    addType,
    updateProperty,
  } = useDataStore();

  const currentUser = useAuthStore((s) => s.currentUser);

  const handleSaveTask = () => {
    saveTask(taskModalData, teams);
    setIsTaskModalOpen(false);
  };

  const handleDeleteTask = (taskId: string) => {
    if (confirm('Are you sure you want to delete this task?')) {
      deleteTask(taskId);
      setIsTaskModalOpen(false);
    }
  };

  const handleShareTask = (mode: 'view' | 'edit') => {
    if (!taskModalData.id) {
      toast.warning('Please create the task first before sharing.');
      return;
    }
    const url = `https://mediaflow.app/task/${taskModalData.id}?mode=${mode}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        toast.success('Link copied to clipboard');
        setIsShareOpen(false);
      })
      .catch(() => {
        toast.error(`Could not copy to clipboard. Link: ${url}`);
      });
  };

  const handleAddEmptyLink = () => {
    setTaskModalData((prev: Partial<Task>) => ({
      ...prev,
      links: [...(prev.links || []), { title: '', url: '' }],
    }));
  };

  const handleUpdateLink = (idx: number, field: 'title' | 'url', value: string) => {
    setTaskModalData((prev: Partial<Task>) => {
      const newLinks = [...(prev.links || [])];
      newLinks[idx] = { ...newLinks[idx], [field]: value };
      return { ...prev, links: newLinks };
    });
  };

  const handleRemoveLink = (idx: number) => {
    setTaskModalData((prev: Partial<Task>) => {
      const newLinks = [...(prev.links || [])];
      newLinks.splice(idx, 1);
      return { ...prev, links: newLinks };
    });
  };

  const applyMarkdown = (field: 'description' | 'notes', action: string) => {
    const inputRef = field === 'description' ? descriptionRef : notesRef;
    if (!inputRef.current) return;

    const textarea = inputRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    let replacement = '';
    let cursorOffset = 0;

    switch (action) {
      case 'h2':
        replacement = `## ${selectedText || 'Heading 2'}`;
        cursorOffset = selectedText ? 0 : 11;
        break;
      case 'h3':
        replacement = `### ${selectedText || 'Heading 3'}`;
        cursorOffset = selectedText ? 0 : 12;
        break;
      case 'bold':
        replacement = `**${selectedText || 'bold text'}**`;
        cursorOffset = selectedText ? 0 : 11;
        break;
      case 'italic':
        replacement = `*${selectedText || 'italic text'}*`;
        cursorOffset = selectedText ? 0 : 13;
        break;
      case 'list':
        replacement = `\n- ${selectedText || 'List item'}`;
        cursorOffset = selectedText ? 0 : 12;
        break;
      case 'todo':
        replacement = `\n- [ ] ${selectedText || 'To-do item'}`;
        cursorOffset = selectedText ? 0 : 16;
        break;
      case 'link':
        replacement = `[${selectedText || 'Link text'}](url)`;
        cursorOffset = selectedText ? 5 : 14;
        break;
      default:
        replacement = selectedText;
    }

    const newText = text.substring(0, start) + replacement + text.substring(end);

    setTaskModalData((prev: Partial<Task>) => {
      if (field === 'description') return { ...prev, description: newText };
      return { ...prev, contentInfo: { ...prev.contentInfo!, notes: newText } };
    });

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(start + replacement.length - cursorOffset, start + replacement.length);
      }
    }, 0);
  };

  const getAuthorLabel = () => (taskModalData.teamId === 'management' ? 'Executive' : 'Author');
  const getEditorLabel = () => (taskModalData.teamId === 'management' ? 'Manager' : 'Editor');

  return (
    <Modal
      isOpen={isTaskModalOpen}
      onClose={() => setIsTaskModalOpen(false)}
      title=""
      headerActions={
        <div className="flex gap-2 mr-2 relative">
          <button
            onClick={() => handleDeleteTask(taskModalData.id!)}
            className={`p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors ${!taskModalData.id ? 'hidden' : ''}`}
            title="Delete Task"
          >
            <Trash2 size={18} />
          </button>
          <button
            onClick={() => setIsShareOpen(!isShareOpen)}
            className="p-1.5 text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
            title="Share"
          >
            <Share2 size={18} />
          </button>
          {isShareOpen && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded shadow-xl z-50 p-1 flex flex-col">
              <button
                onClick={() => handleShareTask('view')}
                className="text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-700 dark:text-zinc-300"
              >
                Share for View
              </button>
              <button
                onClick={() => handleShareTask('edit')}
                className="text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-700 dark:text-zinc-300"
              >
                Share for Edit
              </button>
            </div>
          )}
        </div>
      }
      actions={
        <>
          <button
            onClick={() => setIsTaskModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveTask}
            className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            {taskModalData.id ? 'Save Changes' : 'Create Task'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <input
          type="text"
          placeholder="Task Title"
          value={taskModalData.title || ''}
          onChange={(e) => setTaskModalData({ ...taskModalData, title: e.target.value })}
          className="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder-zinc-300 dark:placeholder-zinc-700"
          autoFocus
        />

        <div className="space-y-2">
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800/50 overflow-hidden focus-within:ring-1 focus-within:ring-zinc-400">
            <FormattingToolbar onAction={(action) => applyMarkdown('description', action)} />
            <textarea
              ref={descriptionRef}
              className="w-full p-3 bg-transparent border-none outline-none text-sm min-h-[120px] resize-y"
              placeholder="Description..."
              value={taskModalData.description || ''}
              onChange={(e) => setTaskModalData({ ...taskModalData, description: e.target.value })}
            />
          </div>
        </div>

        <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
            <CustomSelect
              icon={CheckCircle}
              label="Status"
              options={teamStatuses[taskModalData.teamId || 'default'] || teamStatuses['default'] || ['To Do']}
              value={taskModalData.status || ''}
              onChange={(val) => setTaskModalData({ ...taskModalData, status: val })}
              onAdd={(val) => {
                addStatus(taskModalData.teamId || 'default', val);
                setTaskModalData({ ...taskModalData, status: val });
              }}
            />
            <CustomSelect
              icon={Layout}
              label="Content Type"
              options={teamTypes[taskModalData.teamId || 'default'] || teamTypes['default'] || ['General']}
              value={taskModalData.contentInfo?.type || ''}
              onChange={(val) =>
                setTaskModalData({ ...taskModalData, contentInfo: { ...taskModalData.contentInfo!, type: val } })
              }
              onAdd={(val) => {
                addType(taskModalData.teamId || 'default', val);
                setTaskModalData({ ...taskModalData, contentInfo: { ...taskModalData.contentInfo!, type: val } });
              }}
            />
            <MultiSelect
              icon={UserIcon}
              label={getAuthorLabel()}
              options={members.map((m) => ({ value: m.id, label: m.name }))}
              selected={taskModalData.assigneeIds || []}
              onChange={(ids) => setTaskModalData({ ...taskModalData, assigneeIds: ids })}
              placeholder={`Select ${getAuthorLabel()}...`}
            />
            <MultiSelect
              icon={Eye}
              label={getEditorLabel()}
              options={members.map((m) => ({ value: m.id, label: m.name }))}
              selected={taskModalData.contentInfo?.editorIds || []}
              onChange={(ids) =>
                setTaskModalData({ ...taskModalData, contentInfo: { ...taskModalData.contentInfo!, editorIds: ids } })
              }
              placeholder={`Select ${getEditorLabel()}...`}
            />
            {taskModalData.teamId === 'social' && (
              <MultiSelect
                icon={Palette}
                label="Designer"
                options={members.map((m) => ({ value: m.id, label: m.name }))}
                selected={taskModalData.contentInfo?.designerIds || []}
                onChange={(ids) =>
                  setTaskModalData({
                    ...taskModalData,
                    contentInfo: { ...taskModalData.contentInfo!, designerIds: ids },
                  })
                }
                placeholder="Select Designer..."
              />
            )}
            <CustomSelect
              icon={Zap}
              label="Priority"
              options={['low', 'medium', 'high']}
              value={taskModalData.priority || 'medium'}
              onChange={(val) => setTaskModalData({ ...taskModalData, priority: val as Task['priority'] })}
              renderValue={(v) => (
                <span
                  className={`capitalize ${v === 'high' ? 'text-red-500 font-bold' : v === 'medium' ? 'text-yellow-500' : 'text-zinc-500'}`}
                >
                  {v}
                </span>
              )}
            />
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
                <Calendar size={12} /> Due Date
              </label>
              <SimpleDatePicker
                value={taskModalData.dueDate ? taskModalData.dueDate.split('T')[0] : ''}
                onChange={(date) => setTaskModalData({ ...taskModalData, dueDate: new Date(date).toISOString() })}
                placeholder="Set due date"
              />
            </div>
            <div className="md:col-span-2">
              <MultiSelect
                icon={Globe}
                label="Placements"
                options={allPlacements.map((p) => ({ value: p, label: p }))}
                selected={taskModalData.placements || []}
                onChange={(tags) => setTaskModalData({ ...taskModalData, placements: tags })}
                onAdd={(newTag) => {
                  setAllPlacements([...allPlacements, newTag]);
                  setTaskModalData({ ...taskModalData, placements: [...(taskModalData.placements || []), newTag] });
                }}
                placeholder="Add tags..."
              />
            </div>

            {/* Custom Properties Inputs */}
            {(teamProperties[taskModalData.teamId || 'default'] || []).map((prop) => (
              <div key={prop.id} className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 flex items-center gap-1.5 capitalize">
                  {prop.name}
                </label>
                {prop.type === 'text' && (
                  <input
                    className="w-full p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none focus:ring-1 focus:ring-zinc-400"
                    value={taskModalData.customFieldValues?.[prop.id] || ''}
                    onChange={(e) =>
                      setTaskModalData({
                        ...taskModalData,
                        customFieldValues: { ...taskModalData.customFieldValues, [prop.id]: e.target.value },
                      })
                    }
                  />
                )}
                {prop.type === 'date' && (
                  <SimpleDatePicker
                    value={taskModalData.customFieldValues?.[prop.id] || ''}
                    onChange={(date) =>
                      setTaskModalData({
                        ...taskModalData,
                        customFieldValues: { ...taskModalData.customFieldValues, [prop.id]: date },
                      })
                    }
                    placeholder="Select Date"
                  />
                )}
                {prop.type === 'select' && (
                  <CustomSelect
                    options={prop.options?.map((o) => ({ value: o, label: o })) || []}
                    value={taskModalData.customFieldValues?.[prop.id] || ''}
                    onChange={(val) =>
                      setTaskModalData({
                        ...taskModalData,
                        customFieldValues: { ...taskModalData.customFieldValues, [prop.id]: val },
                      })
                    }
                    placeholder="Select..."
                    onAdd={(val) => {
                      updateProperty(taskModalData.teamId || 'default', {
                        ...prop,
                        options: [...(prop.options || []), val],
                      });
                      setTaskModalData({
                        ...taskModalData,
                        customFieldValues: { ...taskModalData.customFieldValues, [prop.id]: val },
                      });
                    }}
                  />
                )}
                {prop.type === 'person' && (
                  <CustomSelect
                    options={members.map((m) => ({ value: m.id, label: m.name }))}
                    value={taskModalData.customFieldValues?.[prop.id] || ''}
                    onChange={(val) =>
                      setTaskModalData({
                        ...taskModalData,
                        customFieldValues: { ...taskModalData.customFieldValues, [prop.id]: val },
                      })
                    }
                    placeholder="Select person..."
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800/50 overflow-hidden focus-within:ring-1 focus-within:ring-zinc-400">
            <div className="bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">
              <span className="text-xs font-bold text-zinc-500 uppercase">Notes</span>
            </div>
            <FormattingToolbar onAction={(action) => applyMarkdown('notes', action)} />
            <textarea
              ref={notesRef}
              className="w-full p-3 bg-transparent border-none outline-none text-sm min-h-[100px] resize-y"
              placeholder="Add notes..."
              value={taskModalData.contentInfo?.notes || ''}
              onChange={(e) =>
                setTaskModalData({
                  ...taskModalData,
                  contentInfo: { ...taskModalData.contentInfo!, notes: e.target.value },
                })
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
            <LinkIcon size={12} /> Links Attachments
          </label>
          {taskModalData.links?.map((link, idx) => (
            <div key={idx} className="flex gap-2 mb-2">
              <input
                className="flex-1 p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs outline-none focus:ring-1 focus:ring-zinc-400"
                placeholder="Title (e.g. Reference)"
                value={link.title}
                onChange={(e) => handleUpdateLink(idx, 'title', e.target.value)}
              />
              <input
                className="flex-[2] p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs outline-none focus:ring-1 focus:ring-zinc-400 font-mono text-blue-600 dark:text-blue-400"
                placeholder="URL (https://...)"
                value={link.url}
                onChange={(e) => handleUpdateLink(idx, 'url', e.target.value)}
              />
              <button onClick={() => handleRemoveLink(idx)} className="p-2 text-zinc-400 hover:text-red-500">
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={handleAddEmptyLink}
            className="text-xs flex items-center gap-1 text-blue-600 hover:underline font-medium"
          >
            <Plus size={12} /> Add Link
          </button>
        </div>
      </div>
    </Modal>
  );
};
