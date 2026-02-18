import React, { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  headerActions?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, actions, headerActions }) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center p-4">
          <div>{title && <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{title}</h3>}</div>
          <div className="flex-1 flex justify-end gap-2 items-center">
            {headerActions}
            <button onClick={onClose}>
              <X size={20} className="text-zinc-400 hover:text-black dark:hover:text-white" />
            </button>
          </div>
        </div>
        <div className="px-8 pb-8">{children}</div>
        {actions && (
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3 rounded-b-lg">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
