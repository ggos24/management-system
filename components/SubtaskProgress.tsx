import React from 'react';
import { Check, ListChecks } from 'lucide-react';
import type { Member, TaskSubtask } from '../types';
import { cn } from '../lib/cn';
import { formatDateEU } from '../lib/utils';
import { subtaskProgress } from '../lib/taskSubtasks';

const Bar: React.FC<{ done: number; total: number }> = ({ done, total }) => (
  <span
    className="block h-1 flex-1 max-w-48 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden"
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={total}
    aria-valuenow={done}
  >
    <span
      className={cn(
        'block h-full rounded-full transition-[width] duration-300',
        done === total ? 'bg-emerald-500' : 'bg-zinc-500 dark:bg-zinc-400',
      )}
      style={{ width: `${total ? (done / total) * 100 : 0}%` }}
    />
  </span>
);

const Ring: React.FC<{ done: number; total: number }> = ({ done, total }) => {
  const circumference = 10 * Math.PI;
  const share = total ? done / total : 0;
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" className="flex-shrink-0 -rotate-90" aria-hidden>
      <circle cx="6" cy="6" r="5" fill="none" strokeWidth="2" className="stroke-zinc-200 dark:stroke-zinc-700" />
      {share > 0 && (
        <circle
          cx="6"
          cy="6"
          r="5"
          fill="none"
          strokeWidth="2"
          strokeLinecap={share < 1 ? 'round' : 'butt'}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - share)}
          className={cn(
            'transition-[stroke-dashoffset] duration-300',
            share === 1 ? 'stroke-emerald-500' : 'stroke-zinc-500 dark:stroke-zinc-400',
          )}
        />
      )}
    </svg>
  );
};

export const SubtaskSummaryBar: React.FC<{ subtasks: TaskSubtask[]; className?: string }> = ({
  subtasks,
  className,
}) => {
  if (!subtasks.length) return null;
  const { done, total } = subtaskProgress(subtasks);
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        <ListChecks size={14} className={done === total ? 'text-emerald-500' : undefined} />
        Subtasks{' '}
        <span className="tabular-nums text-zinc-900 dark:text-zinc-100">
          {done}/{total}
        </span>
      </span>
      <Bar done={done} total={total} />
    </div>
  );
};

export const SubtaskProgress: React.FC<{
  subtasks: TaskSubtask[];
  expanded: boolean;
  onExpand: () => void;
  className?: string;
}> = ({ subtasks, expanded, onExpand, className }) => {
  if (!subtasks.length) return null;
  const { done, total } = subtaskProgress(subtasks);
  return (
    <button
      type="button"
      draggable={false}
      onClick={(event) => {
        event.stopPropagation();
        onExpand();
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      aria-label={`Subtasks: ${done} of ${total} done`}
      aria-expanded={expanded}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium tabular-nums transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800',
        done === total ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400',
        expanded && 'bg-zinc-100 dark:bg-zinc-800',
        className,
      )}
    >
      <Ring done={done} total={total} /> {done}/{total}
    </button>
  );
};

export const SubtaskList: React.FC<{
  subtasks: TaskSubtask[];
  members: Member[];
  currentUserId: string;
  canEditAll: boolean;
  onToggle: (id: string, completed: boolean) => void;
}> = ({ subtasks, members, currentUserId, canEditAll, onToggle }) => {
  const { done, total } = subtaskProgress(subtasks);
  return (
    <div
      className="rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 cursor-default"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      draggable={false}
    >
      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 px-2 py-1">
        Subtasks · {done}/{total}
      </div>
      <ul className="space-y-0.5">
        {subtasks.map((item) => {
          const assignee = members.find((member) => member.id === item.assigneeId);
          const canToggle = canEditAll || item.assigneeId === currentUserId;
          return (
            <li
              key={item.id}
              className="flex items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-white dark:hover:bg-zinc-800"
            >
              <button
                type="button"
                role="checkbox"
                aria-label={`Complete ${item.title}`}
                aria-checked={item.completed}
                disabled={!canToggle}
                onClick={() => onToggle(item.id, !item.completed)}
                className={cn(
                  'mt-px flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border',
                  item.completed
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-zinc-400 dark:border-zinc-600',
                  !canToggle && 'opacity-50',
                )}
              >
                {item.completed && <Check size={11} strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'break-words text-zinc-800 dark:text-zinc-200',
                    item.completed && 'line-through text-zinc-400',
                  )}
                >
                  {item.title}
                </div>
                <div className="flex flex-wrap gap-x-3 text-[10px] text-zinc-500 dark:text-zinc-400">
                  {assignee && <span>{assignee.name}</span>}
                  {item.startDate && <span>Start {formatDateEU(item.startDate)}</span>}
                  {item.endDate && <span>End {formatDateEU(item.endDate)}</span>}
                  <span>Created {formatDateEU(item.createdAt)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
