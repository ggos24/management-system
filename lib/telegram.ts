/**
 * Telegram Mini App glue.
 *
 * The SDK is loaded lazily and only inside Telegram, so the ordinary web app
 * never pays for a third-party script it cannot use.
 */

interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  ready: () => void;
  expand: () => void;
  version: string;
  showScanQrPopup?: (params: { text?: string }, callback: (text: string) => boolean) => void;
  closeScanQrPopup?: () => void;
  HapticFeedback?: { notificationOccurred?: (type: 'error' | 'success' | 'warning') => void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';

/**
 * Detectable before the SDK loads: Telegram appends tgWebAppData to the fragment
 * when it opens the page, which is also where initData lives.
 */
export function isTelegramWebview(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.Telegram?.WebApp?.initData) return true;
  return window.location.hash.includes('tgWebAppData=');
}

let sdkPromise: Promise<TelegramWebApp | null> | null = null;

export function loadTelegramSdk(): Promise<TelegramWebApp | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve(window.Telegram?.WebApp ?? null);
    // A blocked or offline CDN must not wedge the app — fall back to the
    // fragment, which already carries everything auth needs.
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return sdkPromise;
}

/** The raw, signed payload. Never trust initDataUnsafe for anything but display. */
export function readInitData(): string | null {
  if (typeof window === 'undefined') return null;
  const fromSdk = window.Telegram?.WebApp?.initData;
  if (fromSdk) return fromSdk;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return hash.get('tgWebAppData');
}

/** The value behind ?startapp= — for us, the scanned asset code. */
export function readStartParam(): string | null {
  if (typeof window === 'undefined') return null;
  const fromSdk = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (fromSdk) return fromSdk;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(window.location.search);
  return hash.get('tgWebAppStartParam') ?? search.get('tgWebAppStartParam');
}

export async function initTelegramChrome(): Promise<void> {
  const app = await loadTelegramSdk();
  if (!app) return;
  app.ready();
  app.expand();
}

/**
 * Telegram's native scanner. Absent on Desktop and Web, and on clients older
 * than Bot API 6.4 — callers must keep manual entry available regardless.
 */
export async function isScannerAvailable(): Promise<boolean> {
  const app = await loadTelegramSdk();
  return Boolean(app?.showScanQrPopup);
}

/**
 * Continuous scanning: the popup stays open until `onCode` returns true, so a
 * crew can walk a shelf without reopening it per item.
 */
export async function scanQrCodes(onCode: (raw: string) => boolean, text = 'Scan an equipment sticker'): Promise<void> {
  const app = await loadTelegramSdk();
  if (!app?.showScanQrPopup) return;
  app.showScanQrPopup({ text }, (raw) => onCode(raw));
}

export async function closeScanner(): Promise<void> {
  const app = await loadTelegramSdk();
  app?.closeScanQrPopup?.();
}
