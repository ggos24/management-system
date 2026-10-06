import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member, Task, Team, TeamStatus } from '../types';
import * as db from '../lib/database';
import { DataReloadError, useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';

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

const team = (id: string): Team => ({ id, name: id, icon: 'Users', scheduleType: 'absence-only' });

const task = (id: string): Task => ({
  id,
  title: id,
  description: '',
  teamId: 'team-1',
  statusId: 'status-1',
  assigneeIds: [],
  priority: 'medium',
  dueDate: '2026-10-06',
  placements: [],
});

const statuses: Record<string, TeamStatus[]> = {
  'team-1': [{ id: 'status-1', name: 'In progress', category: 'active', sortOrder: 0 }],
};

/** Every fetch the full-access bundle issues resolves, as on a healthy network. */
function mockHealthyBundle(server: { tasks: Task[]; teams: Team[] }) {
  vi.spyOn(db, 'findProfileByAuthId').mockResolvedValue(profile);
  vi.spyOn(db, 'fetchTeams').mockResolvedValue(server.teams);
  vi.spyOn(db, 'fetchTasks').mockResolvedValue(server.tasks);
  vi.spyOn(db, 'fetchMembers').mockResolvedValue([profile]);
  vi.spyOn(db, 'fetchAbsences').mockResolvedValue([]);
  vi.spyOn(db, 'fetchShifts').mockResolvedValue([]);
  vi.spyOn(db, 'fetchLogs').mockResolvedValue([]);
  vi.spyOn(db, 'fetchTeamStatuses').mockResolvedValue(statuses);
  vi.spyOn(db, 'fetchTeamContentTypes').mockResolvedValue({});
  vi.spyOn(db, 'fetchPermissions').mockResolvedValue({});
  vi.spyOn(db, 'fetchCustomProperties').mockResolvedValue({});
  vi.spyOn(db, 'fetchPlacements').mockResolvedValue([]);
  vi.spyOn(db, 'fetchIntegrations').mockResolvedValue({});
  vi.spyOn(db, 'fetchDeletedTaskCount').mockResolvedValue(0);
  vi.spyOn(db, 'fetchTaskTeamLinks').mockResolvedValue([]);
  vi.spyOn(db, 'fetchTeamPlacements').mockResolvedValue({});
  vi.spyOn(db, 'fetchUserTeamOrders').mockResolvedValue({});
  vi.spyOn(db, 'fetchTeamHiddenColumns').mockResolvedValue([]);
  vi.spyOn(db, 'fetchTeamPersonFieldConfig').mockResolvedValue([]);
  vi.spyOn(db, 'fetchAllNotificationPreferences').mockResolvedValue([]);
  vi.spyOn(db, 'fetchTickets').mockResolvedValue([]);
  vi.spyOn(db, 'fetchTaskAccessContexts').mockResolvedValue([]);
  vi.spyOn(db, 'fetchEquipmentItems').mockResolvedValue([]);
  vi.spyOn(db, 'fetchEquipmentCheckouts').mockResolvedValue([]);
  vi.spyOn(db, 'fetchRecentEquipmentVerifications').mockResolvedValue([]);
  vi.spyOn(db, 'fetchTaskSubtasks').mockResolvedValue([]);
  vi.spyOn(db, 'purgeOldDeletedTasks').mockResolvedValue({ error: null });
  vi.spyOn(db, 'fetchNotifications').mockResolvedValue([]);
}

const networkError = () => new TypeError('Failed to fetch');

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  useAuthStore.setState({ session: { user: { id: 'auth-1' } } as never, currentUser: profile });
  // A tab that has been open for a while: the board is loaded.
  useDataStore.setState({
    tasks: [task('task-1'), task('task-2')],
    teams: [team('team-1')],
    teamStatuses: statuses,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().clearSessionState();
});

describe('session data reload', () => {
  it('keeps the loaded board when a reload fetch fails instead of emptying it', async () => {
    mockHealthyBundle({ tasks: [], teams: [] });
    vi.spyOn(db, 'fetchTasks').mockRejectedValue(networkError());
    vi.spyOn(db, 'fetchTeams').mockRejectedValue(networkError());
    vi.spyOn(db, 'fetchTeamStatuses').mockRejectedValue(networkError());

    const reload = useAuthStore.getState().reloadData();

    await expect(reload).rejects.toMatchObject({ name: 'DataReloadError', reason: 'partial' });
    const state = useDataStore.getState();
    expect(state.tasks.map((t) => t.id)).toEqual(['task-1', 'task-2']);
    expect(state.teams.map((t) => t.id)).toEqual(['team-1']);
    expect(state.teamStatuses).toEqual(statuses);
    // Slices that did load are still refreshed.
    expect(state.members).toEqual([profile]);
  });

  it('replaces the board with what the server returned when every fetch succeeds', async () => {
    mockHealthyBundle({ tasks: [task('task-3')], teams: [team('team-1'), team('team-2')] });

    await expect(useAuthStore.getState().reloadData()).resolves.toBe(true);

    const state = useDataStore.getState();
    expect(state.tasks.map((t) => t.id)).toEqual(['task-3']);
    expect(state.teams.map((t) => t.id)).toEqual(['team-1', 'team-2']);
  });

  it('still commits a genuinely empty task list', async () => {
    mockHealthyBundle({ tasks: [], teams: [team('team-1')] });

    await useAuthStore.getState().reloadData();

    expect(useDataStore.getState().tasks).toEqual([]);
  });

  it('reports a reload whose profile lookup failed and leaves the data untouched', async () => {
    mockHealthyBundle({ tasks: [], teams: [] });
    vi.spyOn(db, 'findProfileByAuthId').mockResolvedValue(null);

    const reload = useAuthStore.getState().reloadData();

    await expect(reload).rejects.toBeInstanceOf(DataReloadError);
    await expect(reload).rejects.toMatchObject({ reason: 'profile' });
    expect(useDataStore.getState().tasks.map((t) => t.id)).toEqual(['task-1', 'task-2']);
  });

  it('does not report a reload that a newer one superseded, even when its profile request fails', async () => {
    mockHealthyBundle({ tasks: [task('task-3')], teams: [team('team-1')] });
    let failFirstProfile!: () => void;
    vi.spyOn(db, 'findProfileByAuthId')
      // The superseded reload's request hangs on a dead socket, then fails —
      // findProfileByAuthId throws on request errors.
      .mockImplementationOnce(
        () => new Promise((_, reject) => (failFirstProfile = () => reject(new TypeError('Failed to fetch')))),
      )
      .mockResolvedValue(profile);

    const first = useAuthStore.getState().reloadData();
    const second = useAuthStore.getState().reloadData();
    await expect(second).resolves.toBe(true);
    failFirstProfile();

    await expect(first).resolves.toBe(false);
    expect(useDataStore.getState().tasks.map((t) => t.id)).toEqual(['task-3']);
  });

  it('does not report a reload superseded while its notifications load', async () => {
    mockHealthyBundle({ tasks: [task('task-3')], teams: [team('team-1')] });
    let releaseNotifications!: () => void;
    vi.spyOn(db, 'fetchNotifications')
      .mockImplementationOnce(() => new Promise((resolve) => (releaseNotifications = () => resolve([]))))
      .mockResolvedValue([]);

    const first = useAuthStore.getState().reloadData();
    await vi.waitFor(() => expect(releaseNotifications).toBeTypeOf('function'));
    // A newer reload takes over after the first one already committed its data.
    await expect(useAuthStore.getState().reloadData()).resolves.toBe(true);
    releaseNotifications();

    await expect(first).resolves.toBe(false);
  });

  it('does not keep slices loaded under a role the user no longer has', async () => {
    useAuthStore.setState({ currentUser: { ...profile, role: 'admin' } });
    useDataStore.setState({ tickets: [{ id: 'someone-elses-ticket' } as never] });
    mockHealthyBundle({ tasks: [], teams: [team('team-1')] });
    vi.spyOn(db, 'fetchTickets').mockRejectedValue(networkError());
    vi.spyOn(db, 'fetchTasks').mockRejectedValue(networkError());

    await expect(useAuthStore.getState().reloadData()).rejects.toMatchObject({ reason: 'partial' });

    expect(useDataStore.getState().tickets).toEqual([]);
    expect(useDataStore.getState().tasks).toEqual([]);
    expect(useAuthStore.getState().currentUser?.role).toBe('editor');
  });

  it('releases the loading screen when it commits the profile', async () => {
    useAuthStore.setState({ isLoading: true, isReconnecting: true });
    mockHealthyBundle({ tasks: [task('task-1')], teams: [team('team-1')] });

    await useAuthStore.getState().reloadData();

    expect(useAuthStore.getState()).toMatchObject({ isLoading: false, isReconnecting: false });
  });

  it('falls back to empty slices on the first load, when there is nothing to keep', async () => {
    useDataStore.getState().resetData();
    useAuthStore.setState({ currentUser: null });
    mockHealthyBundle({ tasks: [task('task-1')], teams: [team('team-1')] });
    vi.spyOn(db, 'fetchTasks').mockRejectedValue(networkError());

    await useAuthStore.getState().initData('auth-1');

    expect(useAuthStore.getState().currentUser).toEqual(profile);
    expect(useAuthStore.getState().profileError).toBeNull();
    expect(useDataStore.getState().tasks).toEqual([]);
    expect(useDataStore.getState().teams.map((t) => t.id)).toEqual(['team-1']);
  });
});
