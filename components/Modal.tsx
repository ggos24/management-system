import React, { useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './ui/Button';

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  mdx: 'max-w-xl',
  lg: 'max-w-3xl',
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  headerActions?: React.ReactNode;
  allowOverflow?: boolean;
  size?: 'sm' | 'md' | 'mdx' | 'lg';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  actions,
  headerActions,
  allowOverflow,
  size = 'lg',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();

      // Focus trap: cycle Tab/Shift+Tab within modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-start md:items-center justify-center p-2 md:p-4 safe-t"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className={`bg-white dark:bg-zinc-900 w-full ${sizeClasses[size]} rounded-lg shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in duration-200 flex flex-col ${allowOverflow ? 'overflow-visible max-h-[calc(100dvh-1rem)] md:max-h-[90dvh]' : 'max-h-[calc(100dvh-1rem)] md:max-h-[90dvh]'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-4 md:px-6 py-3 md:py-4 flex-shrink-0">
          <div className="min-w-0 flex-1">
            {title && <h3 className="text-lg font-semibold text-zinc-900 dark:text-white truncate">{title}</h3>}
          </div>
          <div className="flex justify-end gap-1 md:gap-2 items-center flex-shrink-0">
            {headerActions}
            <IconButton size="sm" onClick={onClose} aria-label="Close">
              <X size={18} />
            </IconButton>
          </div>
        </div>
        <div className={`px-4 md:px-6 pb-6 flex-1 ${allowOverflow ? 'overflow-visible' : 'overflow-y-auto'}`}>
          {children}
        </div>
        {actions && (
          <div className="px-4 md:px-6 py-3 md:py-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap justify-end gap-2 md:gap-3 rounded-b-lg flex-shrink-0 safe-b">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
