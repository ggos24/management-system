import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, ExternalLink, IdCard, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { CustomSelect } from './CustomSelect';
import { SimpleDatePicker } from './SimpleDatePicker';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { Badge, Button, Input, FormField, IconButton } from './ui';
import { useDataStore } from '../stores/dataStore';
import { useNow } from '../hooks/useNow';
import { formatDateEU } from '../lib/utils';
import {
  ACCREDITATION_KINDS,
  ACCREDITATION_KIND_LABEL,
  ACCREDITATION_STATE_BADGE,
  ACCREDITATION_STATUSES,
  ACCREDITATION_STATUS_LABEL,
  EXPIRING_SOON_DAYS,
  countdownClass,
  daysUntil,
  deriveAccreditationState,
  describeCountdown,
  type AccreditationState,
} from '../lib/renewals';
import type { Accreditation, AccreditationKind, AccreditationStatus, Member } from '../types';

type FilterKey = 'all' | 'expiring' | 'expired' | 'active' | 'pending' | 'revoked';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expiring', label: 'Expiring soon' },
  { key: 'expired', label: 'Expired' },
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Pending' },
  { key: 'revoked', label: 'Revoked' },
];

/** Attention first, revoked last; inside a group the nearest date wins. */
const STATE_RANK: Record<AccreditationState, number> = {
  expired: 0,
  expiring: 0,
  valid: 0,
  pending: 1,
  no_expiry: 2,
  revoked: 3,
};

const textareaClass =
  'w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 text-base md:text-sm text-zinc-900 dark:text-white resize-none';

interface Row {
  item: Accreditation;
  state: AccreditationState;
  days: number | null;
}

