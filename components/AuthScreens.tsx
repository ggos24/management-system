import React from 'react';
import { X } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { Button } from './ui';

/**
 * Full-screen loader while the session or the profile is being confirmed. Shared
 * by AuthGuard and the /login route, which both wait on the same load.
 */
export const AuthLoadingScreen: React.FC = () => {
  const isReconnecting = useAuthStore((s) => s.isReconnecting);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="text-center">
        <img src="/logo.svg" alt="Logo" className="w-12 h-12 rounded-lg mx-auto mb-4 animate-pulse" />
        <p className="text-sm text-zinc-500">{isReconnecting ? 'Reconnecting…' : 'Loading...'}</p>
        {isReconnecting && (
          <p className="mx-auto mt-1 max-w-xs text-xs text-zinc-400 dark:text-zinc-500">
            Waiting for the connection to come back. You are still signed in.
          </p>
        )}
      </div>
    </div>
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
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
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
          <Button variant="ghost" onClick={() => logout()}>
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
};
