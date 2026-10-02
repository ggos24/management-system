import React, { useMemo, useState } from 'react';
import { Calendar, Check, Edit2, Plus, Trash2, User, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Member, TaskSubtask } from '../types';
import { useDataStore } from '../stores/dataStore';
import { formatDateEU } from '../lib/utils';
import { SubtaskSummaryBar } from './SubtaskProgress';
import { CustomSelect } from './CustomSelect';
import { SimpleDatePicker } from './SimpleDatePicker';
import { Button, Input } from './ui';

interface Props {
  taskId?: string;
  deleted: boolean;
  readOnly: boolean;
  currentUserId: string;
  members: Member[];
  draftSubtasks: TaskSubtask[];
  onDraftChange: (items: TaskSubtask[]) => void;
}

export const TaskSubtasksSection: React.FC<Props> = ({
  taskId,
  deleted,
  readOnly,
  currentUserId,
  members,
  draftSubtasks,
  onDraftChange,
}) => {
  const savedSubtasks = useDataStore((state) => state.taskSubtasks);
  const saveSubtask = useDataStore((state) => state.saveTaskSubtask);
  const deleteSubtask = useDataStore((state) => state.deleteTaskSubtask);
  const toggleSubtask = useDataStore((state) => state.toggleTaskSubtask);
  const [form, setForm] = useState<TaskSubtask | null>(null);
  const [saving, setSaving] = useState(false);
  const subtasks = taskId ? savedSubtasks.filter((item) => item.taskId === taskId) : draftSubtasks;
  const canEdit = !readOnly && !deleted;
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => (a.id === currentUserId ? -1 : b.id === currentUserId ? 1 : 0)),
    [members, currentUserId],
  );

  const startAdding = () =>
    setForm({
      id: crypto.randomUUID(),
      taskId: taskId || '',
      title: '',
      assigneeId: null,
      createdAt: new Date().toISOString(),
      startDate: null,
      endDate: null,
      completed: false,
    });

  const saveForm = async () => {
    if (!form) return;
    const title = form.title.trim();
    if (!title) {
      toast.error('Subtask title is required');
      return;
    }
    if (title.length > 500) {
      toast.error('Subtask title is too long');
      return;
    }
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      toast.error('End date must be on or after start date');
      return;
    }
    const next = { ...form, title };
    if (!taskId) {
      onDraftChange(
        draftSubtasks.some((item) => item.id === next.id)
          ? draftSubtasks.map((item) => (item.id === next.id ? next : item))
          : [...draftSubtasks, next],
      );
      setForm(null);
      return;
    }
    setSaving(true);
    const saved = await saveSubtask(next);
    setSaving(false);
    if (saved) setForm(null);
  };

  const remove = async (item: TaskSubtask) => {
    if (!taskId) {
      onDraftChange(draftSubtasks.filter((draft) => draft.id !== item.id));
      return;
    }
    await deleteSubtask(item.id);
  };

  const toggle = (item: TaskSubtask) => {
    if (deleted || (readOnly && item.assigneeId !== currentUserId)) return;
    if (taskId) void toggleSubtask(item.id, !item.completed);
    else
      onDraftChange(
        draftSubtasks.map((draft) => (draft.id === item.id ? { ...draft, completed: !draft.completed } : draft)),
      );
  };

  return (
    <section className="space-y-3" aria-label="Subtasks">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Subtasks</h3>
          <SubtaskSummaryBar subtasks={subtasks} className="mt-1" />
        </div>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={startAdding}>
            <Plus size={14} className="mr-1" /> Add subtask
          </Button>
        )}
      </div>
      {!subtasks.length && <p className="text-sm text-zinc-400">No subtasks yet</p>}
      <ul className="space-y-2">
        {subtasks.map((item) => {
          const assignee = members.find((member) => member.id === item.assigneeId);
          const canToggle = !deleted && (!readOnly || item.assigneeId === currentUserId);
          return (
            <li
              key={item.id}
              className="flex items-start gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-2.5"
            >
              <button
                type="button"
                role="checkbox"
                aria-label={`Complete ${item.title}`}
                aria-checked={item.completed}
                disabled={!canToggle}
                onClick={() => toggle(item)}
                className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${item.completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-zinc-400 dark:border-zinc-600'} disabled:opacity-50`}
              >
                {item.completed && <Check size={11} strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm break-words text-zinc-800 dark:text-zinc-200 ${item.completed ? 'line-through text-zinc-400' : ''}`}
                >
                  {item.title}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {assignee && <span>{assignee.name}</span>}
                  <span>Created {formatDateEU(item.createdAt)}</span>
                  {item.startDate && <span>Start {formatDateEU(item.startDate)}</span>}
                  {item.endDate && <span>End {formatDateEU(item.endDate)}</span>}
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-label={`Edit ${item.title}`}
                    onClick={() => setForm(item)}
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${item.title}`}
                    onClick={() => void remove(item)}
                    className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && form && (
        <div key={form.id} className="space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Title
            <Input
              value={form.title}
              maxLength={500}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              className="mt-1 w-full"
              autoFocus
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CustomSelect
              icon={User}
              label="Assignee"
              options={[
                { value: '', label: 'Unassigned' },
                ...sortedMembers.map((member) => ({ value: member.id, label: member.name })),
              ]}
              value={form.assigneeId || ''}
              onChange={(value) => setForm({ ...form, assigneeId: value || null })}
              placeholder="Unassigned"
              searchable
              highlightValue={currentUserId}
            />
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                <Calendar size={12} /> Start date
              </label>
              <SimpleDatePicker
                value={form.startDate || ''}
                onChange={(date) => setForm({ ...form, startDate: date || null })}
                placeholder="Set start date"
              />
            </div>
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                <Calendar size={12} /> End date
              </label>
              <SimpleDatePicker
                value={form.endDate || ''}
                onChange={(date) => setForm({ ...form, endDate: date || null })}
                placeholder="Set end date"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setForm(null)}>
              <X size={14} className="mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={() => void saveForm()} disabled={saving}>
              <Check size={14} className="mr-1" /> Save subtask
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};
