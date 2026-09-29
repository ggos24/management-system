import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ListChecks } from 'lucide-react';
import { cn } from '../lib/cn';
import { parseSubtasks } from '../lib/subtasks';
import { useViewportPortalPosition } from '../hooks/useViewportPortalPosition';

const Bar: React.FC<{ done: number; total: number; className?: string }> = ({ done, total, className }) => (
  <span
    className={cn('block h-1 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden', className)}
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

/**
 * A pie-style ring: the arc is the share done. It says "progress" in the width of one glyph,
 * where a bar needed its own run of space beside the count.
 */
const Ring: React.FC<{ done: number; total: number; size?: number }> = ({ done, total, size = 12 }) => {
  const stroke = 2;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const share = total ? done / total : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0 -rotate-90" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="stroke-zinc-200 dark:stroke-zinc-700"
      />
      {share > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
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

/** "Subtasks 2/5" with a bar — the header line above a task description. */
export const SubtaskSummaryBar: React.FC<{ description: string | null | undefined; className?: string }> = ({
  description,
  className,
}) => {
  const summary = parseSubtasks(description);
  if (!summary) return null;
  const complete = summary.done === summary.total;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 flex-shrink-0">
        <ListChecks size={14} className={complete ? 'text-emerald-500' : undefined} />
        Subtasks
        <span className={complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-100'}>
          {summary.done}/{summary.total}
        </span>
      </span>
      <Bar done={summary.done} total={summary.total} className="flex-1 max-w-48" />
    </div>
  );
};

interface SubtaskProgressProps {
  description: string | null | undefined;
  /** Omit for a read-only list (no write access, or the task is in the bin). */
  onToggle?: (index: number, key: string) => void;
  className?: string;
}

// The chip sits inside clickable, draggable cards and table rows. React bubbles events from a
// portal to its React ancestors, so the popover has to stop them too, not just the chip.
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Subtask count chip for cards and table cells; opens the checklist to tick items in place. */
export const SubtaskProgress: React.FC<SubtaskProgressProps> = ({ description, onToggle, className }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const summary = parseSubtasks(description);

  const position = useViewportPortalPosition({
    isOpen: open && !!summary,
    triggerRef,
    fixedWidth: 272,
    estimatedHeight: 260,
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!summary) return null;
  const complete = summary.done === summary.total;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        draggable={false}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseDown={stop}
        onPointerDown={stop}
        title={`Subtasks: ${summary.done} of ${summary.total} done`}
        aria-label={`Subtasks: ${summary.done} of ${summary.total} done`}
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium tabular-nums transition-colors',
          'hover:bg-zinc-100 dark:hover:bg-zinc-800',
          complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400',
          open && 'bg-zinc-100 dark:bg-zinc-800',
          className,
        )}
      >
        <Ring done={summary.done} total={summary.total} />
        {summary.done}/{summary.total}
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Subtasks"
            onClick={stop}
            onMouseDown={stop}
            onPointerDown={stop}
            onDoubleClick={stop}
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
              transform: position.flipUp ? 'translateY(-100%)' : undefined,
            }}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-[10000] flex flex-col overflow-hidden cursor-default"
          >
            <div className="px-3 pt-2.5 pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                <span>Subtasks</span>
                <span
                  className={
                    complete
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-zinc-900 dark:text-zinc-100 tabular-nums'
                  }
                >
                  {summary.done}/{summary.total}
                </span>
              </div>
              <Bar done={summary.done} total={summary.total} />
            </div>
            <ul className="overflow-y-auto py-1">
              {summary.items.map((item) => (
                <li key={`${item.index}:${item.key}`}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.done}
                    disabled={!onToggle}
                    onClick={() => onToggle?.(item.index, item.key)}
                    className="w-full flex items-start gap-2 px-3 py-1.5 text-left text-xs enabled:hover:bg-zinc-50 dark:enabled:hover:bg-zinc-800 disabled:cursor-default"
                  >
                    <span
                      className={cn(
                        'mt-px flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border-[1.5px]',
                        item.done
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-zinc-400 dark:border-zinc-600',
                      )}
                    >
                      {item.done && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 wrap-anywhere',
                        item.done ? 'line-through text-zinc-400' : 'text-zinc-800 dark:text-zinc-200',
                      )}
                    >
                      {item.text || <span className="italic text-zinc-400">Empty item</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
};
