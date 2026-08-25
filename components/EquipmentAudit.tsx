import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, ScanLine, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Input } from './ui';
import { useDataStore } from '../stores/dataStore';
import { extractAssetCode, normaliseAssetCode } from '../lib/equipment';
import { hapticFeedback, isTelegramWebview, scanQrCodes, scannerSupport } from '../lib/telegram';
import type { EquipmentItem } from '../types';

/**
 * Shelf audit — walking the racks with a phone, confirming what is physically
 * there.
 *
 * This is also the rollout QA gate: after stickering, every label gets scanned
 * once to prove the code on it resolves to the unit it is stuck to. Doing that
 * by typing codes would turn a walk into an afternoon, which is why the audit
 * lives here next to the scanner rather than in the desktop registry.
 *
 * Discrepancies surface on the spot: a unit the registry believes is out on a
 * shoot, found sitting on the shelf, can be checked in without leaving the aisle.
 */
const EquipmentAudit: React.FC = () => {
  const navigate = useNavigate();
  const [scanner, setScanner] = useState({ available: false, reason: '', platform: '' });
  const [seen, setSeen] = useState<string[]>([]);
  const [value, setValue] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const { equipmentItems, equipmentCheckouts, markItemVerified, checkinEquipment } = useDataStore(
    useShallow((s) => ({
      equipmentItems: s.equipmentItems,
      equipmentCheckouts: s.equipmentCheckouts,
      markItemVerified: s.markItemVerified,
      checkinEquipment: s.checkinEquipment,
    })),
  );

  React.useEffect(() => {
    let cancelled = false;
    scannerSupport().then(({ available, reason, platform }) => {
      if (!cancelled) setScanner({ available, reason, platform });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openByItem = useMemo(() => {
    const map = new Map<string, string>();
    for (const checkout of equipmentCheckouts) {
      if (!checkout.checkedInAt) map.set(checkout.itemId, checkout.id);
    }
    return map;
  }, [equipmentCheckouts]);

  // Dedupe lives in a ref, not state: the scanner fires qrTextReceived
  // continuously while the camera is on a code, and the popup's callback holds a
  // stale closure over `seen` — state-based dedupe would buzz and re-insert on
  // every frame.
  const seenRef = React.useRef<Set<string>>(new Set());

  const record = async (code: string): Promise<void> => {
    const item = equipmentItems.find((candidate) => candidate.assetCode === code);
    if (!item) return;
    if (seenRef.current.has(code)) return;
    seenRef.current.add(code);
    // The audit popup deliberately STAYS open — closing it per unit would make a
    // hundred-unit shelf walk unbearable — so the haptic tick is the only
    // immediate confirmation each sticker registered.
    void hapticFeedback('success');
    setSeen((previous) => (previous.includes(code) ? previous : [code, ...previous]));
    await markItemVerified(item.id);
  };

  const startScanning = () => {
    void scanQrCodes((raw) => {
      const code = extractAssetCode(raw);
      // Keep the popup open: the point is to walk a shelf in one pass.
      if (code) void record(code);
      return false;
    }, 'Scan every sticker — a buzz means it counted').then((started) => {
      if (!started) toast.error('Scanner unavailable here — type codes instead');
    });
  };

  const seenItems = seen
    .map((code) => equipmentItems.find((item) => item.assetCode === code))
    .filter((item): item is EquipmentItem => Boolean(item));
  const discrepancies = seenItems.filter((item) => openByItem.has(item.id));

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-md mx-auto px-4 py-5 safe-b space-y-5">
        {!isTelegramWebview() && (
          <button
            onClick={() => navigate('/equipment')}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          >
            <ArrowLeft size={16} />
            Registry
          </button>
        )}

        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Shelf audit</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Scan everything physically in front of you. Each scan records that the unit was seen today.
          </p>
        </div>

        {scanner.available ? (
          <Button onClick={startScanning} className="w-full py-4 text-base">
            <ScanLine size={18} className="mr-2" />
            Scan shelf
          </Button>
        ) : (
          <p className="text-xs text-zinc-500">
            {scanner.reason || 'No scanner here — type codes below instead.'}
            {scanner.platform && <span className="text-zinc-400"> (detected: {scanner.platform})</span>}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const code = normaliseAssetCode(value);
            if (equipmentItems.some((item) => item.assetCode === code)) {
              void record(code);
              setValue('');
            }
          }}
          className="flex gap-2"
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="CAM-012"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="font-mono text-center"
            aria-label="Asset code"
          />
          <Button type="submit" variant="ghost" className="shrink-0">
            Add
          </Button>
        </form>

        {discrepancies.length > 0 && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              <AlertTriangle size={13} />
              On the shelf but marked out ({discrepancies.length})
            </p>
            {discrepancies.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-mono text-xs mr-2">{item.assetCode}</span>
                  {item.name}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === item.id}
                  onClick={async () => {
                    const checkoutId = openByItem.get(item.id);
                    if (!checkoutId) return;
                    setBusyId(item.id);
                    await checkinEquipment(checkoutId, { note: 'Found on the shelf during an audit' });
                    setBusyId(null);
                  }}
                  className="shrink-0"
                >
                  Check in
                </Button>
              </div>
            ))}
          </div>
        )}

        {seenItems.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              Verified this session ({seenItems.length})
            </h2>
            <div className="space-y-1">
              {seenItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 text-sm">
                  <Check size={14} className="text-emerald-500 shrink-0" />
                  <span className="font-mono text-xs text-zinc-500">{item.assetCode}</span>
                  <span className="truncate text-zinc-700 dark:text-zinc-300">{item.name}</span>
                  {openByItem.has(item.id) && <Badge color="amber">out</Badge>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EquipmentAudit;
