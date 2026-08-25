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
  platform?: string;
  isVersionAtLeast?: (version: string) => boolean;
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
 * Telegram's native scanner.
 *
 * The method is DEFINED on every platform's SDK object, so checking that it
 * exists tells you nothing — Desktop and Web define it and then throw
 * WebAppMethodUnsupported when called. That renders a button that visibly does
 * nothing. Gate on the platform and the Bot API version instead.
 */
const SCANNER_PLATFORMS = new Set(['android', 'android_x', 'ios']);

export async function scannerSupport(): Promise<{ available: boolean; platform: string; reason: string }> {
  const app = await loadTelegramSdk();
  if (!app) return { available: false, platform: 'browser', reason: 'Not running inside Telegram' };
  const platform = app.platform ?? 'unknown';
  if (!app.showScanQrPopup) {
    return { available: false, platform, reason: 'This Telegram build has no scanner' };
  }
  if (typeof app.isVersionAtLeast === 'function' && !app.isVersionAtLeast('6.4')) {
    return { available: false, platform, reason: 'Update Telegram to scan codes' };
  }
  if (!SCANNER_PLATFORMS.has(platform)) {
    return { available: false, platform, reason: 'Telegram on desktop cannot scan — use a phone or type the code' };
  }
  return { available: true, platform, reason: '' };
}

export async function isScannerAvailable(): Promise<boolean> {
  return (await scannerSupport()).available;
}

/**
 * Continuous scanning: the popup stays open until `onCode` returns true, so a
 * crew can walk a shelf without reopening it per item.
 */
export async function scanQrCodes(
  onCode: (raw: string) => boolean,
  text = 'Scan an equipment sticker',
): Promise<boolean> {
  const app = await loadTelegramSdk();
  if (!app?.showScanQrPopup) return false;
  try {
    app.showScanQrPopup({ text }, (raw) => onCode(raw));
    return true;
  } catch (error) {
    // Unsupported platforms throw rather than no-op; swallowing it is what makes
    // the button look broken.
    console.error('showScanQrPopup failed', error);
    return false;
  }
}

export async function closeScanner(): Promise<void> {
  const app = await loadTelegramSdk();
  app?.closeScanQrPopup?.();
}
