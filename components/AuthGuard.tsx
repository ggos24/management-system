import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { X } from 'lucide-react';
import LoginPage from './LoginPage';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { useAuthStore } from '../stores/authStore';

export const AuthGuard: React.FC = () => {
  const { session, initData } = useAuth();
  useRealtimeSync();

  const {
    currentUser,
    isLoading,
    profileError,
    needsPasswordSetup,
    setSession,
    setIsLoading,
    setNeedsPasswordSetup,
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

  // Not authenticated → redirect to /login
  if (!session) {
    return <Navigate to="/login" replace />;
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
            initData(newSession.user.id);
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
