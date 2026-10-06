import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { isTelegramWebview } from '../lib/telegram';
import { ClockSkewBanner } from './ClockSkewBanner';
import { Button } from './ui';

/**
 * Full-height page with the clock-skew banner on top. A badly set device clock is
 * a common reason these screens appear at all (lib/clockSkew.ts), so the warning
 * measured at sign-in must stay visible here too.
 */
const AuthScreenShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-black">
    <ClockSkewBanner />
    <div className="flex-1 flex items-center justify-center p-4">{children}</div>
  </div>
);

// How long "Reconnecting…" runs before the user is offered a way out. The wait
// normally ends on its own once the network is back; this is for the rare
// server-side failure that never clears, where signing in again is the fix —
// or, in the Telegram Mini App, which has no sign-in form, opening it afresh.
export const SIGN_OUT_OFFER_AFTER_MS = 30_000;

/**
 * Full-screen loader while the session or the profile is being confirmed. Shared
 * by AuthGuard and the /login route, which both wait on the same load.
 */
export const AuthLoadingScreen: React.FC = () => {
  const isReconnecting = useAuthStore((s) => s.isReconnecting);
  const logout = useAuthStore((s) => s.logout);
  const [offerSignOut, setOfferSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!isReconnecting) return;
    const timer = setTimeout(() => setOfferSignOut(true), SIGN_OUT_OFFER_AFTER_MS);
    return () => clearTimeout(timer);
  }, [isReconnecting]);

  const signOut = () => {
    setSigningOut(true);
    void logout();
  };

  return (
    <AuthScreenShell>
      <div className="text-center">
        <img src="/logo.svg" alt="Logo" className="w-12 h-12 rounded-lg mx-auto mb-4 animate-pulse" />
        <p className="text-sm text-zinc-500">{isReconnecting ? 'Reconnecting…' : 'Loading...'}</p>
        {isReconnecting && (
          <p className="mx-auto mt-1 max-w-xs text-xs text-zinc-400 dark:text-zinc-500">
            Waiting for the connection to come back. You are still signed in.
          </p>
        )}
        {isReconnecting &&
          offerSignOut &&
          // Signing out would leave a Telegram user on a password form they
          // cannot use, and stop the retries; reopening runs the exchange again.
          (isTelegramWebview() ? (
            <Button variant="ghost" className="mt-4" onClick={() => window.location.reload()}>
              Try again
            </Button>
          ) : (
            <Button variant="ghost" className="mt-4" disabled={signingOut} onClick={signOut}>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Button>
          ))}
      </div>
    </AuthScreenShell>
  );
};

interface AccountErrorScreenProps {
  message: string;
  onRetry: () => void;
}

/** The signed-in user's profile could not be loaded. */
export const AccountErrorScreen: React.FC<AccountErrorScreenProps> = ({ message, onRetry }) => {
  const logout = useAuthStore((s) => s.logout);

  return (
    <AuthScreenShell>
      <div className="text-center max-w-md">
        <div className="w-12 h-12 bg-red-500 rounded-lg mx-auto mb-4 flex items-center justify-center">
          <X size={24} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Account Error</h1>
        <p className="text-sm text-zinc-500 mb-4">{message}</p>
        <div className="flex items-center justify-center gap-2">
          {/* Offered first: a load that failed on the network is fixed by trying
              again, and signing out of a working account is not. */}
          <Button onClick={onRetry}>Try again</Button>
          {/* No sign-in form to come back to inside the Telegram Mini App. */}
          {!isTelegramWebview() && (
            <Button variant="ghost" onClick={() => logout()}>
              Sign Out
            </Button>
          )}
        </div>
      </div>
    </AuthScreenShell>
  );
};
