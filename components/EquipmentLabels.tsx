import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, Printer, Check, AlertTriangle } from 'lucide-react';
import { Button, Input, Badge } from './ui';
import { CustomSelect } from './CustomSelect';
import { useDataStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { buildStickerUrl } from '../lib/equipment';
import { isAdmin } from '../constants';

/**
 * Sticker sheet.
 *
 * Two things decide whether a printed code actually scans, and they are
 * independent:
 *
 *   Error correction survives LOCAL damage — a scratch, a torn corner. Q (25%)
 *   for field gear; M is an office-paper setting.
 *
 *   Module size survives UNIFORM degradation — fading, grime, poor light, a
 *   shaky hand. Error correction does nothing for this. Below ~0.5mm per module
 *   phones start failing, 0.6mm is comfortable.
 *
 * The quiet zone is where this usually goes wrong: the spec is 4 empty modules
 * on every side, so a 37-module code renders as a 45-module image. Sizing the
 * printed square against 37 instead of 45 silently costs ~18% of every module,
 * which is exactly the difference between 0.6mm and 0.49mm. So the module size
 * is computed from the FULL image and shown on screen, rather than left as a
 * number nobody checks.
 */
const QUIET_ZONE_MODULES = 4;
const MODULE_MM_MIN = 0.5;
const MODULE_MM_COMFORTABLE = 0.6;

/** Common A4 sheet stocks. Print CSS should match an article you actually own. */
const SHEET_PRESETS: { value: string; label: string; labelW: number; labelH: number; qr: number }[] = [
  { value: '70x37', label: '70×37 mm — 3×8 per A4', labelW: 70, labelH: 37, qr: 27 },
  { value: '63x38', label: '63.5×38.1 mm — 3×7 per A4', labelW: 63.5, labelH: 38.1, qr: 27 },
  { value: '48x25', label: '48.5×25.4 mm — 4×10 per A4', labelW: 48.5, labelH: 25.4, qr: 21 },
  { value: '38x21', label: '38×21 mm — 5×13 per A4', labelW: 38, labelH: 21, qr: 18 },
];

const EC_OPTIONS = [
  { value: 'M', label: 'M — 15% (office paper)' },
  { value: 'Q', label: 'Q — 25% (field gear)' },
  { value: 'H', label: 'H — 30% (harsh use)' },
];

interface Rendered {
  dataUrl: string;
  totalModules: number;
}

const EquipmentLabels: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentUser = useAuthStore((s) => s.currentUser)!;

  const { equipmentItems, markEquipmentLabelsPrinted } = useDataStore(
    useShallow((s) => ({
      equipmentItems: s.equipmentItems,
      markEquipmentLabelsPrinted: s.markEquipmentLabelsPrinted,
    })),
  );

  const preselected = useMemo(
    () => new Set((searchParams.get('items') ?? '').split(',').filter(Boolean)),
    [searchParams],
  );

  const [selected, setSelected] = useState<Set<string>>(preselected);
  const [query, setQuery] = useState('');
  const [unlabelledOnly, setUnlabelledOnly] = useState(false);
  const [preset, setPreset] = useState('70x37');
  const [ec, setEc] = useState('Q');
  const [qrMm, setQrMm] = useState(27);
  const [showName, setShowName] = useState(true);
  const [showRuler, setShowRuler] = useState(true);
  const [rendered, setRendered] = useState<Record<string, Rendered>>({});
  const [marking, setMarking] = useState(false);

  const sheet = SHEET_PRESETS.find((p) => p.value === preset) ?? SHEET_PRESETS[0];

  const visible = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return equipmentItems.filter((item) => {
      if (unlabelledOnly && item.labelsPrintedAt) return false;
      if (item.status === 'retired') return false;
      return !trimmed || `${item.assetCode} ${item.name}`.toLowerCase().includes(trimmed);
    });
  }, [equipmentItems, query, unlabelledOnly]);

  const chosen = useMemo(() => equipmentItems.filter((item) => selected.has(item.id)), [equipmentItems, selected]);

  useEffect(() => {
    if (chosen.length === 0) {
      setRendered({});
      return;
    }
    let cancelled = false;
    // Lazy: the QR library only loads for the admin actually printing.
    import('qrcode')
      .then(async (QRCode) => {
        const next: Record<string, Rendered> = {};
        for (const item of chosen) {
          const url = buildStickerUrl(item.assetCode);
          const spec = QRCode.create(url, { errorCorrectionLevel: ec as 'M' | 'Q' | 'H' });
          next[item.id] = {
            totalModules: spec.modules.size + QUIET_ZONE_MODULES * 2,
            dataUrl: await QRCode.toDataURL(url, {
              errorCorrectionLevel: ec as 'M' | 'Q' | 'H',
              // The spec's full quiet zone. Cramping this is the most common
              // reason a printed code reads on one phone and not the next.
              margin: QUIET_ZONE_MODULES,
              width: 1024,
            }),
          };
        }
        if (!cancelled) setRendered(next);
      })
      .catch(() => {
        if (!cancelled) setRendered({});
      });
    return () => {
      cancelled = true;
    };
  }, [chosen, ec]);

  const totalModules = Object.values(rendered)[0]?.totalModules ?? 45;
  const moduleMm = qrMm / totalModules;
  const moduleVerdict = moduleMm >= MODULE_MM_COMFORTABLE ? 'good' : moduleMm >= MODULE_MM_MIN ? 'tight' : 'bad';
  // The two sizes worth knowing at the CURRENT settings. Dropping error
  // correction from Q to M removes a version step (45 → 41 modules across), so
  // both bounds shrink with it — that is the one way to a smaller sticker that
  // costs no module size.
  const floorMm = Math.ceil(totalModules * MODULE_MM_MIN);
  const comfortMm = Math.ceil(totalModules * MODULE_MM_COMFORTABLE);

  const ready = chosen.length > 0 && Object.keys(rendered).length === chosen.length;

  if (!isAdmin(currentUser.role)) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-zinc-500">Only admins can print labels.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 md:px-6 py-3 print:hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => navigate('/equipment')}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          >
            <ArrowLeft size={16} />
            Registry
          </button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={!ready} onClick={() => window.print()}>
              <Printer size={14} className="mr-1.5" />
              Print {chosen.length > 0 ? chosen.length : ''}
            </Button>
            <Button
              size="sm"
              disabled={!ready || marking}
              onClick={async () => {
                setMarking(true);
                await markEquipmentLabelsPrinted(chosen.map((item) => item.id));
                setMarking(false);
              }}
            >
              <Check size={14} className="mr-1.5" />
              Mark printed
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 px-4 md:px-6 py-5">
          {/* --- picker + settings --- */}
          <div className="space-y-5 print:hidden">
            <div className="space-y-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search gear…"
                aria-label="Search equipment"
              />
              <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer">
                <input type="checkbox" checked={unlabelledOnly} onChange={(e) => setUnlabelledOnly(e.target.checked)} />
                Only units without a label yet
              </label>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(visible.map((item) => item.id)))}>
                  Select all ({visible.length})
                </Button>
                {selected.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-900">
              {visible.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={(e) => {
                      setSelected((previous) => {
                        const next = new Set(previous);
                        if (e.target.checked) next.add(item.id);
                        else next.delete(item.id);
                        return next;
                      });
                    }}
                  />
                  <span className="font-mono text-xs text-zinc-500 shrink-0">{item.assetCode}</span>
                  <span className="truncate">{item.name}</span>
                  {item.labelsPrintedAt && (
                    <Badge color="zinc" className="ml-auto shrink-0">
                      printed
                    </Badge>
                  )}
                </label>
              ))}
              {visible.length === 0 && <p className="px-3 py-4 text-sm text-zinc-400">Nothing matches.</p>}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Label stock</p>
                <CustomSelect
                  options={SHEET_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
                  value={preset}
                  onChange={(value) => {
                    setPreset(value);
                    const next = SHEET_PRESETS.find((p) => p.value === value);
                    if (next) setQrMm(next.qr);
                  }}
                />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Error correction</p>
                <CustomSelect options={EC_OPTIONS} value={ec} onChange={setEc} />
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                  M is one QR version smaller than Q — the same scan quality in ~9% less width. Q survives scratches
                  better; on laminated stock the laminate does that job.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">QR size</p>
                  <span className="text-xs text-zinc-500">{qrMm} mm</span>
                </div>
                <input
                  type="range"
                  min={14}
                  max={40}
                  step={1}
                  value={qrMm}
                  onChange={(e) => setQrMm(Number(e.target.value))}
                  className="w-full"
                  aria-label="QR size in millimetres"
                />
                {/* The number that actually decides whether this scans. */}
                <div
                  className={`mt-1.5 flex items-start gap-1.5 text-xs ${
                    moduleVerdict === 'good'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : moduleVerdict === 'tight'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {moduleVerdict !== 'good' && <AlertTriangle size={13} className="shrink-0 mt-0.5" />}
                  <span>
                    {moduleMm.toFixed(2)} mm per module ({totalModules} across, quiet zone included)
                    {moduleVerdict === 'bad' && ' — too small, phones will struggle'}
                    {moduleVerdict === 'tight' && ' — works, but leaves no margin for wear'}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <span>At these settings:</span>
                  <button
                    type="button"
                    onClick={() => setQrMm(floorMm)}
                    className="underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    min {floorMm} mm
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setQrMm(comfortMm)}
                    className="underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    comfortable {comfortMm} mm
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
                Print the item name under the code
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={showRuler} onChange={(e) => setShowRuler(e.target.checked)} />
                Add a 50 mm ruler to check printer scaling
              </label>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Print one sheet first. Stick it on real gear and scan from 30 cm and 10 cm, in poor light, at an angle,
                on the oldest phone in the team. A wasted sheet beats a wasted day.
              </p>
            </div>
          </div>

          {/* --- sheet --- */}
          <div>
            {chosen.length === 0 ? (
              <p className="text-sm text-zinc-400 print:hidden">Pick units on the left to build a sheet.</p>
            ) : !ready ? (
              <p className="text-sm text-zinc-400 print:hidden">Generating codes…</p>
            ) : (
              <div className="equipment-label-sheet">
                {showRuler && (
                  <div className="equipment-label-ruler">
                    <div style={{ width: '50mm' }} />
                    <span>50 mm — measure this; if it is off, printer scaling is not 100%</span>
                  </div>
                )}
                <div className="equipment-label-grid">
                  {chosen.map((item) => (
                    <div
                      key={item.id}
                      className="equipment-label"
                      style={{ width: `${sheet.labelW}mm`, height: `${sheet.labelH}mm` }}
                    >
                      <img src={rendered[item.id]?.dataUrl} alt="" style={{ width: `${qrMm}mm`, display: 'block' }} />
                      <div className="equipment-label-text">
                        <span className="equipment-label-code">{item.assetCode}</span>
                        {showName && <span className="equipment-label-name">{item.name}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EquipmentLabels;
