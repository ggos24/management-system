import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface AlertBannerProps {
  message: string;
  icon?: React.ElementType;
  variant?: 'error' | 'warning' | 'info';
}

const variantClasses = {
  error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
  warning:
    'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300',
  info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
};

const defaultIcons = {
  error: X,
  warning: AlertCircle,
  info: AlertCircle,
};

export const AlertBanner: React.FC<AlertBannerProps> = ({ message, icon, variant = 'error' }) => {
  const Icon = icon || defaultIcons[variant];

  return (
    <div className={`p-3 border rounded-lg flex items-center gap-2 text-sm ${variantClasses[variant]}`}>
      <Icon size={16} className="flex-shrink-0" />
      {message}
    </div>
  );
};
