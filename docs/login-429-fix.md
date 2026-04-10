# Login Issue: Immediate Logout Due to 429 Rate Limiting

**Date**: 2026-04-04
**Commit**: `6798433`
**Affected users**: Some users (timing-dependent)

## Symptoms

- User fills in login credentials, logs in successfully, then gets immediately logged out
- Browser console shows:
  - `429 (Too Many Requests)` on Supabase `refresh_token` endpoint
  - `WebSocket connection failed: WebSocket is closed before the connection is established`
  - `406` errors on database queries

## Root Cause

Two issues combined to cause excessive auth token refresh requests:

### 1. Realtime channel recreation on every re-render (`useRealtimeSync.ts`)

The `useEffect` that creates the Supabase Realtime channel had 7 dependencies in its array, including `loadNotifications` from `useUiStore`. When the component re-rendered, dependency references changed, causing the effect to:

1. Tear down the existing WebSocket channel
2. Create a new one
3. Each new connection triggered a token refresh

Multiple rapid reconnections hit Supabase's rate limit (429), invalidating the session and triggering logout.

### 2. Double `initData` call on login (`useAuth.ts`)

On login, two paths both called `initData()`:

1. `LoginRoute.onLogin()` in `routes.tsx` called `initData(userId)` directly
2. `onAuthStateChange` listener in `useAuth.ts` fired `INITIAL_SESSION` event and called `initData(userId)` again

While `initPromise` deduplicated the actual work, both paths called `setSession()`, causing extra re-renders that amplified the channel recreation problem.

### Why only some users?

The issue was a timing-dependent race condition. Users on slower connections or devices where re-renders happened at the wrong cadence hit the 429 threshold. Others got lucky with timing.

## Fix Applied

### `hooks/useRealtimeSync.ts`

- Removed all dependencies from the Realtime channel `useEffect` — changed to `[]`
- Debounced callbacks already use `useRef` internally, so they're stable without being in the dep array
- `loadNotifications` is now called via `useUiStore.getState().loadNotifications()` inside the callback instead of being a captured dependency

### `hooks/useAuth.ts`

- Added `initialised` flag that's set when `getSession()` successfully triggers `initData()`
- `onAuthStateChange` now skips the `INITIAL_SESSION` event if `getSession()` already handled it
- Prevents double initialization race on login
