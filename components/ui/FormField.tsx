import React from 'react';
import { Label } from './Label';

interface FormFieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({ label, required, children, className }) => {
  return (
    <div className={className ?? 'space-y-1.5'}>
      <Label>
        {label}
        {required && ' *'}
      </Label>
      {children}
    </div>
  );
};
