import { RefObject, useEffect, useState } from 'react';

interface UseViewportPortalPositionOptions {
  isOpen: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  estimatedHeight?: number;
  gap?: number;
  minWidth?: number;
  fixedWidth?: number;
  edgeInset?: number;
}

export interface PortalPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  flipUp: boolean;
}

const FLIP_THRESHOLD = 180;

function compute(
  el: HTMLElement,
  {
    estimatedHeight,
    gap,
    minWidth,
    fixedWidth,
    edgeInset,
  }: Required<Omit<UseViewportPortalPositionOptions, 'isOpen' | 'triggerRef' | 'minWidth' | 'fixedWidth'>> & {
    minWidth?: number;
    fixedWidth?: number;
  },
): PortalPosition {
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;

  let width = fixedWidth ?? rect.width;
  if (minWidth !== undefined) width = Math.max(width, minWidth);
  width = Math.min(width, vw - edgeInset * 2);

  let left = rect.left;
  if (left + width > vw - edgeInset) left = vw - edgeInset - width;
  if (left < edgeInset) left = edgeInset;

  const spaceBelow = vh - rect.bottom;
  const spaceAbove = rect.top;
  const flipUp = spaceBelow < Math.min(estimatedHeight, FLIP_THRESHOLD) && spaceAbove > spaceBelow;

  let top: number;
  let maxHeight: number;
  if (flipUp) {
    top = rect.top - gap;
    maxHeight = Math.max(120, spaceAbove - gap - edgeInset);
  } else {
    top = rect.bottom + gap;
    maxHeight = Math.max(120, vh - top - edgeInset);
  }

  return { top, left, width, maxHeight, flipUp };
}

/**
 * Computes a viewport-aware position for a fixed-position portal (dropdown, picker).
 * Clamps left/width to viewport, flips up when bottom clearance is tight, and
 * reacts to scroll, resize, and virtual-keyboard-driven visualViewport changes.
 *
 * Consumers apply `transform: translateY(-100%)` when `flipUp` is true so the
 * dropdown's bottom edge sits just above the trigger.
 *
 * Measurement is driven by the trigger element (via ResizeObserver) and by
 * window/visualViewport scroll+resize — not by effect-based setState on `isOpen`.
 */
export function useViewportPortalPosition({
  isOpen,
  triggerRef,
  estimatedHeight = 240,
  gap = 4,
  minWidth,
  fixedWidth,
  edgeInset = 8,
}: UseViewportPortalPositionOptions): PortalPosition | null {
  const [pos, setPos] = useState<PortalPosition | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const el = triggerRef.current;
    if (!el) return;

    const update = () => setPos(compute(el, { estimatedHeight, gap, minWidth, fixedWidth, edgeInset }));
    const raf = requestAnimationFrame(update);

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    };
  }, [isOpen, triggerRef, estimatedHeight, gap, minWidth, fixedWidth, edgeInset]);

  return isOpen ? pos : null;
}
