import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, CircleCheck, CreditCard, ExternalLink, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { CustomSelect } from './CustomSelect';
import { SimpleDatePicker } from './SimpleDatePicker';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { Badge, Button, Card, Input, FormField, IconButton } from './ui';
import { useDataStore } from '../stores/dataStore';
import { useNow } from '../hooks/useNow';
import { formatDateEU } from '../lib/utils';
import {
  BILLING_PERIODS,
  BILLING_PERIOD_LABEL,
  BILLING_PERIOD_SUFFIX,
  CURRENCIES,
  DUE_SOON_DAYS,
  SUBSCRIPTION_CATEGORIES,
  SUBSCRIPTION_CATEGORY_LABEL,
  SUBSCRIPTION_STATE_BADGE,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_LABEL,
  countdownClass,
  daysUntil,
  deriveSubscriptionState,
  describeCountdown,
  formatMoney,
  rollForward,
  summarizeSpend,
  todayDateOnly,
  type SubscriptionState,
} from '../lib/renewals';
import type {
  BillingPeriod,
  Currency,
  Member,
  Subscription,
  SubscriptionCategory,
  SubscriptionPayment,
  SubscriptionStatus,
} from '../types';

type FilterKey = 'all' | 'due_soon' | 'overdue' | 'active' | 'paused' | 'cancelled';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'due_soon', label: 'Due soon' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'cancelled', label: 'Cancelled' },
];

/** Attention first, cancelled last; inside a group the nearest date wins. */
const STATE_RANK: Record<SubscriptionState, number> = {
  overdue: 0,
  due_soon: 0,
  scheduled: 0,
  unscheduled: 1,
  paused: 2,
  cancelled: 3,
};

const textareaClass =
  'w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 text-base md:text-sm text-zinc-900 dark:text-white resize-none';

/** Accepts "59,99" as well as "59.99"; NaN for anything else. */
function parseAmount(text: string): number {
  const trimmed = text.trim().replace(',', '.');
  return trimmed === '' ? Number.NaN : Number(trimmed);
}

interface Row {
  item: Subscription;
  state: SubscriptionState;
  days: number | null;
}

interface PaidInput {
  paidAt: string;
  amount?: number;
  note?: string;
}

