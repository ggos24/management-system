import React from 'react';
import { cn } from '../../lib/cn';

const buttonVariants = {
  primary:
    'bg-black dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50',
  ghost: 'font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors',
  danger: 'bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors',
  link: 'text-blue-600 hover:underline font-medium',
};

const buttonSizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-6 py-2 text-sm',
};

const looseSizes = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  size?: 'sm' | 'md';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, ...props }, ref) => {
    const useTight = variant === 'primary' || variant === 'danger';
    const sizeClass = useTight ? buttonSizes[size] : looseSizes[size];

    return <button ref={ref} className={cn(buttonVariants[variant], sizeClass, className)} {...props} />;
  },
);

Button.displayName = 'Button';

const iconButtonSizes = {
  sm: 'p-1.5',
  md: 'p-2',
};

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 dark:text-zinc-400 transition-colors focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1',
          iconButtonSizes[size],
          className,
        )}
        {...props}
      />
    );
  },
);

IconButton.displayName = 'IconButton';
