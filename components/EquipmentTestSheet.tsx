import React, { useEffect, useState } from 'react';
import { stickerQrPayload } from '../lib/equipment';
import type { EquipmentItem } from '../types';

/**
 * A calibration sheet: one code, printed every way worth trying, on a single A4.
 *
 * The whole label debate — how small can it be, does Q buy anything over M,
 * does the code even need to sit next to the QR — is answerable in ten minutes
 * with a printer, real gear and a phone, and not answerable at all from a
 * spec. This prints the experiment.
 *
 * Every sample carries its own parameters underneath, because a page of
 * identical-looking QR codes with no labels tells you nothing an hour later
 * when one of them turns out to be the one that scanned at arm's length.
 *
 * The theory verdict is printed too, deliberately: modern phone cameras often
 * beat the 0.5mm-per-module rule of thumb, and knowing WHERE reality departs
 * from theory is worth more than either number alone.
 */
const QUIET_ZONE_MODULES = 4;
const MODULE_MM_MIN = 0.5;
const MODULE_MM_COMFORTABLE = 0.6;

/** Brackets the useful range deliberately low — the point is to find the wall. */
const SIZE_SWEEP_MM = [14, 16, 18, 20, 22, 25, 28, 32];
const EC_LEVELS = ['M', 'Q', 'H'] as const;
type EcLevel = (typeof EC_LEVELS)[number];

type Layout = 'side' | 'stacked' | 'qr-only' | 'code-only';
const LAYOUTS: { key: Layout; label: string }[] = [
  { key: 'side', label: 'QR + code side by side' },
  { key: 'stacked', label: 'QR above code' },
  { key: 'qr-only', label: 'QR only' },
  { key: 'code-only', label: 'Code only, no QR' },
];

interface Props {
  item: EquipmentItem;
  includeSizes: boolean;
  includeEc: boolean;
  includeLayouts: boolean;
  ecForSweep: EcLevel;
  layoutSizeMm: number;
}

interface Code {
  dataUrl: string;
  totalModules: number;
}

function moduleMm(sizeMm: number, totalModules: number): number {
  return sizeMm / totalModules;
}

function verdictOf(mm: number): { text: string; className: string } {
  if (mm >= MODULE_MM_COMFORTABLE) return { text: 'theory: ok', className: 'tsheet-ok' };
  if (mm >= MODULE_MM_MIN) return { text: 'theory: tight', className: 'tsheet-tight' };
  return { text: 'theory: too small', className: 'tsheet-bad' };
}

const Spec: React.FC<{ lines: string[]; verdict?: { text: string; className: string } }> = ({ lines, verdict }) => (
  <div className="tsheet-spec">
    {lines.map((line) => (
      <span key={line}>{line}</span>
    ))}
    {verdict && <span className={verdict.className}>{verdict.text}</span>}
  </div>
);

const Sample: React.FC<{
  code: Code;
  sizeMm: number;
  assetCode: string;
  layout: Layout;
  specLines: string[];
  showVerdict?: boolean;
}> = ({ code, sizeMm, assetCode, layout, specLines, showVerdict = true }) => {
  const mm = moduleMm(sizeMm, code.totalModules);
  return (
    <div className="tsheet-sample">
      <div className={`tsheet-card tsheet-card-${layout}`}>
        {layout !== 'code-only' && <img src={code.dataUrl} alt="" style={{ width: `${sizeMm}mm`, display: 'block' }} />}
        {layout !== 'qr-only' && <span className="tsheet-code">{assetCode}</span>}
      </div>
      <Spec lines={specLines} verdict={showVerdict ? verdictOf(mm) : undefined} />
    </div>
  );
};

export const EquipmentTestSheet: React.FC<Props> = ({
  item,
  includeSizes,
  includeEc,
  includeLayouts,
  ecForSweep,
  layoutSizeMm,
}) => {
  const [codes, setCodes] = useState<Record<EcLevel, Code> | null>(null);

  useEffect(() => {
    let cancelled = false;
    // One render per level covers every size: the sweep only changes CSS width,
    // so the printed modules stay a faithful scale of the same matrix.
    import('qrcode')
      .then(async (QRCode) => {
        const payload = stickerQrPayload(item.assetCode);
        const next = {} as Record<EcLevel, Code>;
        for (const ec of EC_LEVELS) {
          const spec = QRCode.create(payload, { errorCorrectionLevel: ec });
          next[ec] = {
            totalModules: spec.modules.size + QUIET_ZONE_MODULES * 2,
            dataUrl: await QRCode.toDataURL(payload, {
              errorCorrectionLevel: ec,
              margin: QUIET_ZONE_MODULES,
              width: 1024,
            }),
          };
        }
        if (!cancelled) setCodes(next);
      })
      .catch(() => {
        if (!cancelled) setCodes(null);
      });
    return () => {
      cancelled = true;
    };
  }, [item.assetCode]);

  if (!codes) return <p className="text-sm text-zinc-400 print:hidden">Generating test sheet…</p>;

  return (
    <div className="equipment-label-sheet tsheet">
      <div className="tsheet-header">
        <strong>Label test sheet — {item.assetCode}</strong>
        <span>
          Print at 100% (no “fit to page”). Cut out, stick on real gear, then scan each from 30 cm and 10 cm, in poor
          light, at an angle, on the oldest phone in the team. Circle what fails.
        </span>
        <div className="tsheet-ruler">
          <div style={{ width: '50mm' }} />
          <span>50 mm — measure before trusting anything below</span>
        </div>
      </div>

      {includeSizes && (
        <section>
          <h3>
            Size sweep — level {ecForSweep}, {codes[ecForSweep].totalModules} modules across
          </h3>
          <div className="tsheet-row">
            {SIZE_SWEEP_MM.map((size) => (
              <Sample
                key={size}
                code={codes[ecForSweep]}
                sizeMm={size}
                assetCode={item.assetCode}
                layout="side"
                specLines={[`${size} mm`, `${moduleMm(size, codes[ecForSweep].totalModules).toFixed(2)} mm/module`]}
              />
            ))}
          </div>
        </section>
      )}

      {includeEc && (
        <section>
          <h3>Error correction at {layoutSizeMm} mm — same size, different module density</h3>
          <div className="tsheet-row">
            {EC_LEVELS.map((ec) => (
              <Sample
                key={ec}
                code={codes[ec]}
                sizeMm={layoutSizeMm}
                assetCode={item.assetCode}
                layout="side"
                specLines={[
                  `level ${ec}`,
                  `${codes[ec].totalModules} modules`,
                  `${moduleMm(layoutSizeMm, codes[ec].totalModules).toFixed(2)} mm/module`,
                ]}
              />
            ))}
          </div>
          <p className="tsheet-note">
            Higher correction survives scratches but packs more modules into the same square, so each one gets smaller.
            Scratch one of these deliberately before deciding.
          </p>
        </section>
      )}

      {includeLayouts && (
        <section>
          <h3>
            Layouts at {layoutSizeMm} mm, level {ecForSweep}
          </h3>
          <div className="tsheet-row">
            {LAYOUTS.map((layout) => (
              <Sample
                key={layout.key}
                code={codes[ecForSweep]}
                sizeMm={layoutSizeMm}
                assetCode={item.assetCode}
                layout={layout.key}
                specLines={[layout.label]}
                showVerdict={false}
              />
            ))}
          </div>
          <p className="tsheet-note">
            Code-only exists for gear too small for a QR — lavaliers, cables. Manual entry accepts the code everywhere
            the scanner does.
          </p>
        </section>
      )}
    </div>
  );
};

export default EquipmentTestSheet;
