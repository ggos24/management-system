import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Paperclip, X, UploadCloud, Loader2, FileText } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './ui/Button';
import { FormField } from './ui/FormField';
import { Input } from './ui/Input';
import { CustomSelect, type SelectOption } from './CustomSelect';
import { useUiStore } from '../stores/uiStore';
import { useDataStore } from '../stores/dataStore';
import { TICKET_CATEGORIES, TICKET_CATEGORY_META, TICKET_PRIORITIES, PRIORITY_DOT } from '../constants';
import type { TicketAttachment, TicketCategory, Priority } from '../types';
import * as db from '../lib/database';

const categoryOptions: SelectOption[] = TICKET_CATEGORIES.map((c) => ({
  value: c,
  label: TICKET_CATEGORY_META[c].label,
}));

const priorityLabel = (p: string) => (
  <span className="flex items-center gap-2">
    <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[p] || 'bg-zinc-400'}`} />
    <span className="capitalize">{p}</span>
  </span>
);
const priorityOptions: SelectOption[] = TICKET_PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }));

const isImage = (a: TicketAttachment) => (a.type || '').startsWith('image/');

/** Form body — mounted fresh whenever the modal opens, so state resets without an effect. */
const NewTicketForm: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const navigate = useNavigate();
  const createTicket = useDataStore((s) => s.createTicket);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TicketCategory>('website');
  const [priority, setPriority] = useState<Priority>('medium');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && uploadingCount === 0 && !submitting;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploadingCount((n) => n + list.length);
    await Promise.all(
      list.map(async (file) => {
        try {
          const att = await db.uploadTicketAttachment(file);
          setAttachments((prev) => [...prev, att]);
        } catch {
          toast.error(`Failed to upload ${file.name}`);
        } finally {
          setUploadingCount((n) => n - 1);
        }
      }),
    );
  };

  const removeAttachment = (url: string) => setAttachments((prev) => prev.filter((a) => a.url !== url));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const ticket = await createTicket({ title, description, category, priority, attachments });
    setSubmitting(false);
    if (ticket) {
      toast.success('Ticket submitted — we’ll take a look');
      onClose();
      navigate(`/support?ticket=${ticket.id}`);
    }
  };

  return (
    <div className="space-y-4">
      <FormField label="What’s the problem?" required>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short summary, e.g. “Login button does nothing on the admin panel”"
        />
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Area">
          <CustomSelect options={categoryOptions} value={category} onChange={(v) => setCategory(v as TicketCategory)} />
        </FormField>
        <FormField label="Priority">
          <CustomSelect
            options={priorityOptions}
            value={priority}
            onChange={(v) => setPriority(v as Priority)}
            renderValue={priorityLabel}
          />
        </FormField>
      </div>

      <FormField label="Describe what happened" required>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder={'Steps to reproduce\nWhat you expected\nWhat actually happened'}
          className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 text-base md:text-sm text-zinc-900 dark:text-white resize-y"
        />
      </FormField>

      <FormField label="Attachments">
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-1 px-4 py-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors text-center ${
            dragOver
              ? 'border-zinc-400 bg-zinc-50 dark:bg-zinc-800/50'
              : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/30'
          }`}
        >
          <UploadCloud size={20} className="text-zinc-400" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            <span className="font-medium text-zinc-700 dark:text-zinc-200">Click to upload</span> or drag screenshots
            here
          </p>
          <p className="text-[11px] text-zinc-400">Images, PDF, logs — up to 25 MB each</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {(attachments.length > 0 || uploadingCount > 0) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div
                key={a.url}
                className="group relative flex items-center gap-2 max-w-[200px] rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1 pr-2"
              >
                {isImage(a) ? (
                  <img src={a.url} alt={a.name} className="w-9 h-9 rounded object-cover flex-shrink-0" />
                ) : (
                  <span className="w-9 h-9 rounded bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                    <FileText size={16} className="text-zinc-500" />
                  </span>
                )}
                <span className="text-xs text-zinc-600 dark:text-zinc-300 truncate">{a.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAttachment(a.url);
                  }}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-zinc-700 dark:bg-zinc-200 text-white dark:text-zinc-900 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove ${a.name}`}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {uploadingCount > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1 pr-3">
                <span className="w-9 h-9 rounded bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center">
                  <Loader2 size={16} className="text-zinc-400 animate-spin" />
                </span>
                <span className="text-xs text-zinc-500">Uploading…</span>
              </div>
            )}
          </div>
        )}
      </FormField>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
        <p className="text-[11px] text-zinc-400 flex items-center gap-1">
          <Paperclip size={12} /> Tip: a screenshot helps us fix it faster
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Submitting…' : 'Submit ticket'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export const NewTicketModal: React.FC = () => {
  const isOpen = useUiStore((s) => s.isNewTicketModalOpen);
  const setIsOpen = useUiStore((s) => s.setIsNewTicketModalOpen);
  return (
    <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Report a problem" size="lg" allowOverflow>
      <NewTicketForm onClose={() => setIsOpen(false)} />
    </Modal>
  );
};
