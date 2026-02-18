import React, { useState } from 'react';
import { User } from 'lucide-react';

interface AvatarProps {
  src?: string;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  xs: 'w-4 h-4',
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
};

const iconSizes = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
};

export const Avatar: React.FC<AvatarProps> = ({ src, alt = '', size = 'md', className = '' }) => {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0 ${className}`}
      >
        <User size={iconSizes[size]} className="text-zinc-400" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={`${sizeClasses[size]} rounded-full object-cover border border-zinc-200 dark:border-zinc-700 grayscale ${className}`}
    />
  );
};
