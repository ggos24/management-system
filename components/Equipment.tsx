import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Package, Plus, AlertTriangle, Wrench, ArrowRightLeft, Undo2, Printer } from 'lucide-react';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { CustomSelect } from './CustomSelect';
import { Badge, Button, Input, FormField, IconButton } from './ui';
import { useDataStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import { isAdmin } from '../constants';
import { formatDateEU } from '../lib/utils';
import type { EquipmentCategory, EquipmentCheckout, EquipmentItem, EquipmentStatus, Member } from '../types';

const CATEGORIES: EquipmentCategory[] = ['camera', 'lens', 'audio', 'tripod', 'lighting', 'laptop', 'drone', 'other'];

/** Derived unit state. Availability is computed, never stored on the item. */
type UnitState = 'available' | 'out' | 'overdue' | 'maintenance' | 'retired' | 'lost';

type FilterKey = 'all' | 'out' | 'overdue' | 'available' | 'repair' | 'inactive';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'out', label: 'Out' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'available', label: 'Available' },
  { key: 'repair', label: 'Needs repair' },
  { key: 'inactive', label: 'Maintenance & retired' },
];

const STATE_BADGE: Record<
  UnitState,
  { color: 'zinc' | 'emerald' | 'red' | 'blue' | 'amber' | 'purple'; label: string }
> = {
  available: { color: 'emerald', label: 'Available' },
  out: { color: 'blue', label: 'Out' },
  overdue: { color: 'red', label: 'Overdue' },
  maintenance: { color: 'amber', label: 'Maintenance' },
  retired: { color: 'zinc', label: 'Retired' },
  lost: { color: 'red', label: 'Lost' },
};

/** Local-time value for a datetime-local input. */
function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Required-with-a-default: one tap to accept, two to change. */
function defaultReturnAt(): string {
  const end = new Date();
  end.setHours(18, 0, 0, 0);
  if (end.getTime() <= Date.now()) end.setDate(end.getDate() + 1);
  return toLocalInputValue(end);
}

