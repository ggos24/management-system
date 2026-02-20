import React from 'react';
import { cn } from '../../lib/cn';

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: keyof typeof paddingMap;
  hoverable?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ padding = 'none', hoverable = false, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg',
          paddingMap[padding],
          hoverable && 'hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors',
          className,
        )}
        {...props}
      />
    );
  },
);

Card.displayName = 'Card';
