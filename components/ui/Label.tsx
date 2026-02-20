import React from 'react';
import { cn } from '../../lib/cn';

const labelVariants = {
  form: 'text-xs font-medium uppercase text-zinc-500 tracking-wider',
  section: 'text-xs font-semibold text-zinc-500 uppercase',
};

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  variant?: keyof typeof labelVariants;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ variant = 'form', className, ...props }, ref) => {
    return <label ref={ref} className={cn(labelVariants[variant], className)} {...props} />;
  },
);

Label.displayName = 'Label';
