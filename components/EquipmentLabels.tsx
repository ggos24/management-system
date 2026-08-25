import React, { useEffect, useState } from 'react';
import { Printer, Check } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './ui';
import { CustomSelect } from './CustomSelect';
import { buildStickerUrl } from '../lib/equipment';
import type { EquipmentItem } from '../types';

/**
 * Printable QR sheet.
 *
 * Codes are rendered locally rather than through an image service: an asset code
 * is inventory data, and there is no reason to hand a third party a list of what
 * the newsroom owns.
 *
 * Error correction sits at Q deliberately. Field gear gets scuffed, which argues
 * for H — but H needs more modules, and on a 25mm label those modules get small
 * enough that phone cameras start to struggle. Q is the balance.
 */
const SIZE_PRESETS = [
  { value: '25', label: '25 mm (small gear)' },
  { value: '32', label: '32 mm (default)' },
  { value: '40', label: '40 mm (cases, tripods)' },
];

interface Props {
  items: EquipmentItem[];
  onClose: () => void;
  onMarkPrinted: (itemIds: string[]) => Promise<void>;
}

export const EquipmentLabels: React.FC<Props> = ({ items, onClose, onMarkPrinted }) => {
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [sizeMm, setSizeMm] = useState('32');
  const [marking, setMarking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Lazy: the QR library only loads for the admin who is actually printing.
    import('qrcode')
      .then(async (QRCode) => {
        const generated: Record<string, string> = {};
        for (const item of items) {
          generated[item.id] = await QRCode.toDataURL(buildStickerUrl(item.assetCode), {
            errorCorrectionLevel: 'Q',
            margin: 1,
            width: 512,
          });
        }
        if (!cancelled) setCodes(generated);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const ready = Object.keys(codes).length === items.length && items.length > 0;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Labels for ${items.length} unit${items.length === 1 ? '' : 's'}`}
      size="xl"
      actions={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <div className="w-48">
            <CustomSelect options={SIZE_PRESETS} value={sizeMm} onChange={setSizeMm} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="ghost" disabled={!ready} onClick={() => window.print()}>
              <Printer size={14} className="mr-1.5" />
              Print
            </Button>
            {/* Separate from printing on purpose: printers eat half a sheet, and
                stamping labels_printed_at is what freezes the asset codes. */}
            <Button
              disabled={marking || !ready}
              onClick={async () => {
                setMarking(true);
                await onMarkPrinted(items.map((item) => item.id));
                setMarking(false);
                onClose();
              }}
            >
              <Check size={14} className="mr-1.5" />
              Mark as printed
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 print:hidden">
          Print, check one sticker against a real phone camera, adjust the size if it struggles, then confirm. Marking
          them printed freezes these asset codes, because the QR carries them.
        </p>

        {failed ? (
          <p className="text-sm text-red-600">Could not load the QR generator. Reload and try again.</p>
        ) : !ready ? (
          <p className="text-sm text-zinc-400">Generating codes…</p>
        ) : (
          <div className="equipment-label-sheet flex flex-wrap gap-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="equipment-label flex flex-col items-center justify-start border border-zinc-300 dark:border-zinc-700 rounded p-2 bg-white"
                style={{ width: `${sizeMm}mm` }}
              >
                <img src={codes[item.id]} alt="" style={{ width: '100%', display: 'block' }} />
                <span className="font-mono font-bold text-black leading-none mt-1" style={{ fontSize: '9pt' }}>
                  {item.assetCode}
                </span>
                <span className="text-black text-center leading-tight" style={{ fontSize: '6pt' }}>
                  {item.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default EquipmentLabels;
