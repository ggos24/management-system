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

const LAUNCH_KEYS = ['tgWebAppData', 'tgWebAppVersion', 'tgWebAppPlatform', 'tgWebAppStartParam'] as const;
const LAUNCH_CACHE_KEY = 'tg-launch-params';

/**
 * Telegram delivers the launch parameters — initData, platform, Bot API version
 * — in the URL fragment, and its SDK reads them when the script loads. The
 * script loads asynchronously, and by then the router may have replaced the URL
 * and taken the fragment with it. The SDK then silently falls back to version
 * "6.0" and platform "unknown", which reads as an ancient Telegram.
 *
 * So snapshot them at module load, before anything can navigate, and keep a copy
 * in sessionStorage for subsequent in-app navigations.
 */
function captureLaunchParams(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const found: Record<string, string> = {};
  for (const key of LAUNCH_KEYS) {
    const value = fromHash.get(key);
    if (value) found[key] = value;
  }
  if (Object.keys(found).length > 0) {
    try {
      window.sessionStorage.setItem(LAUNCH_CACHE_KEY, JSON.stringify(found));
    } catch {
      // Private-mode storage refusal is not fatal; the in-memory copy still works.
    }
    return found;
  }
  try {
    return JSON.parse(window.sessionStorage.getItem(LAUNCH_CACHE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

const launchParams = captureLaunchParams();

/**
 * Detectable before the SDK loads: Telegram appends tgWebAppData to the fragment
 * when it opens the page, which is also where initData lives.
 */
export function isTelegramWebview(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.Telegram?.WebApp?.initData) return true;
  if (launchParams.tgWebAppData) return true;
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
  return launchParams.tgWebAppData ?? null;
}

/** The value behind ?startapp= — for us, the scanned asset code. */
export function readStartParam(): string | null {
  if (typeof window === 'undefined') return null;
  const fromSdk = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (fromSdk) return fromSdk;
  const search = new URLSearchParams(window.location.search);
  return launchParams.tgWebAppStartParam ?? search.get('tgWebAppStartParam');
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

/** Compare dotted Bot API versions ("6.4" vs "8.0") numerically, not as strings. */
export function versionAtLeast(version: string, minimum: string): boolean {
  const parse = (value: string) => value.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const actual = parse(version);
  const wanted = parse(minimum);
  for (let i = 0; i < Math.max(actual.length, wanted.length); i++) {
    const a = actual[i] ?? 0;
    const b = wanted[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

export async function scannerSupport(): Promise<{ available: boolean; platform: string; reason: string }> {
  const app = await loadTelegramSdk();
  if (!app && !launchParams.tgWebAppData) {
    return { available: false, platform: 'browser', reason: 'Not running inside Telegram' };
  }

  // Prefer the snapshot: the SDK may have loaded after the fragment was gone and
  // fallen back to its "6.0" / "unknown" defaults.
  const platform = launchParams.tgWebAppPlatform || app?.platform || 'unknown';
  const version = launchParams.tgWebAppVersion || app?.version || '';

  if (platform !== 'unknown' && !SCANNER_PLATFORMS.has(platform)) {
    return { available: false, platform, reason: 'Telegram on desktop cannot scan — use a phone or type the code' };
  }
  // Only block on a version we could actually read. An unknown version means our
  // detection failed, not that the client is old — offer the button and let the
  // call itself fail loudly if the platform really cannot do it.
  if (version && !versionAtLeast(version, '6.4')) {
    return { available: false, platform, reason: 'Update Telegram to scan codes' };
  }
  if (!app?.showScanQrPopup) {
    return { available: false, platform, reason: 'This Telegram build has no scanner' };
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
