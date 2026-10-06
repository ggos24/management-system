import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '../types';
import * as db from '../lib/database';
import { useAuthStore } from '../stores/authStore';
import { useDataStore, type DataLoadResult } from '../stores/dataStore';

const profile: Member = {
  id: 'profile-1',
  name: 'Editor',
  role: 'editor',
  accessScope: 'full',
  jobTitle: '',
  avatar: '',
  teamId: 'team-1',
  teamIds: ['team-1'],
  status: 'active',
};

const loaded: DataLoadResult = { profile, complete: true };
const networkError = () => new TypeError('Failed to fetch');
const originalLoadAllData = useDataStore.getState().loadAllData;

function mockLoads(...results: Array<DataLoadResult | Error>) {
  const loadAllData = vi.fn<typeof originalLoadAllData>();
  for (const result of results) {
    if (result instanceof Error) loadAllData.mockRejectedValueOnce(result);
    else loadAllData.mockResolvedValueOnce(result);
  }
  loadAllData.mockResolvedValue(loaded);
  useDataStore.setState({ loadAllData });
  return loadAllData;
}

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(db, 'fetchNotifications').mockResolvedValue([]);
  useAuthStore.getState().clearSessionState();
  useAuthStore.setState({ session: { user: { id: 'auth-1' } } as never, isLoading: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  useDataStore.setState({ loadAllData: originalLoadAllData });
  useAuthStore.getState().clearSessionState();
});

describe('first data load', () => {
  it('retries a profile request that failed on the network instead of showing an account error', async () => {
    const loadAllData = mockLoads(networkError());

    const init = useAuthStore.getState().initData('auth-1');
    await vi.advanceTimersByTimeAsync(0);
    expect(useAuthStore.getState()).toMatchObject({ isLoading: true, isReconnecting: true, profileError: null });

    await vi.advanceTimersByTimeAsync(2_000);
    await init;

    expect(loadAllData).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState()).toMatchObject({
      currentUser: profile,
      isLoading: false,
      isReconnecting: false,
      profileError: null,
    });
  });

  it('reports a load failure once the retries are used up, without blaming the account', async () => {
    const loadAllData = mockLoads(networkError(), networkError(), networkError(), networkError(), networkError());

    const init = useAuthStore.getState().initData('auth-1');
    await vi.advanceTimersByTimeAsync(2_000 + 4_000 + 8_000 + 16_000);
    await init;

    expect(loadAllData).toHaveBeenCalledTimes(5);
    expect(useAuthStore.getState()).toMatchObject({
      currentUser: null,
      isLoading: false,
      isReconnecting: false,
      profileError: 'Failed to load application data. Please try refreshing.',
    });
  });

  it('waits for the browser to come back online without using up retries', async () => {
    setOnline(false);
    const loadAllData = mockLoads(...Array.from({ length: 6 }, networkError));

    const init = useAuthStore.getState().initData('auth-1');
    // Five failures while offline, each followed by a long wait.
    for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(30_000);
    expect(loadAllData).toHaveBeenCalledTimes(5);
    expect(useAuthStore.getState()).toMatchObject({ isLoading: true, profileError: null });

    // Back online, and the first request still fails while the network settles:
    // the full set of retries is still there.
    setOnline(true);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(loadAllData).toHaveBeenCalledTimes(6);
    expect(useAuthStore.getState()).toMatchObject({ isLoading: true, profileError: null });

    await vi.advanceTimersByTimeAsync(2_000);
    await init;

    expect(loadAllData).toHaveBeenCalledTimes(7);
    expect(useAuthStore.getState()).toMatchObject({ currentUser: profile, profileError: null });
  });

  it('still says so right away when the account has no profile', async () => {
    const loadAllData = mockLoads({ profile: null, complete: false });

    await useAuthStore.getState().initData('auth-1');

    expect(loadAllData).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      isLoading: false,
      profileError: 'No profile found for this account. Please contact an administrator.',
    });
  });

  it('stops retrying once the user signs out', async () => {
    const loadAllData = mockLoads(networkError());

    const init = useAuthStore.getState().initData('auth-1');
    await vi.advanceTimersByTimeAsync(0);
    useAuthStore.getState().clearSessionState();
    await vi.advanceTimersByTimeAsync(60_000);
    await init;

    expect(loadAllData).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ session: null, currentUser: null, profileError: null });
  });

  it('does not make the next sign-in wait out a superseded retry delay', async () => {
    mockLoads(networkError());

    void useAuthStore.getState().initData('auth-1');
    await vi.advanceTimersByTimeAsync(0);
    // Signed out mid-retry, then straight back in.
    useAuthStore.getState().clearSessionState();
    useAuthStore.setState({ session: { user: { id: 'auth-1' } } as never, isLoading: true });
    let settled = false;
    void useAuthStore
      .getState()
      .initData('auth-1')
      .then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);

    expect(settled).toBe(true);
    expect(useAuthStore.getState().currentUser).toEqual(profile);
  });
});
