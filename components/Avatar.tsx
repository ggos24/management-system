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

/**
 * Strip the Supabase transform prefix if present, returning the plain
 * /object/public/… URL. This is used as a fallback when the transform
 * endpoint returns a broken (black) image.
 */
function getPlainUrl(src: string): string {
  return src.replace(/\/storage\/v1\/render\/image\//, '/storage/v1/object/');
}

/**
 * If the URL points to Supabase Storage, rewrite it through the
 * /render/image/ transform endpoint so the CDN returns a resized version.
 */
function getOptimizedUrl(src: string, size: string): string {
  const pixelSizes: Record<string, number> = { xs: 32, sm: 48, md: 64, lg: 160 };
  const px = pixelSizes[size] ?? 64;

  // Match Supabase storage public URLs:
  // .../storage/v1/object/public/avatars/...
  const match = src.match(/^(https?:\/\/[^/]+\/storage\/v1\/)object\/(public\/.*)/);
  if (match) {
    const [basePath, query] = match[2].split('?');
    const params = new URLSearchParams(query);
    params.set('width', String(px));
    params.set('height', String(px));
    params.set('resize', 'cover');
    return `${match[1]}render/image/${basePath}?${params.toString()}`;
  }

  return src;
}

const Fallback: React.FC<{ size: 'xs' | 'sm' | 'md' | 'lg'; className: string }> = ({ size, className }) => (
  <div
    className={`${sizeClasses[size]} rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0 ${className}`}
  >
    <User size={iconSizes[size]} className="text-zinc-400" />
  </div>
);

/** Inner component keyed on `src` so state auto-resets when the avatar URL changes. */
const AvatarImage: React.FC<{ src: string; alt: string; size: 'xs' | 'sm' | 'md' | 'lg'; className: string }> = ({
  src,
  alt,
  size,
  className,
}) => {
  const [failed, setFailed] = useState(false);
  const [useOriginal, setUseOriginal] = useState(false);

  const optimizedSrc = useMemo(() => getOptimizedUrl(src, size), [src, size]);
  const plainSrc = useMemo(() => getPlainUrl(src), [src]);

  const imgSrc = useOriginal ? plainSrc : optimizedSrc;

  if (failed) return <Fallback size={size} className={className} />;

  return (
    <img
      src={imgSrc}
      alt={alt}
      onError={() => {
        if (!useOriginal) {
          setUseOriginal(true);
        } else {
          setFailed(true);
        }
      }}
      className={`${sizeClasses[size]} rounded-full object-cover border border-zinc-200 dark:border-zinc-700 ${className}`}
    />
  );
};

export const Avatar: React.FC<AvatarProps> = ({ src, alt = '', size = 'md', className = '' }) => {
  if (!src) return <Fallback size={size} className={className} />;
  return <AvatarImage key={src} src={src} alt={alt} size={size} className={className} />;
};
