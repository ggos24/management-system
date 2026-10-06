import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '../types';
import { supabase } from '../lib/supabase';
import { DataReloadError, useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useUiStore } from '../stores/uiStore';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

const member = (accessScope: Member['accessScope']): Member => ({
  id: 'profile-1',
  name: 'Member',
  role: 'user',
  accessScope,
  jobTitle: '',
  avatar: '',
  teamId: 'team-1',
  teamIds: ['team-1'],
  status: 'active',
});

/** Replaces the realtime client so a test can announce a (re)subscribe by hand. */
function fakeRealtime() {
  const onStatus: Record<string, (status: string) => void> = {};
  vi.spyOn(supabase, 'channel').mockImplementation((name: string) => {
    const channel = {
      on: () => channel,
      subscribe: (callback?: (status: string) => void) => {
        if (callback) onStatus[name] = callback;
        return channel;
      },
    };
    return channel as never;
  });
  vi.spyOn(supabase, 'removeChannel').mockResolvedValue('ok');
  return onStatus;
}

const originalReloadData = useAuthStore.getState().reloadData;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  useAuthStore.setState({ reloadData: originalReloadData });
  useAuthStore.getState().clearSessionState();
});

describe('realtime reconnect reload', () => {
  it('retries a reload that did not complete, keeping the board in the meantime', async () => {
    const onStatus = fakeRealtime();
    const reloadData = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new DataReloadError('partial'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(true);
    useAuthStore.setState({
      session: { user: { id: 'auth-1' } } as never,
      currentUser: member('full'),
      reloadData,
    });
    useDataStore.setState({ tasks: [{ id: 'task-1' } as never] });
    const resetData = vi.spyOn(useDataStore.getState(), 'resetData');

    const { unmount } = renderHook(() => useRealtimeSync());
    // The private access channel (re)subscribes after the tab reconnects.
    onStatus['task-access-profile-1']('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(300);
    expect(reloadData).toHaveBeenCalledTimes(1);

    // First retry after 2s (+ the 300ms debounce)…
    await vi.advanceTimersByTimeAsync(2_300);
    expect(reloadData).toHaveBeenCalledTimes(2);
    // …then the backoff doubles.
    await vi.advanceTimersByTimeAsync(2_300);
    expect(reloadData).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(reloadData).toHaveBeenCalledTimes(3);

    // Once a reload completes, nothing else is scheduled.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reloadData).toHaveBeenCalledTimes(3);
    expect(resetData).not.toHaveBeenCalled();
    expect(useDataStore.getState().tasks).toHaveLength(1);
    unmount();
  });

  it('still clears a related-only bundle whose access could not be verified, then retries', async () => {
    const onStatus = fakeRealtime();
    const reloadData = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new DataReloadError('profile'))
      .mockResolvedValue(true);
    useAuthStore.setState({
      session: { user: { id: 'auth-1' } } as never,
      currentUser: member('related_only'),
      reloadData,
    });
    useDataStore.setState({ tasks: [{ id: 'task-1' } as never] });

    const { unmount } = renderHook(() => useRealtimeSync());
    onStatus['task-access-profile-1']('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(300);

    expect(useDataStore.getState().tasks).toEqual([]);
    await vi.advanceTimersByTimeAsync(2_300);
    expect(reloadData).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('keeps a related-only bundle that reloaded under current access but missed a slice', async () => {
    const onStatus = fakeRealtime();
    const reloadData = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new DataReloadError('partial'))
      .mockResolvedValue(true);
    useAuthStore.setState({
      session: { user: { id: 'auth-1' } } as never,
      currentUser: member('related_only'),
      reloadData,
    });
    useDataStore.setState({ tasks: [{ id: 'task-1' } as never] });

    const { unmount } = renderHook(() => useRealtimeSync());
    onStatus['task-access-profile-1']('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(300);

    expect(useDataStore.getState().tasks).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_300);
    expect(reloadData).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('does not let a superseded reload cancel the retry of the reload that replaced it', async () => {
    const onStatus = fakeRealtime();
    let finishFirst!: (committed: boolean) => void;
    const reloadData = vi
      .fn<() => Promise<boolean>>()
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(true);
    useAuthStore.setState({
      session: { user: { id: 'auth-1' } } as never,
      currentUser: member('full'),
      reloadData,
    });

    const { unmount } = renderHook(() => useRealtimeSync());
    onStatus['task-access-profile-1']('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(300);
    // A second reconnect starts a newer reload, which fails and schedules a retry…
    onStatus['task-access-profile-1']('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(300);
    expect(reloadData).toHaveBeenCalledTimes(2);
    // …and the first, superseded one finishes afterwards.
    finishFirst(false);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(2_300);
    expect(reloadData).toHaveBeenCalledTimes(3);
    unmount();
  });

  it('closes a task whose access was revoked even when the reload was partial', async () => {
    const onStatus = fakeRealtime();
    useAuthStore.setState({
      session: { user: { id: 'auth-1' } } as never,
      currentUser: member('related_only'),
      // The reload commits a bundle without task-1, but another slice failed.
      reloadData: vi.fn<() => Promise<boolean>>().mockImplementationOnce(async () => {
        useDataStore.setState({ tasks: [], taskAccessContexts: [] });
        throw new DataReloadError('partial');
      }),
    });
    useDataStore.setState({
      tasks: [{ id: 'task-1' } as never],
      taskAccessContexts: [{ taskId: 'task-1', contextTeamId: 'team-1' }],
    });
    useUiStore.setState({ isTaskModalOpen: true, taskModalData: { id: 'task-1', teamId: 'team-1' } });

    const { unmount } = renderHook(() => useRealtimeSync());
    onStatus['task-access-profile-1']('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(300);

    expect(useUiStore.getState().isTaskModalOpen).toBe(false);
    unmount();
  });

  it('drops a pending retry when the signed-in account changes', async () => {
    const onStatus = fakeRealtime();
    const reloadData = vi.fn<() => Promise<boolean>>().mockRejectedValue(new TypeError('Failed to fetch'));
    useAuthStore.setState({
      session: { user: { id: 'auth-1' } } as never,
      currentUser: member('full'),
      reloadData,
    });

    const { unmount } = renderHook(() => useRealtimeSync());
    onStatus['task-access-profile-1']('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(300);
    expect(reloadData).toHaveBeenCalledTimes(1);

    // Signed out (or switched account) before the retry fires.
    act(() => useAuthStore.setState({ session: null, currentUser: null }));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(reloadData).toHaveBeenCalledTimes(1);
    unmount();
  });
});
