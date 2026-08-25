import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Package, ArrowLeft, Wrench, ChevronDown, ChevronUp, ScanLine, X } from 'lucide-react';
import { Avatar } from './Avatar';
import { CustomSelect } from './CustomSelect';
import { toast } from 'sonner';
import { Badge, Button, Input } from './ui';
import { useDataStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { useNow } from '../hooks/useNow';
import {
  EQUIPMENT_STATE_BADGE,
  defaultReturnAt,
  deriveUnitState,
  extractAssetCode,
  formatWhen,
  normaliseAssetCode,
} from '../lib/equipment';
import { hapticFeedback, isTelegramWebview, readStartParam, scanQrCodes, scannerSupport } from '../lib/telegram';
import type { EquipmentCheckout, EquipmentItem } from '../types';

/**
 * Telegram's scanner is absent on Desktop, Web and pre-6.4 clients — and the SDK
 * still defines the method there, so we keep the reason around to explain the
 * missing button rather than leaving a dead end.
 */
function useScanner(): { available: boolean; reason: string; platform: string } {
  const [support, setSupport] = useState({ available: false, reason: '', platform: '' });
  useEffect(() => {
    let cancelled = false;
    scannerSupport().then(({ available, reason, platform }) => {
      if (!cancelled) setSupport({ available, reason, platform });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return support;
}

/**
 * The field surface: one unit, one decision, as few taps as possible.
 *
 * Reached by scanning a sticker (`/equipment/<code>`) or by typing a code
 * (`/equipment/scan`). The same component backs the Telegram Mini App and a
 * plain mobile browser — Telegram only changes how the code arrives.
 */
const EquipmentScan: React.FC = () => {
  const { assetCode: rawCode } = useParams<{ assetCode: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const now = useNow();

  const { equipmentItems, equipmentCheckouts, members, checkoutEquipment, checkinEquipment, transferEquipment } =
    useDataStore(
      useShallow((s) => ({
        equipmentItems: s.equipmentItems,
        equipmentCheckouts: s.equipmentCheckouts,
        members: s.members,
        checkoutEquipment: s.checkoutEquipment,
        checkinEquipment: s.checkinEquipment,
        transferEquipment: s.transferEquipment,
      })),
    );

  const scanner = useScanner();
  const code = rawCode ? normaliseAssetCode(decodeURIComponent(rawCode)) : null;

  // Telegram opens the configured Mini App URL (/equipment/scan) and delivers the
  // scanned sticker separately, as ?startapp=. Hop to that unit so a sticker scan
  // lands on the item rather than on the manual-entry form.
  useEffect(() => {
    if (code) return;
    const fromStart = readStartParam();
    const parsed = fromStart ? extractAssetCode(fromStart) : null;
    if (parsed) navigate(`/equipment/${parsed}`, { replace: true });
  }, [code, navigate]);
  const item = code ? equipmentItems.find((candidate) => candidate.assetCode === code) : undefined;
  const open = item ? (equipmentCheckouts.find((c) => c.itemId === item.id && !c.checkedInAt) ?? null) : null;

  const myOpen = useMemo(
    () => equipmentCheckouts.filter((c) => !c.checkedInAt && c.holderId === currentUser.id),
    [equipmentCheckouts, currentUser.id],
  );

  if (!code) {
    return (
      <CodeEntry
        myOpen={myOpen}
        items={equipmentItems}
        checkouts={equipmentCheckouts}
        scanner={scanner}
        onOpen={(next) => navigate(`/equipment/${next}`)}
        onTakeAll={(itemIds) =>
          checkoutEquipment({ itemIds, expectedReturnAt: new Date(defaultReturnAt()).toISOString() })
        }
      />
    );
  }

  if (!item) {
    return (
      <Shell>
        <div className="text-center space-y-4 py-8">
          <Package size={40} className="mx-auto text-zinc-300 dark:text-zinc-700" />
          <div>
            <p className="font-semibold text-zinc-900 dark:text-white">No unit with code {code}</p>
            <p className="text-sm text-zinc-500 mt-1">Check the sticker, or the unit may not be registered yet.</p>
          </div>
          <Button onClick={() => navigate('/equipment/scan')}>Enter a different code</Button>
        </div>
      </Shell>
    );
  }

  const state = deriveUnitState(item, open, now);
  const badge = EQUIPMENT_STATE_BADGE[state];
  const heldByMe = open?.holderId === currentUser.id;
  const holder = open?.holderId ? members.find((m) => m.id === open.holderId) : undefined;

  return (
    <Shell>
      <div className="space-y-5">
        <div className="text-center">
          <p className="font-mono text-xs text-zinc-500">{item.assetCode}</p>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white mt-0.5">{item.name}</h1>
          <div className="mt-2">
            <Badge color={badge.color}>{badge.label}</Badge>
          </div>
        </div>

        {open && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Avatar src={holder?.avatar} alt={open.holderName} size="sm" />
              <span className="font-medium text-zinc-900 dark:text-white">
                {heldByMe ? 'You have this' : open.holderName}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Since {formatWhen(open.checkedOutAt)}
              {open.expectedReturnAt ? ` · due ${formatWhen(open.expectedReturnAt)}` : ' · long-term assignment'}
            </p>
            {open.purpose && <p className="text-xs text-zinc-500 mt-1">{open.purpose}</p>}
          </div>
        )}

        {state === 'available' && <TakePanel onTake={(input) => checkoutEquipment({ ...input, itemIds: [item.id] })} />}

        {open && (
          <ReturnPanel
            heldByMe={heldByMe}
            holderName={open.holderName}
            members={members.filter((m) => m.accessScope === 'full' && m.id !== open.holderId)}
            onReturn={(options) => checkinEquipment(open.id, options)}
            onTransfer={(newHolderId) => transferEquipment(open.id, newHolderId)}
          />
        )}

        {(state === 'maintenance' || state === 'retired' || state === 'lost') && !open && (
          <p className="text-sm text-center text-zinc-500 py-2">
            This unit is marked <span className="font-medium">{item.status}</span> and cannot be taken out. Ask an admin
            if you need it.
          </p>
        )}
      </div>
    </Shell>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  // The Mini App has tabs of its own; a second back control there just competes
  // with them. In a browser, the useful escape from a unit card is another scan,
  // not the registry.
  const inTelegram = isTelegramWebview();
  const onUnitCard = location.pathname !== '/equipment/scan';
  const back = onUnitCard ? { to: '/equipment/scan', label: 'Scan another' } : { to: '/equipment', label: 'Registry' };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-md mx-auto px-4 py-5 safe-b">
        {!inTelegram && (
          <button
            onClick={() => navigate(back.to)}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft size={16} />
            {back.label}
          </button>
        )}
        {inTelegram && onUnitCard && (
          <button
            onClick={() => navigate('/equipment/scan')}
            className="flex items-center gap-1.5 text-sm text-zinc-500 mb-4"
          >
            <ArrowLeft size={16} />
            Scan another
          </button>
        )}
        {children}
      </div>
    </div>
  );
};

// --- Manual entry + a shortcut to return what you already hold ---

const CodeEntry: React.FC<{
  myOpen: EquipmentCheckout[];
  items: EquipmentItem[];
  checkouts: EquipmentCheckout[];
  scanner: { available: boolean; reason: string; platform: string };
  onOpen: (code: string) => void;
  onTakeAll: (itemIds: string[]) => Promise<boolean>;
}> = ({ myOpen, items, checkouts, scanner, onOpen, onTakeAll }) => {
  const [value, setValue] = useState('');
  const [basket, setBasket] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Accepts a bare code or a pasted t.me deep link.
  const parsed = extractAssetCode(value);

  const takenItemIds = useMemo(
    () => new Set(checkouts.filter((c) => !c.checkedInAt).map((c) => c.itemId)),
    [checkouts],
  );
  const basketItems = basket
    .map((code) => items.find((item) => item.assetCode === code))
    .filter((item): item is EquipmentItem => Boolean(item));

  /**
   * Every accepted scan CLOSES the popup. The first field test proved why: the
   * camera covers the whole screen, so a basket growing behind it reads as
   * "nothing happened". Closing lands you on the updated basket, the button
   * turns into "Scan next", and bulk checkout stays two taps per extra item —
   * scan, see it counted, scan again.
   */
  const startScanning = () => {
    void scanQrCodes((raw) => {
      const code = extractAssetCode(raw);
      // Not one of our stickers — keep hunting, the frame just wasn't right yet.
      if (!code) return false;
      const item = items.find((candidate) => candidate.assetCode === code);
      if (!item) {
        void hapticFeedback('error');
        toast.error(`${code} is not in the registry`);
        return true;
      }
      if (takenItemIds.has(item.id) || item.status !== 'active') {
        // Scanning a unit that cannot be taken means the person wants THAT unit
        // — almost always to return it. Open its card instead of ignoring them.
        void hapticFeedback('success');
        onOpen(item.assetCode);
        return true;
      }
      void hapticFeedback('success');
      setBasket((previous) => (previous.includes(code) ? previous : [...previous, code]));
      return true;
    }).then((started) => {
      // Some clients throw instead of no-opping; say so rather than looking dead.
      if (!started) toast.error('Scanner unavailable here — type the code instead');
    });
  };

  return (
    <Shell>
      <div className="space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Take or return gear</h1>
          <p className="text-sm text-zinc-500 mt-1">Scan a sticker, or type the code printed under the QR.</p>
        </div>

        {scanner.available ? (
          <Button onClick={startScanning} className="w-full py-4 text-base">
            <ScanLine size={18} className="mr-2" />
            {basketItems.length > 0 ? 'Scan next' : 'Scan stickers'}
          </Button>
        ) : (
          scanner.reason && (
            <div className="text-center">
              <p className="text-xs text-zinc-500">{scanner.reason}</p>
              {/* Detected platform, so a report of "it still does not work" can
                  be diagnosed without guessing. */}
              <p className="text-[10px] text-zinc-400 mt-0.5">detected: {scanner.platform}</p>
            </div>
          )
        )}

        {basketItems.length > 0 && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Scanned ({basketItems.length})
            </p>
            <div className="space-y-1">
              {basketItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-xs text-zinc-500 mr-2">{item.assetCode}</span>
                    {item.name}
                  </span>
                  <button
                    onClick={() => setBasket((previous) => previous.filter((code) => code !== item.assetCode))}
                    aria-label={`Remove ${item.assetCode}`}
                    className="shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <Button
              className="w-full py-3"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await onTakeAll(basketItems.map((item) => item.id));
                setBusy(false);
                if (ok) setBasket([]);
              }}
            >
              Take all {basketItems.length}
            </Button>
            <p className="text-[11px] text-zinc-400 text-center">Due back today 18:00 — change it per unit after.</p>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed) onOpen(parsed);
          }}
          className="space-y-3"
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="CAM-012"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="text-center font-mono text-lg py-3"
            aria-label="Asset code"
          />
          <Button type="submit" variant="ghost" disabled={!parsed} className="w-full py-3">
            Open unit
          </Button>
        </form>

        {myOpen.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">With you right now</h2>
            <div className="space-y-1.5">
              {myOpen.map((checkout) => {
                const item = items.find((candidate) => candidate.id === checkout.itemId);
                if (!item) return null;
                return (
                  <button
                    key={checkout.id}
                    onClick={() => onOpen(item.assetCode)}
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">
                        {item.name}
                      </span>
                      <span className="block font-mono text-xs text-zinc-500">{item.assetCode}</span>
                    </span>
                    <span className="text-xs text-zinc-400 shrink-0">Return →</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
};

// --- Take ---

const TakePanel: React.FC<{
  onTake: (input: { purpose?: string; expectedReturnAt: string | null }) => Promise<boolean>;
}> = ({ onTake }) => {
  const [expanded, setExpanded] = useState(false);
  const [returnAt, setReturnAt] = useState(defaultReturnAt);
  const [purpose, setPurpose] = useState('');
  const [longTerm, setLongTerm] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <Button
        className="w-full py-4 text-base"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onTake({
            purpose: purpose.trim() || undefined,
            expectedReturnAt: longTerm ? null : new Date(returnAt).toISOString(),
          });
          setBusy(false);
        }}
      >
        Take it
      </Button>

      <button
        onClick={() => setExpanded((previous) => !previous)}
        className="w-full flex items-center justify-center gap-1 text-xs text-zinc-500 py-1"
      >
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {expanded ? 'Hide details' : 'Due back today 18:00 · change'}
      </button>

      {expanded && (
        <div className="space-y-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
          <Input
            type="datetime-local"
            value={returnAt}
            disabled={longTerm}
            onChange={(e) => setReturnAt(e.target.value)}
            aria-label="Due back"
          />
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            <input type="checkbox" checked={longTerm} onChange={(e) => setLongTerm(e.target.checked)} />
            Long-term assignment (never overdue)
          </label>
          <Input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Shoot or assignment (optional)"
            aria-label="Purpose"
          />
        </div>
      )}
    </div>
  );
};

// --- Return / hand over ---

const ReturnPanel: React.FC<{
  heldByMe: boolean;
  holderName: string;
  members: { id: string; name: string }[];
  onReturn: (options: { note?: string; needsRepair?: boolean }) => Promise<boolean>;
  onTransfer: (newHolderId: string) => Promise<boolean>;
}> = ({ heldByMe, holderName, members, onReturn, onTransfer }) => {
  const [note, setNote] = useState('');
  const [needsRepair, setNeedsRepair] = useState(false);
  const [handingOver, setHandingOver] = useState(false);
  const [newHolderId, setNewHolderId] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <Button
        className="w-full py-4 text-base"
        disabled={busy || (needsRepair && !note.trim())}
        onClick={async () => {
          setBusy(true);
          await onReturn({ note: note.trim() || undefined, needsRepair });
          setBusy(false);
        }}
      >
        {heldByMe ? 'Return it' : `Return for ${holderName}`}
      </Button>

      <label className="flex items-center justify-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 py-1">
        <input type="checkbox" checked={needsRepair} onChange={(e) => setNeedsRepair(e.target.checked)} />
        <Wrench size={14} className="text-amber-500" />
        Something is wrong with it
      </label>

      {needsRepair && (
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What is wrong? (required)"
          aria-label="Damage note"
        />
      )}

      {members.length > 0 && (
        <>
          <button onClick={() => setHandingOver((previous) => !previous)} className="w-full text-xs text-zinc-500 py-1">
            {handingOver ? 'Cancel hand-over' : 'Hand over to someone else instead'}
          </button>
          {handingOver && (
            <div className="space-y-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
              <CustomSelect
                options={members.map((m) => ({ value: m.id, label: m.name }))}
                value={newHolderId}
                onChange={setNewHolderId}
                placeholder="Who is taking it?"
                searchable
              />
              <Button
                variant="primary"
                className="w-full py-3"
                disabled={busy || !newHolderId}
                onClick={async () => {
                  setBusy(true);
                  const ok = await onTransfer(newHolderId);
                  setBusy(false);
                  if (ok) setHandingOver(false);
                }}
              >
                Hand over
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EquipmentScan;