/**
 * Overdue is a moving target and the badge has no cron behind it, so the clock
 * lives in state and ticks. Reading Date.now() during render would be impure and
 * would freeze "2h overdue" at whatever the last unrelated render happened to see.
 */
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${formatDateEU(date)} ${time}`;
}

const Equipment: React.FC = () => {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const searchQuery = useUiStore((s) => s.searchQuery);
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    equipmentItems,
    equipmentCheckouts,
    members,
    saveEquipmentItem,
    removeEquipmentItem,
    checkoutEquipment,
    checkinEquipment,
    transferEquipment,
    markEquipmentLabelsPrinted,
    loadEquipmentHistory,
  } = useDataStore(
    useShallow((s) => ({
      equipmentItems: s.equipmentItems,
      equipmentCheckouts: s.equipmentCheckouts,
      members: s.members,
      saveEquipmentItem: s.saveEquipmentItem,
      removeEquipmentItem: s.removeEquipmentItem,
      checkoutEquipment: s.checkoutEquipment,
      checkinEquipment: s.checkinEquipment,
      transferEquipment: s.transferEquipment,
      markEquipmentLabelsPrinted: s.markEquipmentLabelsPrinted,
      loadEquipmentHistory: s.loadEquipmentHistory,
    })),
  );

  const admin = isAdmin(currentUser.role);
  const now = useNow();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<Partial<EquipmentItem> | null>(null);
  const [checkoutFor, setCheckoutFor] = useState<string[] | null>(null);
  const [checkinFor, setCheckinFor] = useState<EquipmentCheckout | null>(null);
  const [transferFor, setTransferFor] = useState<EquipmentCheckout | null>(null);

  const detailItemId = searchParams.get('item');

  const openByItem = useMemo(() => {
    const map = new Map<string, EquipmentCheckout>();
    for (const checkout of equipmentCheckouts) {
      if (!checkout.checkedInAt) map.set(checkout.itemId, checkout);
    }
    return map;
  }, [equipmentCheckouts]);

  // A returned-but-broken unit keeps its flag until an admin clears it.
  const repairFlagged = useMemo(() => {
    const ids = new Set<string>();
    for (const checkout of equipmentCheckouts) {
      if (checkout.needsRepair) ids.add(checkout.itemId);
    }
    return ids;
  }, [equipmentCheckouts]);

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const allRows = useMemo(
    () =>
      equipmentItems.map((item) => {
        const open = openByItem.get(item.id) ?? null;
        let state: UnitState;
        if (item.status === 'retired' || item.status === 'lost') {
          state = item.status;
        } else if (item.status === 'maintenance') {
          state = 'maintenance';
        } else if (open) {
          state = open.expectedReturnAt && new Date(open.expectedReturnAt).getTime() < now ? 'overdue' : 'out';
        } else {
          state = 'available';
        }
        return { item, open, state };
      }),
    [equipmentItems, openByItem, now],
  );

  const rows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allRows.filter(({ item, state }) => {
      if (query && !`${item.assetCode} ${item.name} ${item.serialNumber}`.toLowerCase().includes(query)) {
        return false;
      }
      switch (filter) {
        case 'out':
          return state === 'out' || state === 'overdue';
        case 'overdue':
          return state === 'overdue';
        case 'available':
          return state === 'available';
        case 'repair':
          return repairFlagged.has(item.id);
        case 'inactive':
          return state === 'maintenance' || state === 'retired' || state === 'lost';
        default:
          return true;
      }
    });
  }, [allRows, repairFlagged, filter, searchQuery]);

  // Header badge counts every overdue unit, not just the ones passing the filter.
  const overdueCount = useMemo(() => allRows.filter((row) => row.state === 'overdue').length, [allRows]);

  const detailItem = detailItemId ? equipmentItems.find((item) => item.id === detailItemId) : undefined;

  const closeDetail = () => {
    setSearchParams(
      (previous) => {
        previous.delete('item');
        return previous;
      },
      { replace: true },
    );
  };

  const openDetail = (itemId: string) => {
    setSearchParams(
      (previous) => {
        previous.set('item', itemId);
        return previous;
      },
      { replace: true },
    );
  };

  const toggleSelected = (itemId: string) => {
    setSelectedIds((previous) =>
      previous.includes(itemId) ? previous.filter((id) => id !== itemId) : [...previous, itemId],
    );
  };

  const selectableSelection = selectedIds.filter((id) => !openByItem.has(id));

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 md:px-6 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Package size={18} className="text-zinc-500" />
            Equipment
            {overdueCount > 0 && (
              <Badge color="red" className="ml-1">
                {overdueCount} overdue
              </Badge>
            )}
          </h1>
          <div className="flex items-center gap-2">
            {selectableSelection.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setCheckoutFor(selectableSelection)}>
                Check out {selectableSelection.length}
              </Button>
            )}
            {admin && (
              <>
                {selectedIds.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void markEquipmentLabelsPrinted(selectedIds);
                      setSelectedIds([]);
                    }}
                    title="Confirm the labels came out of the printer; this freezes their asset codes"
                  >
                    <Printer size={14} className="mr-1.5" />
                    Mark printed
                  </Button>
                )}
                <Button size="sm" onClick={() => setEditing({ category: 'camera', status: 'active' })}>
                  <Plus size={14} className="mr-1.5" />
                  New item
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 mt-3 overflow-x-auto">
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
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <Package size={32} className="text-zinc-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">
              {equipmentItems.length === 0 ? 'No equipment registered yet.' : 'Nothing matches this filter.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-black border-b border-zinc-200 dark:border-zinc-800">
              <tr className="text-left text-xs text-zinc-500">
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">Holder</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Since</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Due back</th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">Purpose</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, open, state }) => {
                const holder = open?.holderId ? memberById.get(open.holderId) : undefined;
                const badge = STATE_BADGE[state];
                return (
                  <tr
                    key={item.id}
                    className="border-b border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  >
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelected(item.id)}
                        aria-label={`Select ${item.assetCode}`}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => openDetail(item.id)}
                        className="font-mono text-xs font-semibold hover:underline"
                      >
                        {item.assetCode}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-zinc-900 dark:text-white">{item.name}</span>
                      {repairFlagged.has(item.id) && (
                        <AlertTriangle size={13} className="inline ml-1.5 text-amber-500" aria-label="Needs repair" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge color={badge.color}>{badge.label}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {open ? (
                        <span className="flex items-center gap-1.5">
                          <Avatar src={holder?.avatar} alt={open.holderName} size="sm" />
                          <span className="truncate">{open.holderName}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell text-zinc-500 text-xs">
                      {open ? formatWhen(open.checkedOutAt) : '—'}
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell text-xs">
                      {open?.expectedReturnAt ? (
                        <span
                          className={
                            state === 'overdue' ? 'text-red-600 dark:text-red-400 font-medium' : 'text-zinc-500'
                          }
                        >
                          {formatWhen(open.expectedReturnAt)}
                        </span>
                      ) : open ? (
                        <span className="text-zinc-400">Long-term</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell text-zinc-500 text-xs truncate max-w-[180px]">
                      {open?.purpose || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {open ? (
                          <>
                            <IconButton size="sm" title="Return" onClick={() => setCheckinFor(open)}>
                              <Undo2 size={14} />
                            </IconButton>
                            <IconButton size="sm" title="Hand over" onClick={() => setTransferFor(open)}>
                              <ArrowRightLeft size={14} />
                            </IconButton>
                          </>
                        ) : (
                          state === 'available' && (
                            <Button size="sm" variant="ghost" onClick={() => setCheckoutFor([item.id])}>
                              Take
                            </Button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {detailItem && (
        <ItemDetailModal
          item={detailItem}
          open={openByItem.get(detailItem.id) ?? null}
          admin={admin}
          onClose={closeDetail}
          onEdit={() => setEditing(detailItem)}
          loadHistory={loadEquipmentHistory}
        />
      )}

      {editing && (
        <ItemFormModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={async (draft) => {
            const saved = await saveEquipmentItem(draft);
            if (saved) setEditing(null);
          }}
          onDelete={
            editing.id
              ? () => {
                  removeEquipmentItem(editing.id!);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}

      {checkoutFor && (
        <CheckoutModal
          itemIds={checkoutFor}
          items={equipmentItems}
          members={members}
          currentUser={currentUser}
          admin={admin}
          onClose={() => setCheckoutFor(null)}
          onSubmit={async (input) => {
            const ok = await checkoutEquipment({ ...input, itemIds: checkoutFor });
            if (ok) {
              setCheckoutFor(null);
              setSelectedIds([]);
            }
          }}
        />
      )}

      {checkinFor && (
        <CheckinModal
          checkout={checkinFor}
          item={equipmentItems.find((item) => item.id === checkinFor.itemId)}
          onClose={() => setCheckinFor(null)}
          onSubmit={async (options) => {
            const ok = await checkinEquipment(checkinFor.id, options);
            if (ok) setCheckinFor(null);
          }}
        />
      )}

      {transferFor && (
        <TransferModal
          checkout={transferFor}
          item={equipmentItems.find((item) => item.id === transferFor.itemId)}
          members={members}
          onClose={() => setTransferFor(null)}
          onSubmit={async (newHolderId) => {
            const ok = await transferEquipment(transferFor.id, newHolderId);
            if (ok) setTransferFor(null);
          }}
        />
      )}
    </div>
  );
};

// --- Item detail + custody history ---

interface ItemDetailModalProps {
  item: EquipmentItem;
  open: EquipmentCheckout | null;
  admin: boolean;
  onClose: () => void;
  onEdit: () => void;
  loadHistory: (itemId: string) => Promise<EquipmentCheckout[]>;
}

const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ item, open, admin, onClose, onEdit, loadHistory }) => {
  const [history, setHistory] = useState<EquipmentCheckout[] | null>(null);

  // Fetched on demand: the store only carries open + repair-flagged checkouts.
  React.useEffect(() => {
    let cancelled = false;
    loadHistory(item.id).then((rows) => {
      if (!cancelled) setHistory(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, loadHistory]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${item.assetCode} — ${item.name}`}
      size="lg"
      headerActions={
        admin ? (
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Edit
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Detail label="Category" value={item.category} />
          <Detail label="Status" value={item.status} />
          <Detail label="Serial" value={item.serialNumber || '—'} />
          <Detail label="Labels" value={item.labelsPrintedAt ? formatDateEU(item.labelsPrintedAt) : 'Not printed'} />
        </div>

        {item.notes && <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.notes}</p>}

        {open && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-sm">
            <p className="font-medium text-zinc-900 dark:text-white">Currently with {open.holderName}</p>
            <p className="text-xs text-zinc-500 mt-1">
              Since {formatWhen(open.checkedOutAt)} ·{' '}
              {open.expectedReturnAt ? `due ${formatWhen(open.expectedReturnAt)}` : 'long-term assignment'}
            </p>
            {open.purpose && <p className="text-xs text-zinc-500 mt-1">{open.purpose}</p>}
          </div>
        )}

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Custody history</h3>
          {history === null ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-zinc-400">This unit has never been checked out.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="text-sm border-l-2 border-zinc-200 dark:border-zinc-800 pl-3 py-0.5 flex flex-wrap gap-x-2"
                >
                  <span className="font-medium text-zinc-900 dark:text-white">{entry.holderName}</span>
                  <span className="text-xs text-zinc-500">
                    {formatWhen(entry.checkedOutAt)} → {entry.checkedInAt ? formatWhen(entry.checkedInAt) : 'still out'}
                  </span>
                  {entry.purpose && <span className="text-xs text-zinc-400 w-full">{entry.purpose}</span>}
                  {entry.checkinNote && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 w-full">
                      {entry.needsRepair ? '⚠ ' : ''}
                      {entry.checkinNote}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
};

const Detail: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
    <p className="text-zinc-900 dark:text-white capitalize">{value}</p>
  </div>
);

