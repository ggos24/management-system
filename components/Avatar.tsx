import React, { useState, useMemo } from 'react';
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

// Pixel size to request from Supabase transform (2x for retina)
const pixelSizes: Record<string, number> = {
  xs: 32,
  sm: 48,
  md: 64,
  lg: 160,
};

/**
 * If the URL points to Supabase Storage, rewrite it through the
 * /render/image/ transform endpoint so the CDN returns a resized version.
 */
function getOptimizedUrl(src: string, size: string): string {
  const px = pixelSizes[size] ?? 64;

  // Match Supabase storage public URLs:
  // .../storage/v1/object/public/avatars/...
  const match = src.match(/^(https?:\/\/[^/]+\/storage\/v1\/)object\/(public\/.*)/);
  if (match) {
    // Strip any existing query params from the path, keep cache-buster
    const [basePath, query] = match[2].split('?');
    const params = new URLSearchParams(query);
    params.set('width', String(px));
    params.set('height', String(px));
    params.set('resize', 'cover');
    return `${match[1]}render/image/${basePath}?${params.toString()}`;
  }

  return src;
}

export const Avatar: React.FC<AvatarProps> = ({ src, alt = '', size = 'md', className = '' }) => {
  const [failed, setFailed] = useState(false);

  const optimizedSrc = useMemo(() => (src ? getOptimizedUrl(src, size) : ''), [src, size]);

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
      src={optimizedSrc}
      alt={alt}
      onError={() => setFailed(true)}
      className={`${sizeClasses[size]} rounded-full object-cover border border-zinc-200 dark:border-zinc-700 grayscale ${className}`}
    />
  );
};
