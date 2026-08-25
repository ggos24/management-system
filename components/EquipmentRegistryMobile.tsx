import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { ChevronRight, ClipboardCheck, Package } from 'lucide-react';
import { Avatar } from './Avatar';
import { Badge, Button, Input } from './ui';
import { useDataStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { useNow } from '../hooks/useNow';
import { hapticFeedback } from '../lib/telegram';
import { EQUIPMENT_STATE_BADGE, deriveUnitState, formatWhen } from '../lib/equipment';
import type { EquipmentCheckout, EquipmentItem } from '../types';

interface UnitRowProps {
  item: EquipmentItem;
  subtitle: React.ReactNode;
  trailing?: React.ReactNode;
  onOpen: () => void;
}

const UnitRow: React.FC<UnitRowProps> = ({ item, subtitle, trailing, onOpen }) => (
  <div
    role="button"
    tabIndex={0}
    onClick={onOpen}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpen();
      }
    }}
    className="w-full flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer"
  >
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{item.name}</p>
      <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1.5 min-w-0">
        <span className="font-mono shrink-0">{item.assetCode}</span>
        {subtitle}
      </p>
    </div>
    {trailing ?? <ChevronRight size={16} className="text-zinc-300 dark:text-zinc-600 shrink-0" />}
  </div>
);

const Section: React.FC<{ title: string; count: number; children: React.ReactNode }> = ({ title, count, children }) => (
  <div>
    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
      {title} ({count})
    </h2>
    <div className="space-y-1.5">{children}</div>
  </div>
);

/**
 * The registry as a phone sees it — used inside the Telegram Mini App.
 *
 * The desktop table answers a manager's questions; on a phone in the field the
 * questions are different and simpler: what is on me, what can I grab, who has
 * the rest. So this is three lists in that order of urgency, with returning
 * your own gear a single tap — the tap-through card stays available for notes,
 * repair flags and hand-overs.
 *
 * No checkboxes, no item CRUD, no label printing: those are desk work, and the
 * desktop registry keeps them.
 */