// --- Admin item form ---

interface ItemFormModalProps {
  item: Partial<EquipmentItem>;
  onClose: () => void;
  onSave: (draft: Partial<EquipmentItem> & { id?: string }) => Promise<void>;
  onDelete?: () => void;
}

const ItemFormModal: React.FC<ItemFormModalProps> = ({ item, onClose, onSave, onDelete }) => {
  const [draft, setDraft] = useState<Partial<EquipmentItem>>(item);
  const [saving, setSaving] = useState(false);

  const codeValid = /^[A-Z]{2,4}-\d{3}$/.test(draft.assetCode || '');
  const canSave = codeValid && (draft.name || '').trim().length > 0 && !saving;
  // Printed stickers encode the code; the DB refuses the change until an admin
  // deliberately clears the print stamp.
  const codeLocked = Boolean(item.id && item.labelsPrintedAt);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={item.id ? 'Edit equipment' : 'New equipment'}
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
        <FormField label="Asset code" required>
          <Input
            value={draft.assetCode || ''}
            disabled={codeLocked}
            placeholder="CAM-012"
            onChange={(e) => setDraft({ ...draft, assetCode: e.target.value.toUpperCase() })}
          />
          <p className="text-xs text-zinc-500 mt-1">
            {codeLocked
              ? 'Labels are already printed. Clear the print stamp before changing the code.'
              : 'Two to four letters, a dash, three digits. The prefix is cosmetic — category is the source of truth.'}
          </p>
        </FormField>

        <FormField label="Name" required>
          <Input
            value={draft.name || ''}
            placeholder="Sony FX6 #2"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Category">
            <CustomSelect
              options={[...CATEGORIES]}
              value={draft.category || 'camera'}
              onChange={(value) => setDraft({ ...draft, category: value as EquipmentCategory })}
            />
          </FormField>
          <FormField label="Status">
            <CustomSelect
              options={['active', 'maintenance', 'retired', 'lost']}
              value={draft.status || 'active'}
              onChange={(value) => setDraft({ ...draft, status: value as EquipmentStatus })}
            />
          </FormField>
        </div>

        <FormField label="Serial number">
          <Input
            value={draft.serialNumber || ''}
            onChange={(e) => setDraft({ ...draft, serialNumber: e.target.value })}
          />
        </FormField>

        <FormField label="Notes">
          <Input value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </FormField>
      </div>
    </Modal>
  );
};

