import React from 'react';
import { cn } from '../../lib/cn';

interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}

export const Divider = React.forwardRef<HTMLDivElement, DividerProps>(
  ({ orientation = 'horizontal', className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'bg-zinc-200 dark:bg-zinc-800',
          orientation === 'horizontal' ? 'h-px w-full' : 'w-px h-full',
          className,
        )}
        {...props}
      />
    );
  },
);

Divider.displayName = 'Divider';