const EquipmentRegistryMobile: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const now = useNow();
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  // Return sits a thumb's width from a tappable row, so it arms first and
  // commits second. Cheaper than a modal, and the label change is its own
  // explanation.
  const [armedId, setArmedId] = useState<string | null>(null);

  useEffect(() => {
    if (!armedId) return;
    // Disarm on its own: a stray tap should not leave a live "Confirm" waiting
    // for the next stray tap.
    const timer = window.setTimeout(() => setArmedId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [armedId]);

  const { equipmentItems, equipmentCheckouts, members, checkinEquipment } = useDataStore(
    useShallow((s) => ({
      equipmentItems: s.equipmentItems,
      equipmentCheckouts: s.equipmentCheckouts,
      members: s.members,
      checkinEquipment: s.checkinEquipment,
    })),
  );

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const rows = useMemo(() => {
    const openByItem = new Map<string, EquipmentCheckout>();
    for (const checkout of equipmentCheckouts) {
      if (!checkout.checkedInAt) openByItem.set(checkout.itemId, checkout);
    }
    const trimmed = query.trim().toLowerCase();
    return equipmentItems
      .filter((item) => !trimmed || `${item.assetCode} ${item.name}`.toLowerCase().includes(trimmed))
      .map((item) => {
        const open = openByItem.get(item.id) ?? null;
        return { item, open, state: deriveUnitState(item, open, now) };
      });
  }, [equipmentItems, equipmentCheckouts, query, now]);

  const mine = rows
    .filter(({ open }) => open?.holderId === currentUser.id)
    .sort((a, b) => (a.open?.expectedReturnAt ?? '9999').localeCompare(b.open?.expectedReturnAt ?? '9999'));
  const available = rows.filter(({ state }) => state === 'available');
  const withOthers = rows.filter(({ open }) => open && open.holderId !== currentUser.id);
  const inactive = rows.filter(({ open, state }) => !open && state !== 'available');

  const dueLine = (open: EquipmentCheckout, overdue: boolean): string => {
    if (!open.expectedReturnAt) return 'long-term';
    return overdue ? `was due ${formatWhen(open.expectedReturnAt)}` : `due ${formatWhen(open.expectedReturnAt)}`;
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-md mx-auto px-4 py-5 safe-b space-y-6">
        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search gear…"
            aria-label="Search equipment"
          />
          <Button variant="ghost" size="sm" onClick={() => navigate('/equipment/audit')} className="shrink-0">
            <ClipboardCheck size={14} className="mr-1" />
            Audit
          </Button>
        </div>

        {mine.length > 0 && (
          <Section title="With you" count={mine.length}>
            {mine.map(({ item, open, state }) => (
              <UnitRow
                key={item.id}
                item={item}
                onOpen={() => navigate(`/equipment/${item.assetCode}`)}
                subtitle={
                  <span className={state === 'overdue' ? 'text-red-600 dark:text-red-400 font-medium' : undefined}>
                    {dueLine(open!, state === 'overdue')}
                  </span>
                }
                trailing={
                  <Button
                    size="sm"
                    variant={armedId === item.id ? 'primary' : 'ghost'}
                    disabled={busyId === item.id}
                    aria-label={
                      armedId === item.id ? `Confirm returning ${item.assetCode}` : `Return ${item.assetCode}`
                    }
                    onClick={(e) => {
                      // The row itself opens the card (notes, repair flag,
                      // hand-over); this button is the no-questions fast path.
                      e.stopPropagation();
                      if (armedId !== item.id) {
                        void hapticFeedback('warning');
                        setArmedId(item.id);
                        return;
                      }
                      setArmedId(null);
                      setBusyId(item.id);
                      void checkinEquipment(open!.id, {}).finally(() => setBusyId(null));
                    }}
                    className={`shrink-0 ${armedId === item.id ? '' : 'border border-zinc-200 dark:border-zinc-700 rounded-lg'}`}
                  >
                    {armedId === item.id ? 'Confirm' : 'Return'}
                  </Button>
                }
              />
            ))}
          </Section>
        )}

        {available.length > 0 && (
          <Section title="Available" count={available.length}>
            {available.map(({ item }) => (
              <UnitRow
                key={item.id}
                item={item}
                onOpen={() => navigate(`/equipment/${item.assetCode}`)}
                subtitle={<span className="capitalize">{item.category}</span>}
              />
            ))}
          </Section>
        )}

        {withOthers.length > 0 && (
          <Section title="With others" count={withOthers.length}>
            {withOthers.map(({ item, open, state }) => {
              const holder = open?.holderId ? memberById.get(open.holderId) : undefined;
              return (
                <UnitRow
                  key={item.id}
                  item={item}
                  onOpen={() => navigate(`/equipment/${item.assetCode}`)}
                  subtitle={
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Avatar src={holder?.avatar} alt={open!.holderName} size="xs" />
                      <span className="truncate">{open!.holderName}</span>
                      <span
                        className={
                          state === 'overdue' ? 'text-red-600 dark:text-red-400 font-medium shrink-0' : 'shrink-0'
                        }
                      >
                        · {dueLine(open!, state === 'overdue')}
                      </span>
                    </span>
                  }
                />
              );
            })}
          </Section>
        )}

        {inactive.length > 0 && (
          <Section title="Out of circulation" count={inactive.length}>
            {inactive.map(({ item, state }) => (
              <UnitRow
                key={item.id}
                item={item}
                onOpen={() => navigate(`/equipment/${item.assetCode}`)}
                subtitle={
                  <Badge color={EQUIPMENT_STATE_BADGE[state].color}>{EQUIPMENT_STATE_BADGE[state].label}</Badge>
                }
              />
            ))}
          </Section>
        )}

        {rows.length === 0 && (
          <div className="text-center py-10">
            <Package size={32} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">
              {equipmentItems.length === 0 ? 'No equipment registered yet.' : 'Nothing matches your search.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EquipmentRegistryMobile;
