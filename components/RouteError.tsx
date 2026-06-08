import React, { useEffect, useState } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Button } from './ui';

// Errors thrown while a route element renders are caught by React Router and routed
// to this `errorElement` — a class ErrorBoundary above <RouterProvider> never sees
// them. The classic trigger is a stale tab: an old JS bundle keeps running after a
// deploy and renders against a schema it no longer matches (e.g. reading a dropped
// column → `undefined.toLowerCase()`). A normal reload pulls the fresh index.html +
// bundle and the crash disappears — so the first time we hit such a crash we just do
// that reload automatically. A short loop-guard window stops us from reload-looping
// on a genuinely persistent error; in that case we fall back to a recoverable screen.
const RELOAD_AT_KEY = 'u24:route-error-reloaded-at';
const RELOAD_LOOP_WINDOW_MS = 15_000;

export const RouteError: React.FC = () => {
  const error = useRouteError();

  // Decide once, on mount, whether this crash should self-heal via a reload.
  // (Lazy initializer runs during render — no setState-in-effect.)
  const [willReload] = useState(() => {
    if (isRouteErrorResponse(error)) return false; // 404 / redirect-style, not a render crash
    const lastReloadAt = Number(sessionStorage.getItem(RELOAD_AT_KEY) || 0);
    return Date.now() - lastReloadAt >= RELOAD_LOOP_WINDOW_MS;
  });

  useEffect(() => {
    if (willReload) {
      sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
      window.location.reload();
      return;
    }
    // Reload didn't fix it (or it's not auto-recoverable) — surface for diagnostics.
    console.error('Route error (showing recovery screen):', error);
  }, [willReload, error]);

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'An unexpected error occurred.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
      <div className="text-center max-w-md">
        {willReload ? (
          <>
            <div className="w-10 h-10 mx-auto mb-4 rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white animate-spin" />
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">Updating&hellip;</h1>
            <p className="text-sm text-zinc-500">Loading the latest version.</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 bg-red-500 rounded-lg mx-auto mb-4 flex items-center justify-center">
              <span className="text-white font-bold text-xl">!</span>
            </div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">Something went wrong</h1>
            <p className="text-sm text-zinc-500 mb-4">{message}</p>
            <Button onClick={() => window.location.reload()} className="px-4">
              Reload Page
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
