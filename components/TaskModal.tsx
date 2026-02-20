import React, { useState } from 'react';
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
  Type,
  List as ListIcon,
  Users,
  MoreHorizontal,
  Edit2,
} from 'lucide-react';
import { Modal } from './Modal';
import { RichTextEditor } from './RichTextEditor';
import { MultiSelect } from './MultiSelect';
import { CustomSelect } from './CustomSelect';
import { SimpleDatePicker } from './SimpleDatePicker';
import { Button, Input, Label, Divider } from './ui';
import { useUiStore } from '../stores/uiStore';
import { useDataStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { Task, CustomProperty } from '../types';
import { PRIORITY_COLORS, PRIORITY_DOT } from '../constants';

export const TaskModal: React.FC = () => {
  const [isAddPropertyOpen, setIsAddPropertyOpen] = useState(false);
  const [newPropName, setNewPropName] = useState('');
  const [newPropType, setNewPropType] = useState<CustomProperty['type']>('text');
  const [editingPropId, setEditingPropId] = useState<string | null>(null);
  const [editingPropName, setEditingPropName] = useState('');
  const [propMenuId, setPropMenuId] = useState<string | null>(null);
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
    addProperty,
    deleteProperty,
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
          <Button variant="ghost" onClick={() => setIsTaskModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveTask}>{taskModalData.id ? 'Save Changes' : 'Create Task'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <input
          type="text"
          placeholder="Task Title"
          value={taskModalData.title || ''}
          onChange={(e) => setTaskModalData({ ...taskModalData, title: e.target.value })}
          className="w-full text-2xl font-bold bg-transparent border-none outline-none placeholder-zinc-300 dark:placeholder-zinc-700"
          autoFocus
        />

        <RichTextEditor
          value={taskModalData.description || ''}
          onChange={(html) => setTaskModalData({ ...taskModalData, description: html })}
          placeholder="Description..."
          minHeight="120px"
        />

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
                <span className={`capitalize inline-flex items-center gap-1.5 ${PRIORITY_COLORS[v] || ''}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[v] || 'bg-zinc-400'}`} />
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
              <div key={prop.id} className="space-y-1 relative">
                <div className="flex items-center justify-between group/prop">
                  {editingPropId === prop.id ? (
                    <input
                      autoFocus
                      className="text-xs font-medium bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-0.5 outline-none w-full"
                      value={editingPropName}
                      onChange={(e) => setEditingPropName(e.target.value)}
                      onBlur={() => {
                        if (editingPropName.trim()) {
                          updateProperty(taskModalData.teamId || 'default', { ...prop, name: editingPropName.trim() });
                        }
                        setEditingPropId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (editingPropName.trim()) {
                            updateProperty(taskModalData.teamId || 'default', {
                              ...prop,
                              name: editingPropName.trim(),
                            });
                          }
                          setEditingPropId(null);
                        }
                        if (e.key === 'Escape') setEditingPropId(null);
                      }}
                    />
                  ) : (
                    <label className="text-xs font-medium text-zinc-500 flex items-center gap-1.5 capitalize">
                      {prop.name}
                    </label>
                  )}
                  {editingPropId !== prop.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPropMenuId(propMenuId === prop.id ? null : prop.id);
                      }}
                      className="opacity-0 group-hover/prop:opacity-100 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-opacity p-0.5"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  )}
                </div>
                {propMenuId === prop.id && (
                  <div className="absolute right-0 top-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 py-1 w-44">
                    <button
                      onClick={() => {
                        setEditingPropId(prop.id);
                        setEditingPropName(prop.name);
                        setPropMenuId(null);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-xs"
                    >
                      <Edit2 size={12} /> Rename
                    </button>
                    <Divider className="my-1" />
                    <p className="px-3 py-1 text-[10px] font-semibold text-zinc-400 uppercase">Change Type</p>
                    {[
                      { type: 'text' as const, icon: Type, label: 'Text' },
                      { type: 'select' as const, icon: ListIcon, label: 'Select' },
                      { type: 'date' as const, icon: Calendar, label: 'Date' },
                      { type: 'person' as const, icon: Users, label: 'Person' },
                    ].map(({ type, icon: Icon, label }) => (
                      <button
                        key={type}
                        onClick={() => {
                          updateProperty(taskModalData.teamId || 'default', { ...prop, type });
                          setPropMenuId(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-xs ${prop.type === type ? 'text-black dark:text-white font-medium' : ''}`}
                      >
                        <Icon size={12} /> {label} {prop.type === type && '(current)'}
                      </button>
                    ))}
                    <Divider className="my-1" />
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${prop.name}" property?`)) {
                          deleteProperty(taskModalData.teamId || 'default', prop.id);
                        }
                        setPropMenuId(null);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-xs text-red-500"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                )}
                {prop.type === 'text' && (
                  <Input
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

            <div className="md:col-span-2 relative">
              {isAddPropertyOpen ? (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-zinc-900 dark:text-white">New Property</h4>
                    <button onClick={() => setIsAddPropertyOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                      <X size={14} />
                    </button>
                  </div>
                  <Input
                    placeholder="Property Name"
                    value={newPropName}
                    onChange={(e) => setNewPropName(e.target.value)}
                    autoFocus
                  />
                  <div className="space-y-1">
                    {[
                      { type: 'text' as const, icon: Type, label: 'Text' },
                      { type: 'select' as const, icon: ListIcon, label: 'Select' },
                      { type: 'date' as const, icon: Calendar, label: 'Date' },
                      { type: 'person' as const, icon: Users, label: 'Person' },
                    ].map(({ type, icon: Icon, label }) => (
                      <button
                        key={type}
                        onClick={() => setNewPropType(type)}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 ${newPropType === type ? 'bg-zinc-100 dark:bg-zinc-800 font-medium' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                      >
                        <Icon size={12} /> {label}
                      </button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      if (!newPropName || !addProperty) return;
                      addProperty(taskModalData.teamId || 'default', {
                        id: crypto.randomUUID(),
                        name: newPropName,
                        type: newPropType,
                        options: [],
                      });
                      setNewPropName('');
                      setIsAddPropertyOpen(false);
                    }}
                  >
                    Create
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddPropertyOpen(true)}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 font-medium transition-colors"
                >
                  <Plus size={14} /> Add Property
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label variant="section">Notes</Label>
          <RichTextEditor
            value={taskModalData.contentInfo?.notes || ''}
            onChange={(html) =>
              setTaskModalData({
                ...taskModalData,
                contentInfo: { ...taskModalData.contentInfo!, notes: html },
              })
            }
            placeholder="Add notes..."
            minHeight="100px"
          />
        </div>

        <div className="space-y-2">
          <Label variant="section" className="flex items-center gap-2">
            <LinkIcon size={12} /> Links Attachments
          </Label>
          {taskModalData.links?.map((link, idx) => (
            <div key={idx} className="flex gap-2 mb-2">
              <Input
                className="flex-1"
                placeholder="Title (e.g. Reference)"
                value={link.title}
                onChange={(e) => handleUpdateLink(idx, 'title', e.target.value)}
              />
              <Input
                className="flex-[2] font-mono text-blue-600 dark:text-blue-400"
                placeholder="URL (https://...)"
                value={link.url}
                onChange={(e) => handleUpdateLink(idx, 'url', e.target.value)}
              />
              <button onClick={() => handleRemoveLink(idx)} className="p-2 text-zinc-400 hover:text-red-500">
                <X size={14} />
              </button>
            </div>
          ))}
          <Button variant="link" size="sm" onClick={handleAddEmptyLink} className="flex items-center gap-1">
            <Plus size={12} /> Add Link
          </Button>
        </div>
      </div>
    </Modal>
  );
};
