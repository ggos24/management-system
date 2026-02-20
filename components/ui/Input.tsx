import React from 'react';
import { cn } from '../../lib/cn';

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 text-sm text-zinc-900 dark:text-white',
        className,
      )}
      {...props}
    />
  );
});

Input.displayName = 'Input';
