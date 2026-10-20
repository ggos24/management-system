import React from 'react';
import { Check, ChevronRight, ListChecks } from './icons';
import type { Member, TaskSubtask } from '../types';
import { Avatar } from './Avatar';
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
  const circumference = 13 * Math.PI;
  const share = total ? done / total : 0;
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 flex-shrink-0 -rotate-90" aria-hidden>
      <circle cx="8" cy="8" r="6.5" fill="none" strokeWidth="2.5" className="stroke-zinc-200 dark:stroke-zinc-700" />
      {share > 0 && (
        <circle
          cx="8"
          cy="8"
          r="6.5"
          fill="none"
          strokeWidth="2.5"
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
        'inline-flex items-center gap-1 whitespace-nowrap rounded px-1 py-0.5 text-xs font-medium tabular-nums transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800',
        done === total ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400',
        expanded && 'bg-zinc-100 dark:bg-zinc-800',
        className,
      )}
    >
      <ChevronRight
        size={12}
        className={cn('-mr-0.5 text-zinc-400 transition-transform duration-150', expanded && 'rotate-90')}
      />
      <Ring done={done} total={total} /> {done}/{total}
    </button>
  );
};

/** Completion tick shared by the board rows and the table rows. */
export const SubtaskCheckbox: React.FC<{
  subtask: TaskSubtask;
  canToggle: boolean;
  onToggle: (id: string, completed: boolean) => void;
}> = ({ subtask, canToggle, onToggle }) => (
  <button
    type="button"
    role="checkbox"
    aria-label={`Complete ${subtask.title}`}
    aria-checked={subtask.completed}
    disabled={!canToggle}
    onClick={(event) => {
      event.stopPropagation();
      onToggle(subtask.id, !subtask.completed);
    }}
    className={cn(
      'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors',
      subtask.completed
        ? 'border-emerald-500 bg-emerald-500 text-white'
        : 'border-zinc-400 hover:border-zinc-600 dark:border-zinc-600 dark:hover:border-zinc-400',
      !canToggle && 'opacity-50',
    )}
  >
    {subtask.completed && <Check size={11} strokeWidth={3} />}
  </button>
);

/**
 * Subtasks as rows hanging under their parent card (board and mobile list). The left rule ties
 * them to the card above; each row shows the tick, title, assignee and due date.
 */
export const SubtaskList: React.FC<{
  subtasks: TaskSubtask[];
  members: Member[];
  currentUserId: string;
  canEditAll: boolean;
  onToggle: (id: string, completed: boolean) => void;
}> = ({ subtasks, members, currentUserId, canEditAll, onToggle }) => (
  <ul
    className="ml-3 space-y-0.5 border-l-2 border-zinc-200 pl-2 cursor-default dark:border-zinc-700"
    aria-label="Subtasks"
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
    {subtasks.map((item) => {
      const assignee = members.find((member) => member.id === item.assigneeId);
      const canToggle = canEditAll || item.assigneeId === currentUserId;
      return (
        <li
          key={item.id}
          className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-900"
        >
          <SubtaskCheckbox subtask={item} canToggle={canToggle} onToggle={onToggle} />
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-200',
              item.completed && 'line-through text-zinc-400 dark:text-zinc-500',
            )}
            title={item.title}
          >
            {item.title}
          </span>
          {item.endDate && (
            <span
              className="flex-shrink-0 tabular-nums text-[0.625rem] text-zinc-500 dark:text-zinc-400"
              title={`Due ${formatDateEU(item.endDate)}`}
            >
              {formatDateEU(item.endDate)}
            </span>
          )}
          {assignee && (
            <span className="flex-shrink-0" title={assignee.name}>
              <Avatar src={assignee.avatar} alt={assignee.name} size="xs" />
            </span>
          )}
        </li>
      );
    })}
  </ul>
);