// --- Check out ---

interface CheckoutModalProps {
  itemIds: string[];
  items: EquipmentItem[];
  members: Member[];
  currentUser: Member;
  admin: boolean;
  onClose: () => void;
  onSubmit: (input: { holderId?: string; purpose?: string; expectedReturnAt: string | null }) => Promise<void>;
}

const CheckoutModal: React.FC<CheckoutModalProps> = ({
  itemIds,
  items,
  members,
  currentUser,
  admin,
  onClose,
  onSubmit,
}) => {
  const [holderId, setHolderId] = useState(currentUser.id);
  const [purpose, setPurpose] = useState('');
  const [longTerm, setLongTerm] = useState(false);
  const [returnAt, setReturnAt] = useState(defaultReturnAt);
  const [saving, setSaving] = useState(false);

  const chosen = items.filter((item) => itemIds.includes(item.id));
  const holderOptions = members
    .filter((member) => member.accessScope === 'full')
    .map((member) => ({ value: member.id, label: member.name }));

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={itemIds.length === 1 ? 'Take equipment' : `Take ${itemIds.length} items`}
      size="md"
      actions={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || (!longTerm && !returnAt)}
            onClick={async () => {
              setSaving(true);
              await onSubmit({
                holderId,
                purpose,
                expectedReturnAt: longTerm ? null : new Date(returnAt).toISOString(),
              });
              setSaving(false);
            }}
          >
            Take
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((item) => (
            <Badge key={item.id} color="zinc">
              {item.assetCode}
            </Badge>
          ))}
        </div>

        {admin && (
          <FormField label="Holder">
            <CustomSelect options={holderOptions} value={holderId} onChange={setHolderId} searchable />
          </FormField>
        )}

        <FormField label="Due back" required={!longTerm}>
          <Input
            type="datetime-local"
            value={returnAt}
            disabled={longTerm}
            onChange={(e) => setReturnAt(e.target.value)}
          />
          <label className="flex items-center gap-2 mt-2 text-xs text-zinc-500 cursor-pointer">
            <input type="checkbox" checked={longTerm} onChange={(e) => setLongTerm(e.target.checked)} />
            Long-term assignment (never counts as overdue)
          </label>
        </FormField>

        <FormField label="Shoot / assignment">
          <Input value={purpose} placeholder="Kharkiv shoot" onChange={(e) => setPurpose(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
};

// --- Check in ---

interface CheckinModalProps {
  checkout: EquipmentCheckout;
  item?: EquipmentItem;
  onClose: () => void;
  onSubmit: (options: { note?: string; needsRepair?: boolean }) => Promise<void>;
}

const CheckinModal: React.FC<CheckinModalProps> = ({ checkout, item, onClose, onSubmit }) => {
  const [note, setNote] = useState('');
  const [needsRepair, setNeedsRepair] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Return ${item?.assetCode ?? 'equipment'}`}
      size="sm"
      actions={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || (needsRepair && !note.trim())}
            onClick={async () => {
              setSaving(true);
              await onSubmit({ note: note.trim() || undefined, needsRepair });
              setSaving(false);
            }}
          >
            Return
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-zinc-500">
          Held by {checkout.holderName} since {formatWhen(checkout.checkedOutAt)}.
        </p>

        <FormField label={needsRepair ? 'What is wrong?' : 'Condition note'} required={needsRepair}>
          <Input
            value={note}
            placeholder={needsRepair ? 'Battery door cracked' : 'Optional'}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={needsRepair} onChange={(e) => setNeedsRepair(e.target.checked)} />
          <Wrench size={14} className="text-amber-500" />
          Needs repair
        </label>
      </div>
    </Modal>
  );
};

// --- Hand-to-hand transfer ---

interface TransferModalProps {
  checkout: EquipmentCheckout;
  item?: EquipmentItem;
  members: Member[];
  onClose: () => void;
  onSubmit: (newHolderId: string) => Promise<void>;
}

const TransferModal: React.FC<TransferModalProps> = ({ checkout, item, members, onClose, onSubmit }) => {
  const candidates = members
    .filter((member) => member.accessScope === 'full' && member.id !== checkout.holderId)
    .map((member) => ({ value: member.id, label: member.name }));
  const [newHolderId, setNewHolderId] = useState(candidates[0]?.value ?? '');
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Hand over ${item?.assetCode ?? 'equipment'}`}
      size="sm"
      actions={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || !newHolderId}
            onClick={async () => {
              setSaving(true);
              await onSubmit(newHolderId);
              setSaving(false);
            }}
          >
            Hand over
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-zinc-500">
          {checkout.holderName} currently holds this. Handing over closes their record and opens a new one, so the
          custody trail stays intact.
        </p>
        <FormField label="New holder" required>
          <CustomSelect options={candidates} value={newHolderId} onChange={setNewHolderId} searchable />
        </FormField>
      </div>
    </Modal>
  );
};

export default Equipment;
