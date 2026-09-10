import React, { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './ui';

interface ConfirmDeleteModalProps {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

/** Small destructive-action confirmation, the shape Bin.tsx uses inline. */
export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  title,
  description,
  confirmLabel = 'Delete',
  onCancel,
  onConfirm,
}) => {
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={title}
      size="sm"
      actions={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
    </Modal>
  );
};