export const SubscriptionsTool: React.FC = () => {
  const navigate = useNavigate();
  const {
    subscriptions,
    members,
    saveSubscription,
    removeSubscription,
    markSubscriptionPaid,
    loadSubscriptionPayments,
    removeSubscriptionPayment,
  } = useDataStore(
    useShallow((s) => ({
      subscriptions: s.subscriptions,
      members: s.members,
      saveSubscription: s.saveSubscription,
      removeSubscription: s.removeSubscription,
      markSubscriptionPaid: s.markSubscriptionPaid,
      loadSubscriptionPayments: s.loadSubscriptionPayments,
      removeSubscriptionPayment: s.removeSubscriptionPayment,
    })),
  );
  const now = useNow();

  const [filter, setFilter] = useState<FilterKey>('all');
  // Local, not the header's global search: that box only renders on task views.
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | SubscriptionCategory>('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Subscription> | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Subscription | null>(null);

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const memberName = (id: string | null) => (id ? memberById.get(id)?.name : undefined);

  const allRows = useMemo<Row[]>(
    () =>
      subscriptions.map((item) => ({
        item,
        state: deriveSubscriptionState(item, now),
        days: daysUntil(item.nextPaymentDate, now),
      })),
    [subscriptions, now],
  );

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allRows
      .filter(({ item, state }) => {
        if (query && !`${item.serviceName} ${item.plan} ${item.accountEmail}`.toLowerCase().includes(query)) {
          return false;
        }
        if (category !== 'all' && item.category !== category) return false;
        switch (filter) {
          case 'due_soon':
            return state === 'due_soon';
          case 'overdue':
            return state === 'overdue';
          case 'active':
            return item.status === 'active';
          case 'paused':
            return state === 'paused';
          case 'cancelled':
            return state === 'cancelled';
          default:
            return true;
        }
      })
      .sort(
        (a, b) =>
          STATE_RANK[a.state] - STATE_RANK[b.state] ||
          (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER) ||
          a.item.serviceName.localeCompare(b.item.serviceName),
      );
  }, [allRows, filter, search, category]);

  const spend = useMemo(() => summarizeSpend(subscriptions), [subscriptions]);
  // Header badges count everything, not just the rows passing the filter.
  const dueSoonCount = allRows.filter((row) => row.state === 'due_soon').length;
  const overdueCount = allRows.filter((row) => row.state === 'overdue').length;

  const filtersActive = filter !== 'all' || category !== 'all' || search.trim().length > 0;
  const resetFilters = () => {
    setFilter('all');
    setCategory('all');
    setSearch('');
  };

  const detail = detailId ? subscriptions.find((candidate) => candidate.id === detailId) : undefined;
  const paying = payingId ? subscriptions.find((candidate) => candidate.id === payingId) : undefined;

  const handleMarkPaid = async (subscription: Subscription, input: PaidInput) => {
    const ok = await markSubscriptionPaid(subscription.id, input);
    if (!ok) return false;
    const updated = useDataStore.getState().subscriptions.find((candidate) => candidate.id === subscription.id);
    toast.success(
      updated?.nextPaymentDate
        ? `Payment recorded — next due ${formatDateEU(updated.nextPaymentDate)}`
        : 'Payment recorded',
    );
    return true;
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
              <CreditCard size={18} className="text-zinc-500" />
              Subscriptions
              {dueSoonCount > 0 && (
                <Badge color="amber" className="ml-1">
                  {dueSoonCount} due soon
                </Badge>
              )}
              {overdueCount > 0 && <Badge color="red">{overdueCount} overdue</Badge>}
            </h1>
          </div>
          <Button
            size="sm"
            onClick={() =>
              setEditing({ category: 'software', currency: 'USD', billingPeriod: 'monthly', status: 'active' })
            }
          >
            <Plus size={14} className="mr-1.5" />
            New subscription
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
              placeholder="Service, plan or account…"
              aria-label="Search subscriptions"
              className="pl-8 py-1.5 text-xs"
            />
          </div>

          <div className="w-44">
            <CustomSelect
              options={[
                { value: 'all', label: 'All categories' },
                ...SUBSCRIPTION_CATEGORIES.map((entry) => ({
                  value: entry,
                  label: SUBSCRIPTION_CATEGORY_LABEL[entry],
                })),
              ]}
              value={category}
              onChange={(value) => setCategory(value as 'all' | SubscriptionCategory)}
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
        {subscriptions.length > 0 && (
          <div className="px-4 md:px-6 pt-4 pb-2 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {spend.map((entry) => (
              <Card key={entry.currency} padding="sm">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {entry.currency} · {entry.count} recurring
                </p>
                <p className="text-lg font-semibold text-zinc-900 dark:text-white">
                  {formatMoney(entry.monthly, entry.currency)}
                  <span className="text-xs font-normal text-zinc-500"> / month</span>
                </p>
                <p className="text-xs text-zinc-500">{formatMoney(entry.yearly, entry.currency)} / year</p>
              </Card>
            ))}
            <Card padding="sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Next {DUE_SOON_DAYS} days
              </p>
              <p className="text-lg font-semibold text-zinc-900 dark:text-white">{dueSoonCount + overdueCount}</p>
              <p className={`text-xs ${overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'}`}>
                {overdueCount > 0 ? `${overdueCount} already overdue` : 'payments due'}
              </p>
            </Card>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <CreditCard size={32} className="text-zinc-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">
              {subscriptions.length === 0 ? 'No subscriptions recorded yet.' : 'Nothing matches these filters.'}
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
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Category</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Next payment</th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">Owner</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, state, days }) => {
                const owner = item.ownerId ? memberById.get(item.ownerId) : undefined;
                const badge = SUBSCRIPTION_STATE_BADGE[state];
                const dateClass = item.status === 'active' ? countdownClass(days, DUE_SOON_DAYS) : 'text-zinc-500';
                return (
                  <tr
                    key={item.id}
                    onClick={() => setDetailId(item.id)}
                    className="border-b border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2">
                      <span className="block text-zinc-900 dark:text-white">{item.serviceName}</span>
                      {item.plan && <span className="block text-[10px] text-zinc-400 truncate">{item.plan}</span>}
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell text-zinc-600 dark:text-zinc-300">
                      {SUBSCRIPTION_CATEGORY_LABEL[item.category]}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-zinc-900 dark:text-white">{formatMoney(item.amount, item.currency)}</span>
                      <span className="text-[10px] text-zinc-400 ml-1">
                        {BILLING_PERIOD_SUFFIX[item.billingPeriod]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {item.nextPaymentDate ? (
                        <>
                          <span className={dateClass}>{formatDateEU(item.nextPaymentDate)}</span>
                          <span className="block text-[10px] text-zinc-400">{describeCountdown(days)}</span>
                        </>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      {owner ? (
                        <span className="flex items-center gap-1.5">
                          <Avatar src={owner.avatar} alt={owner.name} size="sm" />
                          <span className="truncate">{owner.name}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge color={badge.color}>{badge.label}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {item.status === 'active' && (
                          <Button size="sm" variant="ghost" title="Mark as paid" onClick={() => setPayingId(item.id)}>
                            <CircleCheck size={14} className="mr-1" />
                            Paid
                          </Button>
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

      {detail && (
        <SubscriptionDetailModal
          subscription={detail}
          memberName={memberName}
          onClose={() => setDetailId(null)}
          onEdit={() => setEditing(detail)}
          onMarkPaid={() => setPayingId(detail.id)}
          loadPayments={loadSubscriptionPayments}
          removePayment={removeSubscriptionPayment}
        />
      )}

      {editing && (
        <SubscriptionFormModal
          item={editing}
          members={members}
          onClose={() => setEditing(null)}
          onSave={async (draft) => {
            const saved = await saveSubscription(draft);
            if (saved) setEditing(null);
          }}
          onDelete={
            editing.id
              ? () => {
                  const target = subscriptions.find((candidate) => candidate.id === editing.id);
                  setEditing(null);
                  if (target) setDeleting(target);
                }
              : undefined
          }
        />
      )}

      {paying && (
        <MarkPaidModal
          subscription={paying}
          onClose={() => setPayingId(null)}
          onSubmit={async (input) => {
            const ok = await handleMarkPaid(paying, input);
            if (ok) setPayingId(null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          title="Delete subscription"
          description={
            <>
              Remove <strong>{deleting.serviceName}</strong> and its payment history? This cannot be undone.
            </>
          }
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            removeSubscription(deleting.id);
            if (detailId === deleting.id) setDetailId(null);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
};

// --- Detail + payment history ---

interface SubscriptionDetailModalProps {
  subscription: Subscription;
  memberName: (id: string | null) => string | undefined;
  onClose: () => void;
  onEdit: () => void;
  onMarkPaid: () => void;
  loadPayments: (subscriptionId: string) => Promise<SubscriptionPayment[]>;
  removePayment: (paymentId: string) => Promise<boolean>;
}

const SubscriptionDetailModal: React.FC<SubscriptionDetailModalProps> = ({
  subscription,
  memberName,
  onClose,
  onEdit,
  onMarkPaid,
  loadPayments,
  removePayment,
}) => {
  const [payments, setPayments] = useState<SubscriptionPayment[] | null>(null);

  // Fetched on demand: the store carries subscriptions, not their ledgers. The
  // due date is in the deps so a payment recorded from this modal shows up.
  useEffect(() => {
    let cancelled = false;
    loadPayments(subscription.id).then((rows) => {
      if (!cancelled) setPayments(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [subscription.id, subscription.nextPaymentDate, loadPayments]);

  const links = [
    subscription.websiteUrl ? { label: 'Website', href: subscription.websiteUrl } : null,
    subscription.documentUrl ? { label: 'Invoice / contract', href: subscription.documentUrl } : null,
  ].filter((link): link is { label: string; href: string } => link !== null);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={subscription.serviceName}
      size="lg"
      headerActions={
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Detail
            label="Amount"
            value={`${formatMoney(subscription.amount, subscription.currency)} ${BILLING_PERIOD_SUFFIX[subscription.billingPeriod]}`}
          />
          <Detail
            label="Next payment"
            value={subscription.nextPaymentDate ? formatDateEU(subscription.nextPaymentDate) : '—'}
          />
          <Detail label="Status" value={SUBSCRIPTION_STATUS_LABEL[subscription.status]} />
          <Detail label="Category" value={SUBSCRIPTION_CATEGORY_LABEL[subscription.category]} />
          <Detail label="Plan" value={subscription.plan || '—'} />
          <Detail label="Owner" value={memberName(subscription.ownerId) || '—'} />
          <Detail label="Account" value={subscription.accountEmail || '—'} />
          <Detail label="Payment method" value={subscription.paymentMethod || '—'} />
        </div>

        {links.length > 0 && (
          <div className="flex flex-wrap gap-3 text-xs">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
              >
                <ExternalLink size={12} />
                {link.label}
              </a>
            ))}
          </div>
        )}

        {subscription.notes && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{subscription.notes}</p>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Payment history</h3>
            {subscription.status === 'active' && (
              <Button size="sm" variant="ghost" onClick={onMarkPaid}>
                <CircleCheck size={14} className="mr-1.5" />
                Mark as paid
              </Button>
            )}
          </div>
          {payments === null ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : payments.length === 0 ? (
            <p className="text-sm text-zinc-400">No payments recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className="text-sm border-l-2 border-zinc-200 dark:border-zinc-800 pl-3 py-0.5 flex items-start gap-2"
                >
                  <div className="flex-1 min-w-0 flex flex-wrap gap-x-2">
                    <span className="font-medium text-zinc-900 dark:text-white">
                      {formatMoney(payment.amount, payment.currency)}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {formatDateEU(payment.paidAt)}
                      {memberName(payment.recordedBy) ? ` · ${memberName(payment.recordedBy)}` : ''}
                    </span>
                    {payment.note && <span className="text-xs text-zinc-400 w-full">{payment.note}</span>}
                  </div>
                  <IconButton
                    size="sm"
                    title="Delete payment"
                    onClick={async () => {
                      const ok = await removePayment(payment.id);
                      if (ok) setPayments((prev) => (prev ? prev.filter((entry) => entry.id !== payment.id) : prev));
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-zinc-400 mt-2">
            Deleting a payment does not move the next payment date back — edit the date instead.
          </p>
        </div>
      </div>
    </Modal>
  );
};

const Detail: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
    <p className="text-zinc-900 dark:text-white truncate" title={value}>
      {value}
    </p>
  </div>
);

// --- Mark as paid ---

interface MarkPaidModalProps {
  subscription: Subscription;
  onClose: () => void;
  onSubmit: (input: PaidInput) => Promise<void>;
}

const MarkPaidModal: React.FC<MarkPaidModalProps> = ({ subscription, onClose, onSubmit }) => {
  const [paidAt, setPaidAt] = useState(() => todayDateOnly());
  const [amountText, setAmountText] = useState(String(subscription.amount));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const amount = parseAmount(amountText);
  const amountValid = Number.isFinite(amount) && amount >= 0;
  const projected = rollForward(subscription.nextPaymentDate, paidAt, subscription.billingPeriod);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Mark ${subscription.serviceName} as paid`}
      size="sm"
      actions={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || !amountValid || !paidAt}
            onClick={async () => {
              setSaving(true);
              await onSubmit({ paidAt, amount, note: note.trim() || undefined });
              setSaving(false);
            }}
          >
            Record payment
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Paid on" required>
            <SimpleDatePicker
              value={paidAt}
              onChange={(value) => setPaidAt(value || todayDateOnly())}
              placeholder="Pick a date"
            />
          </FormField>
          <FormField label="Amount" required>
            <Input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
            />
          </FormField>
        </div>
        <FormField label="Note">
          <Input value={note} placeholder="Invoice number, card used…" onChange={(e) => setNote(e.target.value)} />
        </FormField>
        <p className="text-xs text-zinc-500">
          {projected
            ? `Next payment moves to ${formatDateEU(projected)}.`
            : 'One-time purchase: nothing further will be scheduled.'}
        </p>
      </div>
    </Modal>
  );
};

// --- Admin form ---

interface SubscriptionFormModalProps {
  item: Partial<Subscription>;
  members: Member[];
  onClose: () => void;
  onSave: (draft: Partial<Subscription> & { id?: string }) => Promise<void>;
  onDelete?: () => void;
}

const SubscriptionFormModal: React.FC<SubscriptionFormModalProps> = ({ item, members, onClose, onSave, onDelete }) => {
  const [draft, setDraft] = useState<Partial<Subscription>>(item);
  const [amountText, setAmountText] = useState(item.amount !== undefined ? String(item.amount) : '');
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<Subscription>) => setDraft((prev) => ({ ...prev, ...patch }));

  const amount = parseAmount(amountText);
  const amountValid = Number.isFinite(amount) && amount >= 0;
  const canSave = (draft.serviceName || '').trim().length > 0 && amountValid && !saving;

  const ownerOptions = [
    { value: '', label: 'No owner' },
    ...members
      .filter((member) => member.accessScope === 'full')
      .map((member) => ({ value: member.id, label: member.name })),
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={item.id ? 'Edit subscription' : 'New subscription'}
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
                await onSave({ ...draft, amount });
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
        <FormField label="Service" required>
          <Input
            value={draft.serviceName || ''}
            placeholder="Adobe Creative Cloud"
            onChange={(e) => update({ serviceName: e.target.value })}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Category">
            <CustomSelect
              options={SUBSCRIPTION_CATEGORIES.map((entry) => ({
                value: entry,
                label: SUBSCRIPTION_CATEGORY_LABEL[entry],
              }))}
              value={draft.category || 'software'}
              onChange={(value) => update({ category: value as SubscriptionCategory })}
            />
          </FormField>
          <FormField label="Status">
            <CustomSelect
              options={SUBSCRIPTION_STATUSES.map((entry) => ({
                value: entry,
                label: SUBSCRIPTION_STATUS_LABEL[entry],
              }))}
              value={draft.status || 'active'}
              onChange={(value) => update({ status: value as SubscriptionStatus })}
            />
          </FormField>
        </div>

        <FormField label="Plan">
          <Input
            value={draft.plan || ''}
            placeholder="Teams, 5 seats"
            onChange={(e) => update({ plan: e.target.value })}
          />
        </FormField>

        <div className="grid grid-cols-3 gap-3">
          <FormField label="Amount" required>
            <Input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amountText}
              placeholder="59.99"
              onChange={(e) => setAmountText(e.target.value)}
            />
          </FormField>
          <FormField label="Currency">
            <CustomSelect
              options={[...CURRENCIES]}
              value={draft.currency || 'USD'}
              onChange={(value) => update({ currency: value as Currency })}
            />
          </FormField>
          <FormField label="Billing">
            <CustomSelect
              options={BILLING_PERIODS.map((entry) => ({ value: entry, label: BILLING_PERIOD_LABEL[entry] }))}
              value={draft.billingPeriod || 'monthly'}
              onChange={(value) => update({ billingPeriod: value as BillingPeriod })}
            />
          </FormField>
        </div>

        <FormField label="Next payment">
          <SimpleDatePicker
            value={draft.nextPaymentDate || ''}
            onChange={(value) => update({ nextPaymentDate: value || null })}
            placeholder="Nothing scheduled"
          />
          <p className="text-xs text-zinc-500 mt-1">“Mark as paid” moves this forward by one billing cycle.</p>
        </FormField>

        <FormField label="Owner">
          <CustomSelect
            options={ownerOptions}
            value={draft.ownerId || ''}
            onChange={(value) => update({ ownerId: value || null })}
            searchable
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Account email">
            <Input
              type="email"
              value={draft.accountEmail || ''}
              placeholder="billing@united24media.com"
              onChange={(e) => update({ accountEmail: e.target.value })}
            />
          </FormField>
          <FormField label="Payment method">
            <Input
              value={draft.paymentMethod || ''}
              placeholder="Corporate card •••• 4242"
              onChange={(e) => update({ paymentMethod: e.target.value })}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Website">
            <Input
              type="url"
              value={draft.websiteUrl || ''}
              placeholder="https://…"
              onChange={(e) => update({ websiteUrl: e.target.value })}
            />
          </FormField>
          <FormField label="Invoice / contract link">
            <Input
              type="url"
              value={draft.documentUrl || ''}
              placeholder="https://drive.google.com/…"
              onChange={(e) => update({ documentUrl: e.target.value })}
            />
          </FormField>
        </div>

        <FormField label="Notes">
          <textarea
            rows={3}
            className={textareaClass}
            value={draft.notes || ''}
            placeholder="Seats, who uses it, cancellation terms…"
            onChange={(e) => update({ notes: e.target.value })}
          />
        </FormField>
      </div>
    </Modal>
  );
};

export default SubscriptionsTool;
