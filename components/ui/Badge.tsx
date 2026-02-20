import React from 'react';
import { cn } from '../../lib/cn';

const badgeColors = {
  zinc: 'bg-zinc-100 dark:bg-zinc-900/30 text-zinc-700 dark:text-zinc-300',
  emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  red: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: keyof typeof badgeColors;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ color = 'zinc', className, ...props }, ref) => {
  return (
    <span
      ref={ref}
      className={cn(
        'px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider',
        badgeColors[color],
        className,
      )}
      {...props}
    />
  );
});

Badge.displayName = 'Badge';