export const AccreditationsTool: React.FC = () => {
  const navigate = useNavigate();
  const { accreditations, members, saveAccreditation, removeAccreditation } = useDataStore(
    useShallow((s) => ({
      accreditations: s.accreditations,
      members: s.members,
      saveAccreditation: s.saveAccreditation,
      removeAccreditation: s.removeAccreditation,
    })),
  );
  const now = useNow();

  const [filter, setFilter] = useState<FilterKey>('all');
  // Local, not the header's global search: that box only renders on task views.
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | AccreditationKind>('all');
  const [editing, setEditing] = useState<Partial<Accreditation> | null>(null);
  const [deleting, setDeleting] = useState<Accreditation | null>(null);

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const allRows = useMemo<Row[]>(
    () =>
      accreditations.map((item) => ({
        item,
        state: deriveAccreditationState(item, now),
        days: daysUntil(item.validUntil, now),
      })),
    [accreditations, now],
  );

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allRows
      .filter(({ item, state }) => {
        if (query && !`${item.holderName} ${item.issuer} ${item.cardNumber}`.toLowerCase().includes(query)) {
          return false;
        }
        if (kind !== 'all' && item.kind !== kind) return false;
        switch (filter) {
          case 'expiring':
            return state === 'expiring';
          case 'expired':
            return state === 'expired';
          case 'active':
            return state === 'valid' || state === 'expiring' || state === 'no_expiry';
          case 'pending':
            return state === 'pending';
          case 'revoked':
            return state === 'revoked';
          default:
            return true;
        }
      })
      .sort(
        (a, b) =>
          STATE_RANK[a.state] - STATE_RANK[b.state] ||
          (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER) ||
          a.item.holderName.localeCompare(b.item.holderName),
      );
  }, [allRows, filter, search, kind]);

  // Header badges count everything, not just the rows passing the filter.
  const expiringCount = allRows.filter((row) => row.state === 'expiring').length;
  const expiredCount = allRows.filter((row) => row.state === 'expired').length;

  const filtersActive = filter !== 'all' || kind !== 'all' || search.trim().length > 0;
  const resetFilters = () => {
    setFilter('all');
    setKind('all');
    setSearch('');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 md:px-6 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/tools')}
              className="p-1.5 -ml-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Back to Tools"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <IdCard size={18} className="text-zinc-500" />
              Accreditations
              {expiringCount > 0 && (
                <Badge color="amber" className="ml-1">
                  {expiringCount} expiring
                </Badge>
              )}
              {expiredCount > 0 && <Badge color="red">{expiredCount} expired</Badge>}
            </h1>
          </div>
          <Button size="sm" onClick={() => setEditing({ kind: 'press_card', status: 'active' })}>
            <Plus size={14} className="mr-1.5" />
            New accreditation
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <div className="relative w-56">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Holder, issuer or number…"
              aria-label="Search accreditations"
              className="pl-8 py-1.5 text-xs"
            />
          </div>

          <div className="w-40">
            <CustomSelect
              options={[
                { value: 'all', label: 'All kinds' },
                ...ACCREDITATION_KINDS.map((entry) => ({ value: entry, label: ACCREDITATION_KIND_LABEL[entry] })),
              ]}
              value={kind}
              onChange={(value) => setKind(value as 'all' | AccreditationKind)}
              compact
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto">
            {FILTERS.map((entry) => (
              <button
                key={entry.key}
                onClick={() => setFilter(entry.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  filter === entry.key
                    ? 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                    : 'text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {filtersActive && (
            <span className="ml-auto text-xs text-zinc-400 whitespace-nowrap">
              {rows.length} of {allRows.length}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <IdCard size={32} className="text-zinc-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">
              {accreditations.length === 0 ? 'No accreditations recorded yet.' : 'Nothing matches these filters.'}
            </p>
            {filtersActive && (
              <Button variant="ghost" size="sm" className="mt-3" onClick={resetFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-black border-b border-zinc-200 dark:border-zinc-800">
              <tr className="text-left text-xs text-zinc-500">
                <th className="px-3 py-2 font-medium">Holder</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Issuer</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Number</th>
                <th className="px-3 py-2 font-medium">Valid until</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, state, days }) => {
                const holder = item.holderId ? memberById.get(item.holderId) : undefined;
                const badge = ACCREDITATION_STATE_BADGE[state];
                const dateClass =
                  state === 'revoked' || state === 'pending'
                    ? 'text-zinc-500'
                    : countdownClass(days, EXPIRING_SOON_DAYS);
                return (
                  <tr
                    key={item.id}
                    onClick={() => setEditing(item)}
                    className="border-b border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <Avatar src={holder?.avatar} alt={item.holderName} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-zinc-900 dark:text-white">{item.holderName}</span>
                          {!item.holderId && <span className="block text-[10px] text-zinc-400">Former member</span>}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                      {ACCREDITATION_KIND_LABEL[item.kind]}
                    </td>
                    <td className="px-3 py-2 text-zinc-900 dark:text-white">{item.issuer}</td>
                    <td className="px-3 py-2 hidden md:table-cell font-mono text-xs text-zinc-500">
                      {item.cardNumber || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {item.validUntil ? (
                        <>
                          <span className={dateClass}>{formatDateEU(item.validUntil)}</span>
                          <span className="block text-[10px] text-zinc-400">{describeCountdown(days)}</span>
                        </>
                      ) : (
                        <span className="text-zinc-400">No expiry</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge color={badge.color}>{badge.label}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {item.documentUrl && (
                          <a
                            href={item.documentUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Open document"
                            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                        <IconButton size="sm" title="Edit" onClick={() => setEditing(item)}>
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton size="sm" title="Delete" onClick={() => setDeleting(item)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <AccreditationFormModal
          item={editing}
          members={members}
          onClose={() => setEditing(null)}
          onSave={async (draft) => {
            const saved = await saveAccreditation(draft);
            if (saved) setEditing(null);
          }}
          onDelete={
            editing.id
              ? () => {
                  const target = accreditations.find((candidate) => candidate.id === editing.id);
                  setEditing(null);
                  if (target) setDeleting(target);
                }
              : undefined
          }
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          title="Delete accreditation"
          description={
            <>
              Remove the <strong>{deleting.issuer}</strong> accreditation held by <strong>{deleting.holderName}</strong>
              ? This cannot be undone.
            </>
          }
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            removeAccreditation(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
};

// --- Admin form ---

interface AccreditationFormModalProps {
  item: Partial<Accreditation>;
  members: Member[];
  onClose: () => void;
  onSave: (draft: Partial<Accreditation> & { id?: string }) => Promise<void>;
  onDelete?: () => void;
}

const AccreditationFormModal: React.FC<AccreditationFormModalProps> = ({
  item,
  members,
  onClose,
  onSave,
  onDelete,
}) => {
  const [draft, setDraft] = useState<Partial<Accreditation>>(item);
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<Accreditation>) => setDraft((prev) => ({ ...prev, ...patch }));

  const holderOptions = members
    .filter((member) => member.accessScope === 'full')
    .map((member) => ({ value: member.id, label: member.name }));
  // The holder left: the snapshot name stays unless someone new is picked.
  const formerHolder = Boolean(item.id) && !item.holderId;
  const canSave = (Boolean(draft.holderId) || formerHolder) && (draft.issuer || '').trim().length > 0 && !saving;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={item.id ? 'Edit accreditation' : 'New accreditation'}
      size="md"
      actions={
        <div className="flex items-center justify-between w-full">
          {onDelete ? (
            <Button variant="ghost" className="text-red-600" onClick={onDelete}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!canSave}
              onClick={async () => {
                setSaving(true);
                await onSave(draft);
                setSaving(false);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField label="Holder" required>
          <CustomSelect
            options={holderOptions}
            value={draft.holderId || ''}
            onChange={(value) => update({ holderId: value })}
            placeholder="Choose a team member"
            searchable
          />
          {formerHolder && !draft.holderId && (
            <p className="text-xs text-zinc-500 mt-1">
              Recorded for {item.holderName}, who is no longer a member. Pick someone to reassign it, or leave as is.
            </p>
          )}
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Kind">
            <CustomSelect
              options={ACCREDITATION_KINDS.map((entry) => ({ value: entry, label: ACCREDITATION_KIND_LABEL[entry] }))}
              value={draft.kind || 'press_card'}
              onChange={(value) => update({ kind: value as AccreditationKind })}
            />
          </FormField>
          <FormField label="Status">
            <CustomSelect
              options={ACCREDITATION_STATUSES.map((entry) => ({
                value: entry,
                label: ACCREDITATION_STATUS_LABEL[entry],
              }))}
              value={draft.status || 'active'}
              onChange={(value) => update({ status: value as AccreditationStatus })}
            />
          </FormField>
        </div>

        <FormField label="Issuer" required>
          <Input
            value={draft.issuer || ''}
            placeholder="Ministry of Defence"
            onChange={(e) => update({ issuer: e.target.value })}
          />
        </FormField>

        <FormField label="Card number">
          <Input
            value={draft.cardNumber || ''}
            placeholder="MoD-2026-0142"
            onChange={(e) => update({ cardNumber: e.target.value })}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Issued on">
            <SimpleDatePicker
              value={draft.issuedAt || ''}
              onChange={(value) => update({ issuedAt: value || null })}
              placeholder="Pick a date"
            />
          </FormField>
          <FormField label="Valid until">
            <SimpleDatePicker
              value={draft.validUntil || ''}
              onChange={(value) => update({ validUntil: value || null })}
              placeholder="No expiry"
            />
            <p className="text-xs text-zinc-500 mt-1">Leave empty if it never expires.</p>
          </FormField>
        </div>

        <FormField label="Document link">
          <Input
            type="url"
            value={draft.documentUrl || ''}
            placeholder="https://drive.google.com/…"
            onChange={(e) => update({ documentUrl: e.target.value })}
          />
        </FormField>

        <FormField label="Notes">
          <textarea
            rows={3}
            className={textareaClass}
            value={draft.notes || ''}
            placeholder="Zones, renewal contact, what was needed to apply…"
            onChange={(e) => update({ notes: e.target.value })}
          />
        </FormField>
      </div>
    </Modal>
  );
};

export default AccreditationsTool;
