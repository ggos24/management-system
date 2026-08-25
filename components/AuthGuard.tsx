import React from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { X, Send } from 'lucide-react';
import LoginPage from './LoginPage';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { useAuthStore } from '../stores/authStore';

export const AuthGuard: React.FC = () => {
  const { session } = useAuth();
  const location = useLocation();
  useRealtimeSync();

  const {
    currentUser,
    isLoading,
    profileError,
    needsPasswordSetup,
    setSession,
    setIsLoading,
    setNeedsPasswordSetup,
    telegramGate,
    logout,
  } = useAuthStore();

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-center">
          <img src="/logo.svg" alt="Logo" className="w-12 h-12 rounded-lg mx-auto mb-4 animate-pulse" />
          <p className="text-sm text-zinc-500">Loading...</p>
        </div>
      </div>
    );
  }

  // A Telegram Mini App user we could not resolve to a profile. Sending them to
  // the password form is a dead end — the whole reason they are here is that
  // they do not use the web app.
  if (telegramGate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 bg-zinc-900 dark:bg-white rounded-lg mx-auto mb-4 flex items-center justify-center">
            <Send size={22} className="text-white dark:text-black" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
            {telegramGate === 'not_linked' ? 'Telegram not linked' : 'No access'}
          </h1>
          <p className="text-sm text-zinc-500">
            {telegramGate === 'not_linked'
              ? 'This Telegram account is not connected to a UNITIES profile yet. Ask an admin to send you a link code, then open this app again.'
              : 'Your profile does not have access to the equipment tool. Ask an admin if you think this is wrong.'}
          </p>
        </div>
      </div>
    );
  }

  // Not authenticated → redirect to /login, remembering where they were headed.
  // Carried in the query string rather than router state so it survives a full
  // reload and the invite/recovery round trip.
  if (!session) {
    const target = `${location.pathname}${location.search}`;
    const next = target === '/' || target.startsWith('/login') ? '' : `?next=${encodeURIComponent(target)}`;
    return <Navigate to={`/login${next}`} replace />;
  }

  // Invited user needs to set password
  if (needsPasswordSetup) {
    return (
      <LoginPage
        mode="set-password"
        onLogin={(newSession) => {
          setNeedsPasswordSetup(false);
          window.history.replaceState({}, '', '/');
          setSession(newSession);
          if (!currentUser) {
            setIsLoading(true);
            useAuthStore.getState().initData(newSession.user.id);
          }
        }}
      />
    );
  }

  // Profile error
  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 bg-red-500 rounded-lg mx-auto mb-4 flex items-center justify-center">
            <X size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Account Error</h1>
          <p className="text-sm text-zinc-500 mb-4">{profileError}</p>
          <button
            onClick={() => logout()}
            className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold hover:opacity-90"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  return <Outlet />;
};
